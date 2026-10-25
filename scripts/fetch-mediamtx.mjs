#!/usr/bin/env node
// Downloads the MediaMTX release binary the local camera server runs, into
// resources/mediamtx/<platform>-<arch>/ (gitignored). electron-builder ships that folder
// as <resources>/mediamtx/ and `npm run dev` uses it directly.
//
//   npm run fetch:mediamtx                 current platform
//   npm run fetch:mediamtx -- win32-x64    one or more targets
//   npm run fetch:mediamtx -- --all        every supported target
//
// Pinned to MEDIAMTX_VERSION in src/main/camera/mediamtx-process.ts; bump both together. A download that
// doesn't match its SHA-256 below is refused, and the error prints the new hash to pin after a version bump.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERSION = 'v1.21.2';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'resources', 'mediamtx');

// <node platform>-<node arch> → MediaMTX release asset suffix and its pinned SHA-256.
const TARGETS = {
  'win32-x64': ['windows_amd64.zip', 'a84224f5a490855684e62ba6fb71e80ea2a5e16aed61883bb58380290e93e467'],
  'darwin-x64': ['darwin_amd64.tar.gz', '87a00062b6a588aa1158f875504a3b56c80d62e2611dc450b83d0534e1b49198'],
  'darwin-arm64': ['darwin_arm64.tar.gz', '7d0d0c5c11527cbd10bde1c3d728864eb0334a9b653566cd73c0259750cbf093'],
  'linux-x64': ['linux_amd64.tar.gz', '121be6e00397e473a95d83c75f4fcd3819a6af3b0e1a50889cba43ab4fab6a27'],
  'linux-arm64': ['linux_arm64.tar.gz', '180a235374a548d9133cdd5e20f5dbd8b01317be1c86e0d7e66df585dc42ed6f']
};

function parseTargets(argv) {
  if (argv.includes('--all')) return Object.keys(TARGETS);
  const named = argv.filter((a) => !a.startsWith('--'));
  return named.length ? named : [`${process.platform}-${process.arch}`];
}

function extract(archive, dest) {
  if (archive.endsWith('.zip') && process.platform !== 'win32') {
    execFileSync('unzip', ['-o', '-q', archive, '-d', dest]);
  } else {
    // bsdtar (Windows 10+ and macOS) handles .zip too; GNU tar handles .tar.gz.
    execFileSync('tar', ['-xf', archive, '-C', dest]);
  }
}

async function fetchTarget(target) {
  if (!TARGETS[target]) throw new Error(`Unsupported target ${target}. Use one of: ${Object.keys(TARGETS).join(', ')}`);
  const [suffix, sha256] = TARGETS[target];
  const exe = target.startsWith('win32') ? 'mediamtx.exe' : 'mediamtx';
  const destDir = join(OUT, target);
  const stamp = join(destDir, 'VERSION');
  if (existsSync(join(destDir, exe)) && existsSync(stamp) && readFileSync(stamp, 'utf-8').trim() === VERSION) {
    console.log(`[mediamtx] ${target}: ${VERSION} already present`);
    return;
  }

  const asset = `mediamtx_${VERSION}_${suffix}`;
  const url = `https://github.com/bluenviron/mediamtx/releases/download/${VERSION}/${asset}`;
  console.log(`[mediamtx] ${target}: downloading ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const got = createHash('sha256').update(buf).digest('hex');
  if (got !== sha256) throw new Error(`${asset} checksum mismatch: expected ${sha256}, got ${got}`);

  const work = mkdtempSync(join(tmpdir(), 'mediamtx-'));
  try {
    const archive = join(work, asset);
    writeFileSync(archive, buf);
    const unpacked = join(work, 'x');
    mkdirSync(unpacked);
    extract(archive, unpacked);
    if (!existsSync(join(unpacked, exe))) throw new Error(`${asset} did not contain ${exe}`);
    rmSync(destDir, { recursive: true, force: true });
    mkdirSync(destDir, { recursive: true });
    copyFileSync(join(unpacked, exe), join(destDir, exe));
    // MediaMTX is MIT-licensed; ship its licence next to the binary.
    if (existsSync(join(unpacked, 'LICENSE'))) copyFileSync(join(unpacked, 'LICENSE'), join(destDir, 'LICENSE'));
    if (exe === 'mediamtx') chmodSync(join(destDir, exe), 0o755);
    writeFileSync(stamp, `${VERSION}\n`);
    console.log(`[mediamtx] ${target}: installed to ${destDir}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const targets = parseTargets(process.argv.slice(2));
for (const t of targets) {
  try {
    await fetchTarget(t);
  } catch (err) {
    console.error(`[mediamtx] ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}
