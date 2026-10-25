#!/usr/bin/env node
// Release build for Windows + Linux, run by build.bat (Windows) and build.sh (macOS/Linux).
//
//   node scripts/build.mjs              typecheck + tests, then Windows and Linux packages
//   node scripts/build.mjs --skip-checks   skip typecheck/tests
//   node scripts/build.mjs --win        Windows only
//   node scripts/build.mjs --linux      Linux only
//
// Output in dist/:
//   Windows  botofthespecter-desktop-<v>-setup.exe, botofthespecter-desktop-<v>-portable.exe
//   Linux    botofthespecter-desktop-<v>-linux-x64.tar.gz (any host), botofthespecter-desktop-<v>.AppImage (Linux/macOS host)
//
// Windows installers need Windows, or Wine on macOS/Linux. The Linux tar.gz is packed here (not by
// electron-builder) so executables keep their +x bit even when built on Windows. macOS builds are
// separate: see build.sh --mac.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { create as tarCreate } from 'tar';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const isWin = process.platform === 'win32';
const npm = isWin ? 'npm.cmd' : 'npm';
const npx = isWin ? 'npx.cmd' : 'npx';
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf-8'));

const args = process.argv.slice(2);
const only = args.includes('--win') ? 'win' : args.includes('--linux') ? 'linux' : 'both';
const skipChecks = args.includes('--skip-checks');

function step(title) {
  console.log(`\n=== ${title} ===`);
}

function run(cmd, cmdArgs) {
  console.log(`> ${cmd} ${cmdArgs.join(' ')}`);
  // shell is needed on Windows to run the .cmd shims.
  const res = spawnSync(cmd, cmdArgs, { cwd: ROOT, stdio: 'inherit', shell: isWin });
  if (res.status !== 0) {
    console.error(`\n[build] "${cmd} ${cmdArgs.join(' ')}" failed (exit ${res.status ?? res.signal}).`);
    process.exit(res.status || 1);
  }
}

function hasWine() {
  try {
    execFileSync('wine', ['--version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/** Linux executables that must keep +x in the archive. */
function isLinuxExecutable(rel) {
  const name = rel.split('/').pop();
  return name === pkg.name || name === 'chrome-sandbox' || name === 'chrome_crashpad_handler'
    || rel === 'resources/mediamtx/mediamtx' || /\.so(\.\d+)*$/.test(name);
}

async function packLinuxTarGz(unpackedDir, outFile) {
  const prefix = `${pkg.name}-${pkg.version}`;
  await tarCreate({
    file: outFile,
    gzip: { level: 9 },
    portable: true,
    cwd: unpackedDir,
    prefix,
    // Fixed modes so the archive is right whether it was built on Windows (no +x) or Linux.
    // node-tar writes the header from this stat object, so setting mode here sets it in the archive.
    filter(path, stat) {
      const rel = path.replace(/\\/g, '/').replace(/^\.\//, '');
      if (stat.isDirectory()) stat.mode = 0o40755;
      else if (stat.isFile()) stat.mode = 0o100000 | (isLinuxExecutable(rel) ? 0o755 : 0o644);
      return true;
    }
  }, readdirSync(unpackedDir));
}

const wantWin = only !== 'linux';
const wantLinux = only !== 'win';
const winPossible = isWin || hasWine();

if (!existsSync(join(ROOT, 'node_modules'))) {
  step('Installing dependencies');
  run(npm, ['install']);
}

if (!skipChecks) {
  step('Typecheck');
  run(npm, ['run', 'typecheck']);
  step('Tests');
  run(npm, ['test']);
}

step('Camera server (MediaMTX)');
const targets = [];
if (wantWin && winPossible) targets.push('win32-x64');
if (wantLinux) targets.push('linux-x64');
run('node', ['scripts/fetch-mediamtx.mjs', ...targets]);

step('Compile app');
run(npm, ['run', 'build']);

rmSync(DIST, { recursive: true, force: true });
const built = [];

if (wantWin) {
  if (winPossible) {
    step('Windows: setup + portable');
    run(npx, ['electron-builder', '--win', '--x64', '--publish', 'never']);
    built.push('Windows');
  } else {
    console.warn('\n[build] Skipping Windows: building Windows installers on macOS/Linux needs Wine '
      + '(https://www.winehq.org). Install it, or run build.bat on a Windows PC.');
  }
}

if (wantLinux) {
  const linuxTargets = isWin ? ['dir'] : ['dir', 'AppImage'];
  step(`Linux: ${isWin ? 'tar.gz' : 'AppImage + tar.gz'}`);
  run(npx, ['electron-builder', '--linux', ...linuxTargets, '--x64', '--publish', 'never']);
  const tarFile = join(DIST, `${pkg.name}-${pkg.version}-linux-x64.tar.gz`);
  console.log(`> pack ${tarFile}`);
  await packLinuxTarGz(join(DIST, 'linux-unpacked'), tarFile);
  if (isWin) console.log('[build] AppImage needs a Linux or macOS host; built the tar.gz only.');
  built.push('Linux');
}

step('Done');
const artifacts = existsSync(DIST)
  ? readdirSync(DIST).filter((f) => /\.(exe|AppImage|tar\.gz)$/.test(f))
  : [];
for (const f of artifacts) {
  const mb = (statSync(join(DIST, f)).size / 1024 / 1024).toFixed(1);
  console.log(`  dist/${f}  (${mb} MB)`);
}
if (!built.length) {
  console.error('[build] Nothing was built.');
  process.exit(1);
}
