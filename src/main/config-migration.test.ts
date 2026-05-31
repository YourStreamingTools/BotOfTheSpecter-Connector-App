// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigStore } from './config-store';
import { legacyConfigPath, migrateLegacyConfig } from './config-migration';

let dir: string;
const fresh = () => { dir = mkdtempSync(join(tmpdir(), 'bots-mig-')); return dir; };
afterEach(() => { if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

function writeLegacy(appData: string, data: object): string {
  const p = legacyConfigPath(appData);
  mkdirSync(join(p, '..'), { recursive: true });
  writeFileSync(p, JSON.stringify(data));
  return p;
}

describe('migrateLegacyConfig', () => {
  it('imports known keys into a fresh store', async () => {
    const root = fresh();
    const legacy = writeLegacy(root, {
      api_key: 'KEY', obs_host: 'localhost', obs_port: 4455,
      obs_password: 'pw', ignored_field: true
    });
    const store = new ConfigStore(join(root, 'new', 'config.json'));
    const migrated = await migrateLegacyConfig(store, legacy);
    expect(migrated).toBe(true);
    expect(store.get('api_key')).toBe('KEY');
    expect(store.get('obs_port')).toBe(4455);
    expect((store.all() as Record<string, unknown>).ignored_field).toBeUndefined();
  });

  it('does not migrate when the store already has settings', async () => {
    const root = fresh();
    const legacy = writeLegacy(root, { api_key: 'KEY' });
    const store = new ConfigStore(join(root, 'new', 'config.json'));
    await store.set('api_key', 'EXISTING');
    const migrated = await migrateLegacyConfig(store, legacy);
    expect(migrated).toBe(false);
    expect(store.get('api_key')).toBe('EXISTING');
  });

  it('does not migrate when the store already holds any setting (even a non-legacy key)', async () => {
    const root = fresh();
    const legacy = writeLegacy(root, { api_key: 'KEY' });
    const store = new ConfigStore(join(root, 'new', 'config.json'));
    await store.set('theme', 'dark');
    const migrated = await migrateLegacyConfig(store, legacy);
    expect(migrated).toBe(false);
    expect(store.get('api_key')).toBeUndefined();
  });

  it('is a no-op when there is no legacy file', async () => {
    const root = fresh();
    const store = new ConfigStore(join(root, 'new', 'config.json'));
    const migrated = await migrateLegacyConfig(store, legacyConfigPath(root));
    expect(migrated).toBe(false);
    expect(store.all()).toEqual({});
  });
});
