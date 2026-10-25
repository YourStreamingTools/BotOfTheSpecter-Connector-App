#!/usr/bin/env node
// Runs `npm install` when node_modules is missing or older than package.json / package-lock.json
// (for example after a git pull that added a dependency). Used by run.bat, run.sh, build.bat and
// build.sh, so it must not import any packages.
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, utimesSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// npm writes this hidden lockfile on every install, so its age is the age of node_modules.
const installed = join(ROOT, 'node_modules', '.package-lock.json');

function mtime(file) {
  return existsSync(file) ? statSync(file).mtimeMs : 0;
}

const reason = !existsSync(join(ROOT, 'node_modules'))
  ? 'node_modules not found'
  : Math.max(mtime(join(ROOT, 'package.json')), mtime(join(ROOT, 'package-lock.json'))) > mtime(installed)
    ? 'dependencies changed since the last install'
    : null;

if (reason) {
  console.log(`${reason} - installing dependencies (may take a minute)...`);
  const isWin = process.platform === 'win32';
  const res = spawnSync(isWin ? 'npm.cmd' : 'npm', ['install'], { cwd: ROOT, stdio: 'inherit', shell: isWin });
  if (res.status !== 0) {
    console.error('\n[ERROR] npm install failed - see the messages above.');
    process.exit(res.status || 1);
  }
  // npm leaves the hidden lockfile alone when nothing changed; touch it so the next run skips the install.
  if (existsSync(installed)) {
    const now = new Date();
    utimesSync(installed, now, now);
  }
  console.log();
}
