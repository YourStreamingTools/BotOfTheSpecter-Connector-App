import { EventEmitter } from 'events';
import { BOTOFTHESPECTER_API_BASE } from '@shared/constants';
import type { SoundboardSnapshot } from '@shared/ipc';

export interface SoundboardServiceDeps {
  fetch?: typeof fetch;
  /** Live API key getter — re-read each call so a Settings change takes effect. */
  getApiKey: () => string;
}

const LIST_URL = `${BOTOFTHESPECTER_API_BASE}/sound-alerts`;
const PLAY_URL = `${BOTOFTHESPECTER_API_BASE}/websocket/sound_alert`;

/** Lists and plays soundboard sounds via the BotOfTheSpecter API; main-process only since both endpoints take api_key as a query param (non-/v2 routes); play fans a SOUND_ALERT onto the relay for the OBS overlay (no in-app preview), listing is read-only. */
export class SoundboardService extends EventEmitter {
  private fetch: typeof fetch;
  private getApiKey: () => string;
  private snap: SoundboardSnapshot = { sounds: [], state: 'idle' };

  constructor(deps: SoundboardServiceDeps) {
    super();
    this.fetch = deps.fetch ?? fetch;
    this.getApiKey = deps.getApiKey;
  }

  snapshot(): SoundboardSnapshot {
    return this.snap;
  }

  async refresh(): Promise<void> {
    const key = (this.getApiKey() ?? '').trim();
    if (!key) {
      this.setSnap({ sounds: [], state: 'idle', error: undefined });
      return;
    }
    this.setSnap({ ...this.snap, state: 'loading', error: undefined });
    try {
      const res = await this.fetch(`${LIST_URL}?api_key=${encodeURIComponent(key)}`, {
        headers: { accept: 'application/json' }
      });
      if (!res.ok) {
        this.setSnap({ sounds: [], state: 'error', error: `HTTP ${res.status}` });
        return;
      }
      const body = (await res.json()) as { sounds?: unknown };
      const sounds = Array.isArray(body?.sounds)
        ? body.sounds.filter((s): s is string => typeof s === 'string')
        : [];
      this.setSnap({ sounds, state: 'ok', error: undefined, fetchedAt: new Date().toISOString() });
    } catch (err) {
      this.setSnap({ sounds: [], state: 'error', error: err instanceof Error ? err.message : 'fetch failed' });
    }
  }

  /** Trigger a sound on-stream; returns whether the request was accepted; no network call when key or sound name is missing. */
  async play(sound: string): Promise<boolean> {
    const key = (this.getApiKey() ?? '').trim();
    const name = (sound ?? '').trim();
    if (!key || !name) return false;
    try {
      const res = await this.fetch(
        `${PLAY_URL}?api_key=${encodeURIComponent(key)}&sound=${encodeURIComponent(name)}`,
        { headers: { accept: 'application/json' } }
      );
      return res.ok;
    } catch {
      return false;
    }
  }

  private setSnap(next: SoundboardSnapshot): void {
    this.snap = next;
    this.emit('changed', this.snap);
  }
}
