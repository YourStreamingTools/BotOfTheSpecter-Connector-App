// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  allowThroughFirewall, checkFirewall, firewalldAllows, linuxFixScript, macAppBundle, macFixScript, parseMacAppState, portsKey,
  psQuote, shQuote, windowsInstallerFirewall, winCheckScript, winFixScript, winRemoveScript, type ReadFile, type RunResult,
  type Runner
} from './firewall';

const targets = [
  { label: 'app', path: "/Applications/BotOfTheSpecter Desktop.app" },
  { label: 'camera server', path: "/Applications/BotOfTheSpecter Desktop.app/Contents/Resources/mediamtx/mediamtx" }
];
const ports = { tcp: [1935, 47830, 8889], udp: [8189, 8890] };
const mac = { targets, ports };

/** Fake runner answering socketfilterfw by flag. */
function macRunner(answers: Record<string, string>, calls: string[][] = []): Runner {
  return async (file, args) => {
    calls.push([file, ...args]);
    const flag = args[0];
    const out = flag === '--getappblocked' ? answers[`${flag} ${args[1]}`] ?? answers[flag] : answers[flag];
    return { code: 0, stdout: out ?? '', stderr: '' } satisfies RunResult;
  };
}

const MAC_ON = {
  '--getglobalstate': 'Firewall is enabled. (State = 1)',
  '--getblockall': 'Firewall has block all state set to disabled.',
  '--getallowsigned': 'Automatically allow built-in signed software ENABLED.\nAutomatically allow downloaded signed software ENABLED.'
};

describe('firewall (macOS)', () => {
  it('is ok when the firewall is off', async () => {
    const calls: string[][] = [];
    expect(await checkFirewall('darwin', mac, macRunner({ '--getglobalstate': 'Firewall is disabled. (State = 0)' }, calls))).toEqual({ state: 'ok' });
    expect(calls).toHaveLength(1);
  });

  it('is ok when signed software is allowed and the app is not listed', async () => {
    expect(await checkFirewall('darwin', mac, macRunner({ ...MAC_ON, '--getappblocked': 'The application is not part of the firewall' }))).toEqual({ state: 'ok' });
  });

  it('is blocked when the app is explicitly blocked', async () => {
    const res = await checkFirewall('darwin', mac, macRunner({
      ...MAC_ON,
      '--getappblocked': 'The application /Applications/BotOfTheSpecter Desktop.app is permitted',
      [`--getappblocked ${targets[1].path}`]: `The application ${targets[1].path} is blocked from accepting incoming connections`
    }));
    expect(res.state).toBe('blocked');
  });

  it('is blocked when block-all is on', async () => {
    const res = await checkFirewall('darwin', mac, macRunner({ ...MAC_ON, '--getblockall': 'Firewall has block all state set to enabled.' }));
    expect(res.state).toBe('blocked');
  });

  it('is blocked when unlisted and signed apps are not auto-allowed', async () => {
    const res = await checkFirewall('darwin', mac, macRunner({
      ...MAC_ON,
      '--getallowsigned': 'Automatically allow built-in signed software ENABLED.\nAutomatically allow downloaded signed software DISABLED.',
      '--getappblocked': 'The application is not part of the firewall'
    }));
    expect(res.state).toBe('blocked');
  });

  it('parses app states', () => {
    expect(parseMacAppState('The application /x.app is permitted to accept incoming connections')).toBe('allowed');
    expect(parseMacAppState('The application /x.app is blocked from accepting incoming connections')).toBe('blocked');
    expect(parseMacAppState('The application /x.app is not part of the firewall')).toBe('unlisted');
  });

  it('builds a fix script that adds and unblocks each program, quoting paths', () => {
    const script = macFixScript(targets);
    expect(script).toContain("--add '/Applications/BotOfTheSpecter Desktop.app'");
    expect(script).toContain("--unblockapp '/Applications/BotOfTheSpecter Desktop.app/Contents/Resources/mediamtx/mediamtx'");
    expect(script).toContain("grep -qi 'set to enabled' && /usr/libexec/ApplicationFirewall/socketfilterfw --setblockall off");
    expect(shQuote("it's")).toBe(`'it'\\''s'`);
  });

  it('runs the fix through osascript with administrator privileges, and reports a cancel', async () => {
    const calls: string[][] = [];
    await allowThroughFirewall('darwin', mac, async (file, args) => { calls.push([file, ...args]); return { code: 0, stdout: '', stderr: '' }; });
    expect(calls[0][0]).toBe('/usr/bin/osascript');
    expect(calls[0][2]).toMatch(/with administrator privileges$/);
    await expect(allowThroughFirewall('darwin', mac, async () => ({ code: 1, stdout: '', stderr: 'execution error: User canceled. (-128)' })))
      .rejects.toThrow(/cancelled/i);
  });

  it('finds the .app bundle from the executable path', () => {
    expect(macAppBundle('/Applications/BotOfTheSpecter Desktop.app/Contents/MacOS/BotOfTheSpecter Desktop')).toBe('/Applications/BotOfTheSpecter Desktop.app');
    expect(macAppBundle('/usr/local/bin/electron')).toBe('/usr/local/bin/electron');
  });
});

describe('firewall (Windows)', () => {
  const win = [{ label: 'app', path: "C:\\Users\\O'Brien\\AppData\\Local\\Programs\\botofthespecter-desktop\\BotOfTheSpecter Desktop.exe" }];
  const winOpts = { targets: win, ports };
  const runJson = (json: unknown): Runner => async () => ({ code: 0, stdout: JSON.stringify(json), stderr: '' });

  it('is ok when every profile is off', async () => {
    expect(await checkFirewall('win32', winOpts, runJson({ on: false, progs: [{ block: true, ours: false }] }))).toEqual({ state: 'ok' });
  });

  it('is blocked when our rule is missing or a block rule exists', async () => {
    expect((await checkFirewall('win32', winOpts, runJson({ on: true, progs: { block: false, ours: false } }))).state).toBe('blocked');
    expect((await checkFirewall('win32', winOpts, runJson({ on: true, progs: [{ block: true, ours: true }] }))).state).toBe('blocked');
    expect(await checkFirewall('win32', winOpts, runJson({ on: true, progs: [{ block: false, ours: true }] }))).toEqual({ state: 'ok' });
  });

  it('is unknown when PowerShell fails', async () => {
    expect(await checkFirewall('win32', winOpts, async () => ({ code: 1, stdout: '', stderr: 'boom' }))).toEqual({ state: 'unknown' });
  });

  it('quotes paths for PowerShell and allows every network profile', () => {
    expect(psQuote("O'Brien")).toBe("'O''Brien'");
    expect(winCheckScript(win)).toContain("O''Brien");
    const fix = winFixScript(win);
    expect(fix).toContain("$_.Action -eq 'Block' } | Remove-NetFirewallRule");
    expect(fix).toContain('-Profile Any');
  });

  it('reports a declined UAC prompt as cancelled', async () => {
    await expect(allowThroughFirewall('win32', winOpts, async () => ({ code: 1223, stdout: '', stderr: '' }))).rejects.toThrow(/cancelled/i);
  });
});

describe('firewall (Windows installer)', () => {
  const win = [
    { label: 'app', path: 'C:\\Apps\\botofthespecter-desktop.exe' },
    { label: 'camera server', path: 'C:\\Apps\\resources\\mediamtx\\mediamtx.exe' }
  ];
  /** First call is the read-only check (answers `state`), later calls are the elevated run (exit `elevated`). */
  function installerRunner(state: unknown, elevated = 0, calls: string[][] = []): Runner {
    return async (file, args) => {
      calls.push([file, ...args]);
      return calls.length === 1 ? { code: 0, stdout: JSON.stringify(state), stderr: '' } : { code: elevated, stdout: '', stderr: '' };
    };
  }
  const decode = (call: string[]): string => Buffer.from(call[call.length - 1], 'base64').toString('utf16le');

  it('adds the rules when they are missing', async () => {
    const calls: string[][] = [];
    expect(await windowsInstallerFirewall('allow', win, installerRunner({ on: true, progs: [{ block: false, ours: false }, { block: false, ours: true }] }, 0, calls))).toBe(0);
    expect(calls).toHaveLength(2);
    expect(decode(calls[1])).toContain('-Verb RunAs');
  });

  it('skips the UAC prompt on updates when the rules are already in place', async () => {
    const calls: string[][] = [];
    await windowsInstallerFirewall('allow', win, installerRunner({ on: true, progs: [{ block: false, ours: true }, { block: false, ours: true }] }, 0, calls));
    expect(calls).toHaveLength(1);
  });

  it('never fails the install when the UAC prompt is declined', async () => {
    expect(await windowsInstallerFirewall('allow', win, installerRunner({ on: true, progs: [{ block: true, ours: false }] }, 1223))).toBe(0);
  });

  it('removes our rules on uninstall, and does nothing when there are none', async () => {
    const calls: string[][] = [];
    await windowsInstallerFirewall('remove', win, installerRunner({ on: true, progs: [{ block: false, ours: true }, { block: false, ours: false }] }, 0, calls));
    expect(calls).toHaveLength(2);
    const none: string[][] = [];
    await windowsInstallerFirewall('remove', win, installerRunner({ on: true, progs: [{ block: false, ours: false }, { block: false, ours: false }] }, 0, none));
    expect(none).toHaveLength(1);
  });

  it('removes only rules with our names', () => {
    const script = winRemoveScript(win);
    expect(script).toContain("'BotOfTheSpecter Desktop - phone cameras (app)'");
    expect(script).toContain("'BotOfTheSpecter Desktop - phone cameras (camera server)'");
    expect(script).toContain('Remove-NetFirewallRule -DisplayName $x.n');
  });
});

describe('firewall (Linux)', () => {
  const linux = { targets, ports };
  const noFile: ReadFile = async () => null;
  const ufwOn: ReadFile = async (path) => (path === '/etc/ufw/ufw.conf' ? '# comment\nENABLED=yes\nLOGLEVEL=low\n' : null);

  /** Answers firewall-cmd by its first flag; anything else exits `other`. */
  function linuxRunner(fwd: { state?: string; ports?: string } | null, other = 0, calls: string[][] = []): Runner {
    return async (file, args) => {
      calls.push([file, ...args]);
      if (file === 'firewall-cmd') {
        if (!fwd) return { code: -1, stdout: '', stderr: 'ENOENT: spawn firewall-cmd ENOENT' };
        if (args[0] === '--state') return fwd.state === 'running' ? { code: 0, stdout: 'running\n', stderr: '' } : { code: 252, stdout: 'not running\n', stderr: '' };
        if (args[0] === '--list-ports') return { code: 0, stdout: `${fwd.ports ?? ''}\n`, stderr: '' };
      }
      return { code: other, stdout: '', stderr: '' };
    };
  }

  it('is ok when no firewall is running', async () => {
    expect(await checkFirewall('linux', linux, linuxRunner(null), noFile)).toEqual({ state: 'ok' });
    expect(await checkFirewall('linux', linux, linuxRunner({ state: 'not running' }), noFile)).toEqual({ state: 'ok' });
  });

  it('checks firewalld ports, including ranges', async () => {
    expect((await checkFirewall('linux', linux, linuxRunner({ state: 'running', ports: '1935/tcp 47830/tcp' }), noFile)).state).toBe('blocked');
    expect(await checkFirewall('linux', linux, linuxRunner({ state: 'running', ports: '1935/tcp 8889/tcp 47830/tcp 8189-8890/udp' }), noFile)).toEqual({ state: 'ok' });
    expect(firewalldAllows('1025-65535/tcp', 47830, 'tcp')).toBe(true);
    expect(firewalldAllows('1025-65535/tcp', 8890, 'udp')).toBe(false);
  });

  it('treats ufw as blocked until we opened these ports', async () => {
    expect((await checkFirewall('linux', linux, linuxRunner(null), ufwOn)).state).toBe('blocked');
    expect(await checkFirewall('linux', { ...linux, linuxApplied: portsKey(ports) }, linuxRunner(null), ufwOn)).toEqual({ state: 'ok' });
    // Changing a port in the app needs the fix again.
    expect((await checkFirewall('linux', { ...linux, ports: { ...ports, tcp: [1936, 47830, 8889] }, linuxApplied: portsKey(ports) }, linuxRunner(null), ufwOn)).state).toBe('blocked');
  });

  it('builds the fix scripts', () => {
    expect(linuxFixScript('ufw', ports)).toBe('ufw allow 1935/tcp && ufw allow 47830/tcp && ufw allow 8889/tcp && ufw allow 8189/udp && ufw allow 8890/udp');
    const fwd = linuxFixScript('firewalld', ports);
    expect(fwd).toContain('firewall-cmd --permanent --add-port=8890/udp');
    expect(fwd.endsWith('firewall-cmd --reload')).toBe(true);
  });

  it('runs the fix through pkexec and reports a cancel', async () => {
    const calls: string[][] = [];
    await allowThroughFirewall('linux', linux, linuxRunner(null, 0, calls), ufwOn);
    expect(calls.at(-1)?.slice(0, 3)).toEqual(['pkexec', '/bin/sh', '-c']);
    await expect(allowThroughFirewall('linux', linux, linuxRunner(null, 126), ufwOn)).rejects.toThrow(/cancelled/i);
    await expect(allowThroughFirewall('linux', linux, linuxRunner(null, 127), ufwOn)).rejects.toThrow(/permission/i);
  });
});

describe('firewall (other platforms)', () => {
  it('is unknown elsewhere', async () => {
    expect(await checkFirewall('freebsd', mac, async () => ({ code: 0, stdout: '', stderr: '' }))).toEqual({ state: 'unknown' });
  });
});
