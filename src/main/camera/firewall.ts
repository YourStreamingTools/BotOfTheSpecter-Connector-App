import { execFile } from 'child_process';
import type { CameraFirewall } from '@shared/ipc';

/**
 * Checks whether the OS firewall lets phones reach the camera server, and fixes it behind the system's own
 * admin prompt (macOS password dialog / Windows UAC) so users never have to find firewall settings or ports.
 */

export interface RunResult { code: number; stdout: string; stderr: string }
export type Runner = (file: string, args: string[]) => Promise<RunResult>;

export const defaultRunner: Runner = (file, args) => new Promise((resolve) => {
  execFile(file, args, { windowsHide: true, timeout: 120_000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
    const code = err ? (typeof (err as NodeJS.ErrnoException).code === 'number' ? Number((err as NodeJS.ErrnoException).code) : 1) : 0;
    resolve({ code, stdout: String(stdout), stderr: String(stderr) });
  });
});

export interface FirewallTarget {
  /** Shown in Windows Firewall rule names. */
  label: string;
  /** Program that listens: the app (macOS: its .app bundle) and the MediaMTX binary. */
  path: string;
}

export const WIN_RULE_PREFIX = 'BotOfTheSpecter Desktop - phone cameras';
const SOCKETFILTERFW = '/usr/libexec/ApplicationFirewall/socketfilterfw';

const OK: CameraFirewall = { state: 'ok' };
const UNKNOWN: CameraFirewall = { state: 'unknown' };

/** The .app bundle that contains this executable (macOS), so the firewall entry covers the whole app. */
export function macAppBundle(execPath: string): string {
  const i = execPath.indexOf('.app/');
  return i >= 0 ? execPath.slice(0, i + 4) : execPath;
}

// ---------- macOS ----------

export function parseMacAppState(out: string): 'allowed' | 'blocked' | 'unlisted' {
  if (/not part of the firewall/i.test(out)) return 'unlisted';
  if (/blocked/i.test(out)) return 'blocked';
  return 'allowed';
}

async function checkMac(targets: FirewallTarget[], run: Runner): Promise<CameraFirewall> {
  const global = await run(SOCKETFILTERFW, ['--getglobalstate']);
  if (global.code !== 0) return UNKNOWN;
  if (!/enabled/i.test(global.stdout)) return OK;

  const blockAll = await run(SOCKETFILTERFW, ['--getblockall']);
  if (/block all state set to enabled|block all .*enabled/i.test(blockAll.stdout) && !/disabled/i.test(blockAll.stdout)) {
    return { state: 'blocked', message: 'Your Mac\'s firewall is blocking all incoming connections, so phones can\'t reach the camera server.' };
  }

  const signed = await run(SOCKETFILTERFW, ['--getallowsigned']);
  // "Automatically allow downloaded signed software ENABLED" covers our signed app and MediaMTX.
  const allowsDownloadedSigned = /downloaded signed software enabled/i.test(signed.stdout);
  for (const t of targets) {
    const r = await run(SOCKETFILTERFW, ['--getappblocked', t.path]);
    const state = parseMacAppState(r.stdout);
    if (state === 'blocked' || (state === 'unlisted' && !allowsDownloadedSigned)) {
      return { state: 'blocked', message: 'Your Mac\'s firewall is blocking the camera server, so phones can\'t connect.' };
    }
  }
  return OK;
}

/** Single-quoted for /bin/sh. */
export function shQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** The shell script run as admin on macOS. */
export function macFixScript(targets: FirewallTarget[]): string {
  // Only turn off "Block all incoming connections" when it is on.
  const cmds = [`{ ${SOCKETFILTERFW} --getblockall | grep -qi 'set to enabled' && ${SOCKETFILTERFW} --setblockall off || true; }`];
  for (const t of targets) {
    cmds.push(`${SOCKETFILTERFW} --add ${shQuote(t.path)}`, `${SOCKETFILTERFW} --unblockapp ${shQuote(t.path)}`);
  }
  return cmds.join(' && ');
}

/** AppleScript string literal. */
function asQuote(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

async function fixMac(targets: FirewallTarget[], run: Runner): Promise<void> {
  const script = `do shell script ${asQuote(macFixScript(targets))} with prompt ${asQuote('BotOfTheSpecter Desktop wants to let phone cameras on your Wi-Fi connect.')} with administrator privileges`;
  const r = await run('/usr/bin/osascript', ['-e', script]);
  if (r.code !== 0) {
    if (/-128|cancel/i.test(r.stderr)) throw new Error('Cancelled, so the firewall was not changed.');
    throw new Error(`Could not update the firewall: ${r.stderr.trim() || 'unknown error'}`);
  }
}

// ---------- Windows ----------

/** Single-quoted PowerShell string. */
export function psQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function psTargets(targets: FirewallTarget[]): string {
  return `@(${targets.map((t) => `@{ n = ${psQuote(`${WIN_RULE_PREFIX} (${t.label})`)}; p = ${psQuote(t.path)} }`).join(', ')})`;
}

/** Read-only check (no admin): is any profile on, and does each program have our allow rule and no block rule? */
export function winCheckScript(targets: FirewallTarget[]): string {
  return [
    `$on = @(Get-NetFirewallProfile | Where-Object { $_.Enabled -eq 'True' }).Count -gt 0`,
    `$progs = foreach ($x in ${psTargets(targets)}) {`,
    `  $rules = @(Get-NetFirewallApplicationFilter -Program $x.p -ErrorAction SilentlyContinue | Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.Direction -eq 'Inbound' -and $_.Enabled -eq 'True' })`,
    `  [pscustomobject]@{ block = @($rules | Where-Object { $_.Action -eq 'Block' }).Count -gt 0; ours = @($rules | Where-Object { $_.DisplayName -eq $x.n -and $_.Action -eq 'Allow' }).Count -gt 0 }`,
    `}`,
    `@{ on = $on; progs = @($progs) } | ConvertTo-Json -Compress -Depth 4`
  ].join('\n');
}

/**
 * Run elevated: drop the Block rules Windows made if someone pressed Cancel on its firewall popup
 * (Block beats Allow), then add our own Allow rule for every network type, since home Wi-Fi is often "Public".
 */
export function winFixScript(targets: FirewallTarget[]): string {
  return [
    `$ErrorActionPreference = 'Stop'`,
    `foreach ($x in ${psTargets(targets)}) {`,
    `  Get-NetFirewallApplicationFilter -Program $x.p -ErrorAction SilentlyContinue | Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.Direction -eq 'Inbound' -and $_.Action -eq 'Block' } | Remove-NetFirewallRule`,
    `  Remove-NetFirewallRule -DisplayName $x.n -ErrorAction SilentlyContinue`,
    `  New-NetFirewallRule -DisplayName $x.n -Direction Inbound -Action Allow -Program $x.p -Profile Any | Out-Null`,
    `}`
  ].join('\n');
}

function encodePs(script: string): string {
  return Buffer.from(script, 'utf16le').toString('base64');
}

const POWERSHELL = 'powershell.exe';

async function checkWin(targets: FirewallTarget[], run: Runner): Promise<CameraFirewall> {
  const r = await run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePs(winCheckScript(targets))]);
  if (r.code !== 0) return UNKNOWN;
  try {
    const res = JSON.parse(r.stdout.trim()) as { on: boolean; progs: { block: boolean; ours: boolean }[] | { block: boolean; ours: boolean } };
    if (!res.on) return OK;
    const progs = Array.isArray(res.progs) ? res.progs : [res.progs];
    if (progs.some((p) => p.block || !p.ours)) {
      return { state: 'blocked', message: 'Windows Firewall may be blocking the camera server, so phones can\'t connect.' };
    }
    return OK;
  } catch {
    return UNKNOWN;
  }
}

async function fixWin(targets: FirewallTarget[], run: Runner): Promise<void> {
  // One UAC prompt: an elevated PowerShell runs the fix script.
  const outer = [
    `try {`,
    `  $p = Start-Process -FilePath powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encodePs(winFixScript(targets))}'`,
    `  exit $p.ExitCode`,
    `} catch { Write-Error 'cancelled'; exit 1223 }`
  ].join('\n');
  const r = await run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePs(outer)]);
  if (r.code === 1223) throw new Error('Cancelled, so the firewall was not changed.');
  if (r.code !== 0) throw new Error(`Could not update the firewall: ${r.stderr.trim() || `exit ${r.code}`}`);
}

// ---------- entry points ----------

export async function checkFirewall(platform: NodeJS.Platform, targets: FirewallTarget[], run: Runner = defaultRunner): Promise<CameraFirewall> {
  try {
    if (platform === 'darwin') return await checkMac(targets, run);
    if (platform === 'win32') return await checkWin(targets, run);
  } catch {
    // fall through
  }
  return UNKNOWN;
}

export async function allowThroughFirewall(platform: NodeJS.Platform, targets: FirewallTarget[], run: Runner = defaultRunner): Promise<void> {
  if (platform === 'darwin') return fixMac(targets, run);
  if (platform === 'win32') return fixWin(targets, run);
  throw new Error('Firewall changes are only supported on Windows and macOS');
}
