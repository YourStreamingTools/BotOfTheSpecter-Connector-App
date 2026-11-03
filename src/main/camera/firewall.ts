import { execFile } from 'child_process';
import { readFile } from 'fs/promises';
import type { CameraFirewall } from '@shared/ipc';

/**
 * Checks whether the OS firewall lets phones reach the camera server, and fixes it behind the system's own
 * admin prompt (macOS password dialog / Windows UAC / Linux polkit) so users never have to find firewall
 * settings or ports. macOS and Windows allow the programs; Linux firewalls (ufw, firewalld) are port-based.
 */

export interface RunResult { code: number; stdout: string; stderr: string }
export type Runner = (file: string, args: string[]) => Promise<RunResult>;

export const defaultRunner: Runner = (file, args) => new Promise((resolve) => {
  execFile(file, args, { windowsHide: true, timeout: 120_000, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
    if (!err) return resolve({ code: 0, stdout: String(stdout), stderr: String(stderr) });
    const errCode = (err as NodeJS.ErrnoException).code as unknown;
    // A string code means the program never ran (e.g. ENOENT: not installed); keep it in stderr.
    if (typeof errCode === 'string') return resolve({ code: -1, stdout: '', stderr: `${errCode}: ${err.message}` });
    resolve({ code: typeof errCode === 'number' ? errCode : 1, stdout: String(stdout), stderr: String(stderr) });
  });
});

export interface FirewallTarget {
  /** Shown in Windows Firewall rule names. */
  label: string;
  /** Program that listens: the app (macOS: its .app bundle) and the MediaMTX binary. */
  path: string;
}

export interface FirewallPorts { tcp: number[]; udp: number[] }

export interface FirewallOptions {
  targets: FirewallTarget[];
  /** Ports the camera server listens on (Linux only). */
  ports: FirewallPorts;
  /** Ports key from a previous successful Linux fix: ufw's rules can't be read without root. */
  linuxApplied?: string;
}

/** Stable key for a set of ports, stored after a Linux fix. */
export function portsKey(p: FirewallPorts): string {
  return [...p.tcp.map((n) => `${n}/tcp`), ...p.udp.map((n) => `${n}/udp`)].sort().join(',');
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

/** Run elevated (uninstaller): remove the rules we added. */
export function winRemoveScript(targets: FirewallTarget[]): string {
  return [
    `foreach ($x in ${psTargets(targets)}) {`,
    `  Remove-NetFirewallRule -DisplayName $x.n -ErrorAction SilentlyContinue`,
    `}`
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

interface WinState { on: boolean; progs: { block: boolean; ours: boolean }[] }

async function readWin(targets: FirewallTarget[], run: Runner): Promise<WinState | null> {
  const r = await run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePs(winCheckScript(targets))]);
  if (r.code !== 0) return null;
  try {
    const res = JSON.parse(r.stdout.trim()) as { on: boolean; progs: WinState['progs'] | WinState['progs'][number] };
    return { on: !!res.on, progs: Array.isArray(res.progs) ? res.progs : [res.progs] };
  } catch {
    return null;
  }
}

async function checkWin(targets: FirewallTarget[], run: Runner): Promise<CameraFirewall> {
  const res = await readWin(targets, run);
  if (!res) return UNKNOWN;
  if (!res.on) return OK;
  if (res.progs.some((p) => p.block || !p.ours)) {
    return { state: 'blocked', message: 'Windows Firewall may be blocking the camera server, so phones can\'t connect.' };
  }
  return OK;
}

async function fixWin(targets: FirewallTarget[], run: Runner): Promise<void> {
  await runElevatedWin(winFixScript(targets), run);
}

/** Runs a script in an elevated PowerShell behind one UAC prompt. */
async function runElevatedWin(script: string, run: Runner): Promise<void> {
  const outer = [
    `try {`,
    `  $p = Start-Process -FilePath powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${encodePs(script)}'`,
    `  exit $p.ExitCode`,
    `} catch { Write-Error 'cancelled'; exit 1223 }`
  ].join('\n');
  const r = await run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodePs(outer)]);
  if (r.code === 1223) throw new Error('Cancelled, so the firewall was not changed.');
  if (r.code !== 0) throw new Error(`Could not update the firewall: ${r.stderr.trim() || `exit ${r.code}`}`);
}

/**
 * For the Windows installer: add our rules unless they are already in place (so updates don't prompt again),
 * or remove them on uninstall. Returns a process exit code.
 */
export async function windowsInstallerFirewall(action: 'allow' | 'remove', targets: FirewallTarget[], run: Runner = defaultRunner): Promise<number> {
  try {
    const st = await readWin(targets, run);
    if (action === 'allow') {
      if (st && st.progs.every((p) => p.ours && !p.block)) return 0;
      await runElevatedWin(winFixScript(targets), run);
    } else {
      if (st && !st.progs.some((p) => p.ours)) return 0;
      await runElevatedWin(winRemoveScript(targets), run);
    }
    return 0;
  } catch {
    // A declined UAC prompt must not fail the install; the Cameras screen offers the fix later.
    return 0;
  }
}

// ---------- Linux ----------

const UFW_CONF = '/etc/ufw/ufw.conf';

/** Parses `firewall-cmd --list-ports` ("1025-65535/tcp 8080/tcp") and says whether port/proto is open. */
export function firewalldAllows(listPorts: string, port: number, proto: 'tcp' | 'udp'): boolean {
  return listPorts.split(/\s+/).filter(Boolean).some((entry) => {
    const m = /^(\d+)(?:-(\d+))?\/(tcp|udp)$/.exec(entry);
    if (!m || m[3] !== proto) return false;
    const lo = Number(m[1]);
    const hi = m[2] ? Number(m[2]) : lo;
    return port >= lo && port <= hi;
  });
}

function allPorts(p: FirewallPorts): { port: number; proto: 'tcp' | 'udp' }[] {
  return [...p.tcp.map((port) => ({ port, proto: 'tcp' as const })), ...p.udp.map((port) => ({ port, proto: 'udp' as const }))];
}

export type ReadFile = (path: string) => Promise<string | null>;
const defaultReadFile: ReadFile = (path) => readFile(path, 'utf-8').catch(() => null);

type LinuxFirewall = 'firewalld' | 'ufw' | null;

async function detectLinux(run: Runner, read: ReadFile): Promise<LinuxFirewall> {
  const fwd = await run('firewall-cmd', ['--state']);
  if (fwd.code === 0 && /running/i.test(fwd.stdout)) return 'firewalld';
  // `ufw status` needs root; its config file doesn't.
  const conf = await read(UFW_CONF);
  if (conf && /^\s*ENABLED\s*=\s*yes/mi.test(conf)) return 'ufw';
  return null;
}

const LINUX_BLOCKED: CameraFirewall = { state: 'blocked', message: 'Your firewall is blocking the camera server, so phones can\'t connect.' };

async function checkLinux(opts: FirewallOptions, run: Runner, read: ReadFile): Promise<CameraFirewall> {
  const fw = await detectLinux(run, read);
  if (!fw) return OK;
  if (fw === 'ufw') return opts.linuxApplied === portsKey(opts.ports) ? OK : LINUX_BLOCKED;
  const list = await run('firewall-cmd', ['--list-ports']);
  if (list.code !== 0) return UNKNOWN;
  return allPorts(opts.ports).every((p) => firewalldAllows(list.stdout, p.port, p.proto)) ? OK : LINUX_BLOCKED;
}

/** The shell script run as root (via pkexec) on Linux. */
export function linuxFixScript(fw: 'firewalld' | 'ufw', ports: FirewallPorts): string {
  const list = allPorts(ports);
  if (fw === 'ufw') return list.map((p) => `ufw allow ${p.port}/${p.proto}`).join(' && ');
  return [...list.map((p) => `firewall-cmd --permanent --add-port=${p.port}/${p.proto}`), 'firewall-cmd --reload'].join(' && ');
}

async function fixLinux(opts: FirewallOptions, run: Runner, read: ReadFile): Promise<void> {
  const fw = await detectLinux(run, read);
  if (!fw) return;
  // pkexec shows the desktop's own password prompt.
  const r = await run('pkexec', ['/bin/sh', '-c', linuxFixScript(fw, opts.ports)]);
  // pkexec: 126 = the password dialog was dismissed, 127 = not authorised.
  if (r.code === 126) throw new Error('Cancelled, so the firewall was not changed.');
  if (/^ENOENT/.test(r.stderr)) throw new Error('Could not ask for your password (pkexec is missing), so the firewall was not changed.');
  if (r.code === 127) throw new Error('Permission was not given, so the firewall was not changed.');
  if (r.code !== 0) throw new Error(`Could not update the firewall: ${r.stderr.trim() || `exit ${r.code}`}`);
}

// ---------- entry points ----------

export async function checkFirewall(platform: NodeJS.Platform, opts: FirewallOptions, run: Runner = defaultRunner, read: ReadFile = defaultReadFile): Promise<CameraFirewall> {
  try {
    if (platform === 'darwin') return await checkMac(opts.targets, run);
    if (platform === 'win32') return await checkWin(opts.targets, run);
    if (platform === 'linux') return await checkLinux(opts, run, read);
  } catch {
    // fall through
  }
  return UNKNOWN;
}

export async function allowThroughFirewall(platform: NodeJS.Platform, opts: FirewallOptions, run: Runner = defaultRunner, read: ReadFile = defaultReadFile): Promise<void> {
  if (platform === 'darwin') return fixMac(opts.targets, run);
  if (platform === 'win32') return fixWin(opts.targets, run);
  if (platform === 'linux') return fixLinux(opts, run, read);
  throw new Error('Firewall changes are not supported on this system');
}
