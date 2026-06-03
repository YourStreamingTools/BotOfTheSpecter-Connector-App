import { EventEmitter } from 'events';
import { BOTOFTHESPECTER_API_BASE } from '@shared/constants';
import type {
  Raffle, RaffleInput, RaffleEntry, RaffleWinner, RafflesSnapshot, RaffleStatus
} from '@shared/ipc';
import { validateRaffleInput } from '@shared/raffles';

// Re-exported for tests + callers that already import it from here.
export { validateRaffleInput };

export interface RafflesServiceDeps {
  fetch?: typeof fetch;
  /** Live API key getter — re-read each call so a Settings change takes effect. */
  getApiKey: () => string;
}

const BASE = `${BOTOFTHESPECTER_API_BASE}/raffles`;

/**
 * Lists and controls the channel's raffles/giveaways via the BotOfTheSpecter API
 * (GET/POST/PUT/DELETE /raffles). All routes take the api_key as a QUERY param, so
 * this lives in the main process and the key never crosses IPC. Mutations are
 * validated locally first (same rules as the API), then the list is re-fetched so
 * the renderer always reflects the server's authoritative state. Entries are
 * viewer-driven (read-only); the app owns create/edit/start/stop/draw/delete.
 */
export class RafflesService extends EventEmitter {
  private fetch: typeof fetch;
  private getApiKey: () => string;
  private snap: RafflesSnapshot = { raffles: [], state: 'idle' };

  constructor(deps: RafflesServiceDeps) {
    super();
    this.fetch = deps.fetch ?? fetch;
    this.getApiKey = deps.getApiKey;
  }

  snapshot(): RafflesSnapshot {
    return this.snap;
  }

  async refresh(): Promise<void> {
    const key = (this.getApiKey() ?? '').trim();
    if (!key) {
      this.setSnap({ raffles: [], state: 'idle', error: undefined });
      return;
    }
    this.setSnap({ ...this.snap, state: 'loading', error: undefined });
    try {
      const res = await this.fetch(`${BASE}?api_key=${encodeURIComponent(key)}`, {
        headers: { accept: 'application/json' }
      });
      if (!res.ok) {
        this.setSnap({ raffles: [], state: 'error', error: `HTTP ${res.status}` });
        return;
      }
      const body = (await res.json()) as { raffles?: unknown };
      const raffles = Array.isArray(body?.raffles) ? body.raffles.map(mapRaffle) : [];
      this.setSnap({ raffles, state: 'ok', error: undefined, fetchedAt: new Date().toISOString() });
    } catch (err) {
      this.setSnap({ raffles: [], state: 'error', error: err instanceof Error ? err.message : 'fetch failed' });
    }
  }

  async entries(raffleId: number): Promise<RaffleEntry[]> {
    const key = this.requireKey();
    if (!key || !Number.isInteger(raffleId)) return [];
    try {
      const res = await this.fetch(
        `${BASE}/entries?api_key=${encodeURIComponent(key)}&raffle_id=${raffleId}`,
        { headers: { accept: 'application/json' } }
      );
      if (!res.ok) return [];
      const body = (await res.json()) as { entries?: unknown };
      return Array.isArray(body?.entries) ? body.entries.map(mapEntry) : [];
    } catch {
      return [];
    }
  }

  async winners(raffleId: number): Promise<RaffleWinner[]> {
    const key = this.requireKey();
    if (!key || !Number.isInteger(raffleId)) return [];
    try {
      const res = await this.fetch(
        `${BASE}/winners?api_key=${encodeURIComponent(key)}&raffle_id=${raffleId}`,
        { headers: { accept: 'application/json' } }
      );
      if (!res.ok) return [];
      const body = (await res.json()) as { winners?: unknown };
      return Array.isArray(body?.winners) ? body.winners.map(mapWinner) : [];
    } catch {
      return [];
    }
  }

  async create(input: RaffleInput): Promise<boolean> {
    const key = this.requireKey();
    if (!key || validateRaffleInput(input) !== null) return false;
    const ok = await this.mutate('POST', `${BASE}/add`, key, configParams(input));
    if (ok) await this.refresh();
    return ok;
  }

  async update(id: number, input: RaffleInput): Promise<boolean> {
    const key = this.requireKey();
    if (!key || !Number.isInteger(id) || validateRaffleInput(input) !== null) return false;
    const params = configParams(input);
    params.id = String(id);
    const ok = await this.mutate('PUT', `${BASE}/update`, key, params);
    if (ok) await this.refresh();
    return ok;
  }

  async start(id: number): Promise<boolean> {
    return this.idMutate('PUT', `${BASE}/start`, id);
  }

  async stop(id: number): Promise<boolean> {
    return this.idMutate('PUT', `${BASE}/stop`, id);
  }

  async delete(id: number): Promise<boolean> {
    return this.idMutate('DELETE', `${BASE}/delete`, id);
  }

  /** Draw winners. Returns the winner usernames on success, or null on failure. */
  async draw(id: number): Promise<string[] | null> {
    const key = this.requireKey();
    if (!key || !Number.isInteger(id)) return null;
    const qs = new URLSearchParams({ api_key: key, id: String(id) });
    try {
      const res = await this.fetch(`${BASE}/draw?${qs.toString()}`, {
        method: 'POST',
        headers: { accept: 'application/json' }
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { winners?: unknown };
      const winners = Array.isArray(body?.winners) ? body.winners.map((w) => String(w)) : [];
      await this.refresh();
      return winners;
    } catch {
      return null;
    }
  }

  // ---- helpers ----

  private requireKey(): string {
    return (this.getApiKey() ?? '').trim();
  }

  private async idMutate(method: string, base: string, id: number): Promise<boolean> {
    const key = this.requireKey();
    if (!key || !Number.isInteger(id)) return false;
    const ok = await this.mutate(method, base, key, { id: String(id) });
    if (ok) await this.refresh();
    return ok;
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

  private setSnap(next: RafflesSnapshot): void {
    this.snap = next;
    this.emit('changed', this.snap);
  }
}

/** Map a validated RaffleInput to the API's snake_case query params. */
function configParams(input: RaffleInput): Record<string, string> {
  return {
    name: input.name,
    prize: input.prize ?? '',
    number_of_winners: String(input.numberOfWinners),
    is_weighted: String(input.isWeighted),
    weight_sub_t1: String(input.weightSubT1),
    weight_sub_t2: String(input.weightSubT2),
    weight_sub_t3: String(input.weightSubT3),
    weight_vip: String(input.weightVip),
    exclude_mods: String(input.excludeMods),
    subscribers_only: String(input.subscribersOnly),
    followers_only: String(input.followersOnly),
    followers_min_enabled: String(input.followersMinEnabled),
    followers_min_value: String(input.followersMinValue),
    followers_min_unit: input.followersMinUnit
  };
}

function mapRaffle(raw: unknown): Raffle {
  const r = (raw ?? {}) as Record<string, unknown>;
  const status = r.status;
  return {
    id: Number(r.id),
    name: String(r.name ?? ''),
    prize: String(r.prize ?? ''),
    numberOfWinners: Number(r.number_of_winners ?? 1),
    status: (status === 'running' || status === 'ended' ? status : 'scheduled') as RaffleStatus,
    isWeighted: Boolean(r.is_weighted),
    weightSubT1: numOrNull(r.weight_sub_t1),
    weightSubT2: numOrNull(r.weight_sub_t2),
    weightSubT3: numOrNull(r.weight_sub_t3),
    weightVip: numOrNull(r.weight_vip),
    excludeMods: Boolean(r.exclude_mods),
    subscribersOnly: Boolean(r.subscribers_only),
    followersOnly: Boolean(r.followers_only),
    followersMinEnabled: Boolean(r.followers_min_enabled),
    followersMinValue: Number(r.followers_min_value ?? 0),
    followersMinUnit: String(r.followers_min_unit ?? 'days'),
    createdAt: r.created_at != null ? String(r.created_at) : null,
    entryCount: Number(r.entry_count ?? 0),
    winnerCount: Number(r.winner_count ?? 0),
    winners: Array.isArray(r.winners) ? r.winners.map((w) => String(w)) : []
  };
}

function mapEntry(raw: unknown): RaffleEntry {
  const e = (raw ?? {}) as Record<string, unknown>;
  return {
    id: Number(e.id),
    raffleId: Number(e.raffle_id),
    userId: e.user_id != null ? String(e.user_id) : null,
    username: e.username != null ? String(e.username) : null,
    weight: Number(e.weight ?? 1),
    source: e.source != null ? String(e.source) : null,
    enteredAt: e.entered_at != null ? String(e.entered_at) : null
  };
}

function mapWinner(raw: unknown): RaffleWinner {
  const w = (raw ?? {}) as Record<string, unknown>;
  return {
    id: Number(w.id),
    raffleId: Number(w.raffle_id),
    entryId: Number(w.entry_id),
    userId: w.user_id != null ? String(w.user_id) : null,
    username: w.username != null ? String(w.username) : null,
    source: w.source != null ? String(w.source) : null,
    wonAt: w.won_at != null ? String(w.won_at) : null
  };
}

function numOrNull(v: unknown): number | null {
  return v == null ? null : Number(v);
}
