// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  allowThroughFirewall, checkFirewall, macAppBundle, macFixScript, parseMacAppState, psQuote, shQuote, winCheckScript,
  winFixScript, type RunResult, type Runner
} from './firewall';

const targets = [
  { label: 'app', path: "/Applications/BotOfTheSpecter Desktop.app" },
  { label: 'camera server', path: "/Applications/BotOfTheSpecter Desktop.app/Contents/Resources/mediamtx/mediamtx" }
];

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
    expect(await checkFirewall('darwin', targets, macRunner({ '--getglobalstate': 'Firewall is disabled. (State = 0)' }, calls))).toEqual({ state: 'ok' });
    expect(calls).toHaveLength(1);
  });

  it('is ok when signed software is allowed and the app is not listed', async () => {
    expect(await checkFirewall('darwin', targets, macRunner({ ...MAC_ON, '--getappblocked': 'The application is not part of the firewall' }))).toEqual({ state: 'ok' });
  });

  it('is blocked when the app is explicitly blocked', async () => {
    const res = await checkFirewall('darwin', targets, macRunner({
      ...MAC_ON,
      '--getappblocked': 'The application /Applications/BotOfTheSpecter Desktop.app is permitted',
      [`--getappblocked ${targets[1].path}`]: `The application ${targets[1].path} is blocked from accepting incoming connections`
    }));
    expect(res.state).toBe('blocked');
  });

  it('is blocked when block-all is on', async () => {
    const res = await checkFirewall('darwin', targets, macRunner({ ...MAC_ON, '--getblockall': 'Firewall has block all state set to enabled.' }));
    expect(res.state).toBe('blocked');
  });

  it('is blocked when unlisted and signed apps are not auto-allowed', async () => {
    const res = await checkFirewall('darwin', targets, macRunner({
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
    await allowThroughFirewall('darwin', targets, async (file, args) => { calls.push([file, ...args]); return { code: 0, stdout: '', stderr: '' }; });
    expect(calls[0][0]).toBe('/usr/bin/osascript');
    expect(calls[0][2]).toMatch(/with administrator privileges$/);
    await expect(allowThroughFirewall('darwin', targets, async () => ({ code: 1, stdout: '', stderr: 'execution error: User canceled. (-128)' })))
      .rejects.toThrow(/cancelled/i);
  });

  it('finds the .app bundle from the executable path', () => {
    expect(macAppBundle('/Applications/BotOfTheSpecter Desktop.app/Contents/MacOS/BotOfTheSpecter Desktop')).toBe('/Applications/BotOfTheSpecter Desktop.app');
    expect(macAppBundle('/usr/local/bin/electron')).toBe('/usr/local/bin/electron');
  });
});

describe('firewall (Windows)', () => {
  const win = [{ label: 'app', path: "C:\\Users\\O'Brien\\AppData\\Local\\Programs\\botofthespecter-desktop\\BotOfTheSpecter Desktop.exe" }];
  const runJson = (json: unknown): Runner => async () => ({ code: 0, stdout: JSON.stringify(json), stderr: '' });

  it('is ok when every profile is off', async () => {
    expect(await checkFirewall('win32', win, runJson({ on: false, progs: [{ block: true, ours: false }] }))).toEqual({ state: 'ok' });
  });

  it('is blocked when our rule is missing or a block rule exists', async () => {
    expect((await checkFirewall('win32', win, runJson({ on: true, progs: { block: false, ours: false } }))).state).toBe('blocked');
    expect((await checkFirewall('win32', win, runJson({ on: true, progs: [{ block: true, ours: true }] }))).state).toBe('blocked');
    expect(await checkFirewall('win32', win, runJson({ on: true, progs: [{ block: false, ours: true }] }))).toEqual({ state: 'ok' });
  });

  it('is unknown when PowerShell fails', async () => {
    expect(await checkFirewall('win32', win, async () => ({ code: 1, stdout: '', stderr: 'boom' }))).toEqual({ state: 'unknown' });
  });

  it('quotes paths for PowerShell and allows every network profile', () => {
    expect(psQuote("O'Brien")).toBe("'O''Brien'");
    expect(winCheckScript(win)).toContain("O''Brien");
    const fix = winFixScript(win);
    expect(fix).toContain("$_.Action -eq 'Block' } | Remove-NetFirewallRule");
    expect(fix).toContain('-Profile Any');
  });

  it('reports a declined UAC prompt as cancelled', async () => {
    await expect(allowThroughFirewall('win32', win, async () => ({ code: 1223, stdout: '', stderr: '' }))).rejects.toThrow(/cancelled/i);
  });
});

describe('firewall (other platforms)', () => {
  it('is unknown on Linux', async () => {
    expect(await checkFirewall('linux', targets, async () => ({ code: 0, stdout: '', stderr: '' }))).toEqual({ state: 'unknown' });
  });
});
