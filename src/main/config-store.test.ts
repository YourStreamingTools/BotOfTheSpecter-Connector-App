// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, readdirSync, promises as fsp } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigStore } from './config-store';

let dir: string;
const newPath = () => {
  dir = mkdtempSync(join(tmpdir(), 'bots-cfg-'));
  return join(dir, 'config.json');
};
afterEach(() => { if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('ConfigStore', () => {
  it('returns undefined for missing keys and {} for all() on a fresh store', () => {
    const store = new ConfigStore(newPath());
    expect(store.get('api_key')).toBeUndefined();
    expect(store.all()).toEqual({});
  });

  it('persists set() to disk and reloads it in a new instance', async () => {
    const p = newPath();
    const a = new ConfigStore(p);
    await a.set('obs_port', 4455);
    await a.set('api_key', 'abc');
    expect(existsSync(p)).toBe(true);
    const b = new ConfigStore(p);
    expect(b.get('obs_port')).toBe(4455);
    expect(b.get('api_key')).toBe('abc');
  });

  it('merge() applies a patch and persists', async () => {
    const p = newPath();
    const a = new ConfigStore(p);
    await a.merge({ theme: 'light', density: 'comfy' });
    expect(JSON.parse(readFileSync(p, 'utf-8'))).toMatchObject({ theme: 'light', density: 'comfy' });
  });

  it('tolerates a corrupt file by starting empty', () => {
    const p = newPath();
    writeFileSync(p, '{ not json');
    const store = new ConfigStore(p);
    expect(store.all()).toEqual({});
  });

  it('serializes concurrent writes without errors and keeps the final value', async () => {
    const p = newPath();
    const s = new ConfigStore(p);
    await Promise.all(Array.from({ length: 20 }, (_, i) => s.set('obs_port', 4000 + i)));
    const reloaded = new ConfigStore(p);
    expect(reloaded.get('obs_port')).toBe(4019);
  });

  it('cleans up the temp file (no orphan) when the rename fails', async () => {
    const p = newPath();
    const s = new ConfigStore(p);
    const spy = vi.spyOn(fsp, 'rename').mockRejectedValueOnce(new Error('EPERM'));
    await expect(s.set('obs_port', 4455)).rejects.toThrow();
    spy.mockRestore();
    const leftovers = readdirSync(dir).filter((f) => f.endsWith('.tmp'));
    expect(leftovers).toEqual([]);
  });
});
