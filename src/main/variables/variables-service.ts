import { EventEmitter } from 'events';
import type { ConfigStore } from '../config-store';
import type { VariablesSnapshot } from '@shared/ipc';
import { redactSensitive } from '@shared/redact';

const DISPLAY_DEFAULTS: Record<string, unknown> = {
  last_follower: '—', last_follower_date: '',
  last_cheer_user: '—', last_cheer_amount: 0,
  last_subscriber: '—', last_sub_date: '',
  last_raider: '—', raid_viewer_count: 0,
  last_specter_event: '—', last_specter_event_date: '', last_specter_payload: '—'
};

const pick = (d: Record<string, unknown>, ...keys: string[]): unknown => {
  for (const k of keys) if (d[k] !== undefined && d[k] !== null) return d[k];
  return undefined;
};
const toInt = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
};

export class VariablesService extends EventEmitter {
  private values: Record<string, unknown>;
  private counters: Record<string, number>;

  constructor(private store: ConfigStore) {
    super();
    const v = store.get('variables') ?? { values: {}, counters: {} };
    this.values = { ...v.values };
    this.counters = { ...v.counters };
    this.sanitizeStoredPayload();
  }

  // An older build may have persisted a raw payload containing the API key; re-redact on load.
  private sanitizeStoredPayload(): void {
    const stored = this.values.last_specter_payload;
    if (typeof stored === 'string' && stored !== '—') {
      try {
        this.values.last_specter_payload = JSON.stringify(redactSensitive(JSON.parse(stored)));
      } catch {
        this.values.last_specter_payload = '—'; // not parseable JSON — can't safely redact, so drop it
      }
    }
  }

  private persist(): void {
    // Best-effort, fire-and-forget; a transient write failure must not crash the bot.
    void this.store.set('variables', { values: this.values, counters: this.counters }).catch(() => undefined);
  }

  set(name: string, value: unknown): void {
    const old = this.values[name];
    this.values[name] = value;
    this.persist();
    this.emit('changed', { action: 'set', name, value, old });
  }

  increment(name: string, amount = 1): void {
    const cur = this.counters[name] ?? 0;
    this.counters[name] = cur + amount;
    this.persist();
    this.emit('changed', { action: 'increment', name, value: this.counters[name], old: cur });
  }

  private reset(name: string): void {
    this.counters[name] = 0;
    this.persist();
    this.emit('changed', { action: 'reset', name, value: 0, old: undefined });
  }

  all(): VariablesSnapshot {
    return { values: { ...DISPLAY_DEFAULTS, ...this.values }, counters: { ...this.counters } };
  }

  /**
   * Reconcile `stream_status` against Twitch's authoritative live state.
   *
   * The bot's STREAM_ONLINE / STREAM_OFFLINE events normally drive this variable,
   * but if the app isn't open when the stream ends (or the event is missed) it
   * stays stuck on its last value — typically a stale "online". TwitchService
   * calls this whenever it has a definitive answer (i.e. Twitch is reachable),
   * so the Variables page always agrees with the dashboard's live indicator
   * (which derives from the same Twitch source of truth). No-op when unchanged,
   * so it doesn't churn the persisted config or spam `changed` listeners.
   *
   * We deliberately touch only `stream_status` — not stream_start_time /
   * stream_end_time, since on a missed event we don't know the true transition
   * time and "now" would be wrong.
   */
  reconcileStreamStatus(online: boolean): void {
    const next = online ? 'online' : 'offline';
    if (this.values.stream_status === next) return;
    this.set('stream_status', next);
    // Mirror STREAM_ONLINE's session reset when we discover the stream is live by
    // reconciliation (e.g. the app wasn't open at go-live, so the event was missed).
    // Deliberately not touching stream_start_time — we don't know the true go-live moment.
    if (online) this.resetSession();
  }

  /** Zero the per-stream session counters. Fired automatically on STREAM_ONLINE,
   *  or manually (e.g. when the app wasn't open at go-live). Totals are untouched. */
  resetSession(): void {
    for (const c of ['session_followers', 'session_subs', 'session_bits', 'session_redemptions', 'session_deaths', 'session_donation_count']) this.reset(c);
    this.set('session_donations', 0);
  }

  handleEvent(type: string, data: Record<string, unknown> = {}): void {
    const now = new Date().toISOString();
    this.set('last_specter_event', type);
    this.set('last_specter_event_date', now);
    // Keep the stored payload as VALID JSON even when capped for display —
    // slicing the raw JSON string produces invalid JSON that sanitizeStoredPayload
    // can't re-parse on the next load, silently dropping it to '—'. Wrapping the
    // truncated preview in an object keeps it decodable.
    const full = JSON.stringify(redactSensitive(data));
    const payload = full.length > 400 ? JSON.stringify({ _truncated: full.slice(0, 380) + '…' }) : full;
    this.set('last_specter_payload', payload);

    switch (type) {
      case 'TWITCH_FOLLOW': {
        const u = pick(data, 'username', 'user', 'user_name');
        if (u) { this.set('last_follower', u); this.set('last_follower_date', now); this.increment('session_followers'); this.increment('total_followers'); }
        break;
      }
      case 'TWITCH_CHEER': {
        const u = pick(data, 'username', 'user', 'user_name');
        const bits = toInt(pick(data, 'bits', 'amount'));
        if (u) this.set('last_cheer_user', u);
        if (bits !== null) { this.set('last_cheer_amount', bits); this.increment('session_bits', bits); this.increment('total_bits', bits); }
        break;
      }
      case 'TWITCH_RAID': {
        const u = pick(data, 'username', 'user', 'from_broadcaster_user_name');
        const viewers = toInt(pick(data, 'viewers', 'viewer_count'));
        if (u) this.set('last_raider', u);
        if (viewers !== null) this.set('raid_viewer_count', viewers);
        break;
      }
      case 'TWITCH_SUB': {
        const u = pick(data, 'username', 'user', 'user_name');
        const tier = pick(data, 'tier', 'sub_tier');
        const months = toInt(pick(data, 'months', 'cumulative_months'));
        if (u) { this.set('last_subscriber', u); this.set('last_sub_date', now); }
        if (tier) this.set('last_sub_tier', tier);
        if (months !== null) this.set('last_sub_months', months);
        this.set('last_sub_is_gift', Boolean(data.is_gift));
        this.increment('session_subs'); this.increment('total_subs');
        break;
      }
      case 'TWITCH_CHANNELPOINTS': {
        const u = pick(data, 'username', 'user', 'user_name');
        const reward = pick(data, 'reward', 'reward_title', 'title');
        const cost = toInt(pick(data, 'cost', 'reward_cost'));
        if (u) this.set('last_redemption_user', u);
        if (reward) this.set('last_redemption_title', reward);
        if (cost !== null) this.set('last_redemption_cost', cost);
        this.increment('session_redemptions');
        break;
      }
      case 'FOURTHWALL': case 'KOFI': case 'PATREON': {
        const u = pick(data, 'username', 'supporter_name', 'from_name');
        const amount = Number(pick(data, 'amount', 'donation_amount'));
        if (u) { this.set('last_donor', u); this.set('last_donation_platform', type); }
        if (Number.isFinite(amount)) {
          this.set('last_donation_amount', amount);
          this.set('session_donations', Number(this.values.session_donations ?? 0) + amount);
        }
        this.increment('session_donation_count');
        break;
      }
      case 'DEATHS': {
        const game = data.game as string | undefined;
        if (game) { this.set('current_game', game); this.increment(`deaths_${game}`); this.set('last_death_game', game); this.set('last_death_date', now); }
        this.increment('session_deaths');
        break;
      }
      case 'STREAM_ONLINE': {
        this.set('stream_status', 'online');
        this.set('stream_start_time', now);
        this.resetSession();
        break;
      }
      case 'STREAM_OFFLINE': {
        this.set('stream_status', 'offline');
        this.set('stream_end_time', now);
        break;
      }
      default:
        break;
    }
  }
}
