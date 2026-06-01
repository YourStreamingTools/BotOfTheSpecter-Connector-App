import { EventEmitter } from 'events';
import { BOTOFTHESPECTER_API_BASE } from '@shared/constants';
import type { Timer, TimerInput, TimersSnapshot } from '@shared/ipc';
import { validateTimerInput } from '@shared/timers';

// Re-exported for tests + callers that already import it from here.
export { validateTimerInput };

export interface TimersServiceDeps {
  fetch?: typeof fetch;
  /** Live API key getter — re-read each call so a Settings change takes effect. */
  getApiKey: () => string;
}

const BASE = `${BOTOFTHESPECTER_API_BASE}/timers`;

/**
 * Lists and edits the bot's timed messages via the BotOfTheSpecter API
 * (GET/POST/PUT/DELETE /timers). All routes take the api_key as a QUERY param
 * (non-/v2), so this lives in the main process and the key never crosses IPC.
 * Mutations are validated locally first (same rules as the API), then the list
 * is re-fetched so the renderer always reflects the server's authoritative state.
 */
export class TimersService extends EventEmitter {
  private fetch: typeof fetch;
  private getApiKey: () => string;
  private snap: TimersSnapshot = { timers: [], state: 'idle' };

  constructor(deps: TimersServiceDeps) {
    super();
    this.fetch = deps.fetch ?? fetch;
    this.getApiKey = deps.getApiKey;
  }

  snapshot(): TimersSnapshot {
    return this.snap;
  }

  async refresh(): Promise<void> {
    const key = (this.getApiKey() ?? '').trim();
    if (!key) {
      this.setSnap({ timers: [], state: 'idle', error: undefined });
      return;
    }
    this.setSnap({ ...this.snap, state: 'loading', error: undefined });
    try {
      const res = await this.fetch(`${BASE}?api_key=${encodeURIComponent(key)}`, {
        headers: { accept: 'application/json' }
      });
      if (!res.ok) {
        this.setSnap({ timers: [], state: 'error', error: `HTTP ${res.status}` });
        return;
      }
      const body = (await res.json()) as { timers?: unknown };
      const timers = Array.isArray(body?.timers) ? body.timers.map(mapTimer) : [];
      this.setSnap({ timers, state: 'ok', error: undefined, fetchedAt: new Date().toISOString() });
    } catch (err) {
      this.setSnap({ timers: [], state: 'error', error: err instanceof Error ? err.message : 'fetch failed' });
    }
  }

  async create(input: TimerInput): Promise<boolean> {
    const key = this.requireKey();
    if (!key || validateTimerInput(input) !== null) return false;
    const ok = await this.mutate('POST', `${BASE}/add`, key, this.fieldParams(input));
    if (ok) await this.refresh();
    return ok;
  }

  async update(id: number, input: TimerInput): Promise<boolean> {
    const key = this.requireKey();
    if (!key || !Number.isInteger(id) || validateTimerInput(input) !== null) return false;
    const params = this.fieldParams(input);
    params.id = String(id);
    params.enabled = String(input.enabled ?? true);
    const ok = await this.mutate('PUT', `${BASE}/update`, key, params);
    if (ok) await this.refresh();
    return ok;
  }

  async toggle(id: number, enabled: boolean): Promise<boolean> {
    const key = this.requireKey();
    if (!key || !Number.isInteger(id)) return false;
    const ok = await this.mutate('PUT', `${BASE}/toggle`, key, { id: String(id), enabled: String(enabled) });
    if (ok) await this.refresh();
    return ok;
  }

  async delete(id: number): Promise<boolean> {
    const key = this.requireKey();
    if (!key || !Number.isInteger(id)) return false;
    const ok = await this.mutate('DELETE', `${BASE}/delete`, key, { id: String(id) });
    if (ok) await this.refresh();
    return ok;
  }

  // ---- helpers ----

  private requireKey(): string {
    return (this.getApiKey() ?? '').trim();
  }

  /** Map a validated input to the API's snake_case query params (timer-kind aware). */
  private fieldParams(input: TimerInput): Record<string, string> {
    const params: Record<string, string> = {
      trigger_type: input.triggerType,
      message: input.message
    };
    if (input.triggerType === 'timer' || input.triggerType === 'both') {
      params.interval_count = String(input.intervalCount);
    }
    if (input.triggerType === 'chat_lines' || input.triggerType === 'both') {
      params.chat_line_trigger = String(input.chatLineTrigger);
    }
    return params;
  }

  private async mutate(method: string, base: string, key: string, params: Record<string, string>): Promise<boolean> {
    const qs = new URLSearchParams({ api_key: key, ...params });
    try {
      const res = await this.fetch(`${base}?${qs.toString()}`, {
        method,
        headers: { accept: 'application/json' }
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private setSnap(next: TimersSnapshot): void {
    this.snap = next;
    this.emit('changed', this.snap);
  }
}

function mapTimer(raw: unknown): Timer {
  const t = (raw ?? {}) as Record<string, unknown>;
  const tt = t.trigger_type;
  return {
    id: Number(t.id),
    triggerType: tt === 'chat_lines' || tt === 'both' ? tt : 'timer',
    intervalCount: typeof t.interval_count === 'number' ? t.interval_count : null,
    chatLineTrigger: typeof t.chat_line_trigger === 'number' ? t.chat_line_trigger : null,
    message: String(t.message ?? ''),
    enabled: Boolean(t.enabled)
  };
}
