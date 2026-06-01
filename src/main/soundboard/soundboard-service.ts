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

/**
 * Lists and plays the streamer's soundboard sounds via the BotOfTheSpecter API.
 *
 * Both endpoints require the api_key as a QUERY param (they're non-/v2 routes),
 * so this lives in the main process and the key never crosses IPC to the renderer.
 * "Play" triggers the sound on-stream: the API fans a SOUND_ALERT onto the relay,
 * which the OBS overlay plays — there is no in-app preview. Listing is read-only
 * (no upload/delete endpoint exists; sounds are managed on the website).
 */
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

  /**
   * Trigger a sound on-stream. Returns whether the request was accepted.
   * No network call when the key or sound name is missing.
   */
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
