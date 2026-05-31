import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { AppConfig } from '@shared/ipc';
import type { ConfigStore } from './config-store';

const LEGACY_KEYS = ['api_key', 'obs_host', 'obs_port', 'obs_password', 'log_expanded', 'variables'] as const;

/** Path of the legacy PyQt config given an appData dir (e.g. app.getPath('appData')). */
export function legacyConfigPath(appDataDir: string): string {
  return join(appDataDir, 'BotOfTheSpecter', 'OBSConnector', 'config.json');
}

/** Import legacy settings into a fresh store. Returns true if anything was imported. */
export async function migrateLegacyConfig(store: ConfigStore, legacyPath: string): Promise<boolean> {
  // Only seed a genuinely fresh store. Gating solely on api_key/obs_host would
  // re-run the legacy merge for a store that already holds other settings
  // (theme, automations, …), clobbering newer values with stale legacy ones.
  if (Object.keys(store.all()).length > 0) return false;
  if (!existsSync(legacyPath)) return false;

  let legacy: Record<string, unknown>;
  try {
    legacy = JSON.parse(readFileSync(legacyPath, 'utf-8')) as Record<string, unknown>;
  } catch {
    return false;
  }

  const patch: Partial<AppConfig> = {};
  for (const key of LEGACY_KEYS) {
    if (legacy[key] !== undefined) {
      (patch as Record<string, unknown>)[key] = legacy[key];
    }
  }
  if (Object.keys(patch).length === 0) return false;

  await store.merge(patch);
  return true;
}
