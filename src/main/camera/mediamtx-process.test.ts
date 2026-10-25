// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { lineSplitter, MediamtxProcess, mediamtxExeName, resolveMediamtxPath } from './mediamtx-process';

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  kill = vi.fn(() => { setImmediate(() => this.emit('exit', 0, null)); return true; });
}

describe('resolveMediamtxPath', () => {
  it('uses resources/mediamtx when packaged and the per-platform folder in dev', () => {
    const exists = (p: string) => p.includes('mediamtx');
    expect(resolveMediamtxPath({ packaged: true, resourcesPath: '/r', appPath: '/a', platform: 'win32', exists, env: {} }))
      .toMatch(/[\\/]r[\\/]mediamtx[\\/]mediamtx\.exe$/);
    expect(resolveMediamtxPath({ packaged: false, resourcesPath: '/r', appPath: '/a', platform: 'linux', arch: 'x64', exists, env: {} }))
      .toMatch(/[\\/]a[\\/]resources[\\/]mediamtx[\\/]linux-x64[\\/]mediamtx$/);
  });

  it('returns null when the binary is missing and honours the env override', () => {
    expect(resolveMediamtxPath({ packaged: true, resourcesPath: '/r', appPath: '/a', exists: () => false, env: {} })).toBeNull();
    expect(resolveMediamtxPath({ packaged: true, resourcesPath: '/r', appPath: '/a', exists: () => true, env: { SPECTER_MEDIAMTX_PATH: '/x/mtx' } })).toBe('/x/mtx');
  });

  it('names the exe per platform', () => {
    expect(mediamtxExeName('win32')).toBe('mediamtx.exe');
    expect(mediamtxExeName('darwin')).toBe('mediamtx');
  });
});

describe('lineSplitter', () => {
  it('reassembles lines across chunks', () => {
    const lines: string[] = [];
    const feed = lineSplitter((l) => lines.push(l));
    feed('a\r\nb');
    feed('c\n\nd\n');
    expect(lines).toEqual(['a', 'bc', 'd']);
  });
});

describe('MediamtxProcess', () => {
  it('goes running once the RTMP listener opens and restarts after a crash', async () => {
    const children: FakeChild[] = [];
    const spawn = vi.fn(() => { const c = new FakeChild(); children.push(c); return c; });
    const timers: Array<() => void> = [];
    const proc = new MediamtxProcess({
      binaryPath: '/bin/mtx', configPath: '/tmp/m.yml',
      spawn: spawn as never,
      setTimeout: ((fn: () => void) => { timers.push(fn); return 1; }) as never,
      clearTimeout: (() => undefined) as never
    });
    const states: string[] = [];
    proc.on('state', (s: { state: string }) => states.push(s.state));
    proc.start();
    expect(spawn).toHaveBeenCalledWith('/bin/mtx', ['/tmp/m.yml'], expect.anything());
    children[0].stdout.write('2026/10/25 12:00:00 INF [RTMP] started with listener on :1935 (TCP/RTMP)\n');
    await new Promise((r) => setImmediate(r));
    expect(proc.getState().state).toBe('running');

    children[0].stdout.write('2026/10/25 12:00:01 ERR listen tcp :1935: bind: address already in use\n');
    await new Promise((r) => setImmediate(r));
    children[0].emit('exit', 1, null);
    expect(proc.getState()).toEqual({ state: 'error', error: 'listen tcp :1935: bind: address already in use' });
    expect(timers).toHaveLength(1);
    timers[0]();
    expect(spawn).toHaveBeenCalledTimes(2);
    expect(states).toEqual(['starting', 'running', 'error', 'starting']);
  });

  it('stops cleanly without restarting', async () => {
    const child = new FakeChild();
    const proc = new MediamtxProcess({ binaryPath: '/bin/mtx', configPath: '/tmp/m.yml', spawn: (() => child) as never });
    proc.start();
    await proc.stop();
    expect(child.kill).toHaveBeenCalled();
    expect(proc.getState().state).toBe('stopped');
  });
});
