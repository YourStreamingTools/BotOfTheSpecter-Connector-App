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

// Decode a relay payload sent as a JSON STRING (channel-points `rewards`, donation `data`) to an object; tolerate already-decoded or garbage.
const decodeJson = (v: unknown): Record<string, unknown> => {
  if (v && typeof v === 'object') return v as Record<string, unknown>;
  if (typeof v === 'string') {
    try { const o = JSON.parse(v); return o && typeof o === 'object' ? o as Record<string, unknown> : {}; }
    catch { return {}; }
  }
  return {};
};

// Extract donor + amount from a donation event's `data` JSON string (Fourthwall nests under data.data, Ko-fi is flat, Patreon is JSON:API with amount in cents).
const decodeDonation = (type: string, data: Record<string, unknown>): { who: unknown; amount: number | null } => {
  const parsed = decodeJson(data.data);
  // Nothing decodable → fall back to any flat keys an older path might have sent.
  if (!parsed || Object.keys(parsed).length === 0) {
    const a = Number(pick(data, 'amount', 'donation_amount'));
    return { who: pick(data, 'username', 'supporter_name', 'from_name'), amount: Number.isFinite(a) ? a : null };
  }
  if (type === 'FOURTHWALL') {
    const d = (parsed.data as Record<string, unknown> | undefined) ?? {};
    const total = ((d.amounts as Record<string, unknown> | undefined)?.total) as Record<string, unknown> | undefined;
    const variantAmount = (((d.subscription as Record<string, unknown> | undefined)?.variant as Record<string, unknown> | undefined)?.amount) as Record<string, unknown> | undefined;
    const value = Number((total ?? variantAmount)?.value);
    return { who: pick(d, 'username', 'nickname'), amount: Number.isFinite(value) ? value : null };
  }
  if (type === 'KOFI') {
    const value = Number(parsed.from_amount ?? parsed.amount);
    return { who: pick(parsed, 'from_name'), amount: Number.isFinite(value) ? value : null };
  }
  // PATREON: JSON:API, amount in cents.
  const attrs = ((parsed.data as Record<string, unknown> | undefined)?.attributes) as Record<string, unknown> | undefined ?? {};
  const cents = Number(attrs.currently_entitled_amount_cents);
  return { who: pick(attrs, 'full_name'), amount: Number.isFinite(cents) ? cents / 100 : null };
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

  /** Reconcile `stream_status` against Twitch's authoritative live state to recover from missed STREAM_ONLINE/OFFLINE events; no-op when unchanged, and only touches `stream_status` (not stream_start_time/stream_end_time, which would be wrong on a missed transition). */
  reconcileStreamStatus(online: boolean): void {
    const next = online ? 'online' : 'offline';
    if (this.values.stream_status === next) return;
    this.set('stream_status', next);
    // Mirror STREAM_ONLINE's session reset when reconciliation discovers the stream is live; not touching stream_start_time since the true go-live moment is unknown.
    if (online) this.resetSession();
  }

  /** Zero the per-stream session counters (fired on STREAM_ONLINE or manually); totals are untouched. */
  resetSession(): void {
    for (const c of ['session_followers', 'session_subs', 'session_bits', 'session_redemptions', 'session_deaths', 'session_donation_count']) this.reset(c);
    this.set('session_donations', 0);
  }

  handleEvent(type: string, data: Record<string, unknown> = {}): void {
    const now = new Date().toISOString();
    this.set('last_specter_event', type);
    this.set('last_specter_event_date', now);
    // Keep the stored payload as VALID JSON even when capped for display: wrap the truncated preview in an object so sanitizeStoredPayload can re-parse it on next load (raw slicing produces invalid JSON that gets dropped to '—').
    const full = JSON.stringify(redactSensitive(data));
    const payload = full.length > 400 ? JSON.stringify({ _truncated: full.slice(0, 380) + '…' }) : full;
    this.set('last_specter_payload', payload);

    switch (type) {
      case 'TWITCH_FOLLOW': {
        // Relay wire key is hyphenated 'twitch-username'; older/raw shapes as fallback.
        const u = pick(data, 'twitch-username', 'username', 'user', 'user_name');
        if (u) { this.set('last_follower', u); this.set('last_follower_date', now); this.increment('session_followers'); this.increment('total_followers'); }
        break;
      }
      case 'TWITCH_CHEER': {
        const u = pick(data, 'twitch-username', 'username', 'user', 'user_name');
        const bits = toInt(pick(data, 'twitch-cheer-amount', 'bits', 'amount'));
        if (u) this.set('last_cheer_user', u);
        if (bits !== null) { this.set('last_cheer_amount', bits); this.increment('session_bits', bits); this.increment('total_bits', bits); }
        break;
      }
      case 'TWITCH_RAID': {
        const u = pick(data, 'twitch-username', 'username', 'user', 'from_broadcaster_user_name');
        const viewers = toInt(pick(data, 'twitch-raid', 'viewers', 'viewer_count'));
        if (u) this.set('last_raider', u);
        if (viewers !== null) this.set('raid_viewer_count', viewers);
        break;
      }
      case 'TWITCH_SUB': {
        const u = pick(data, 'twitch-username', 'username', 'user', 'user_name');
        const tier = pick(data, 'twitch-tier', 'tier', 'sub_tier');
        const months = toInt(pick(data, 'twitch-sub-months', 'months', 'cumulative_months'));
        if (u) { this.set('last_subscriber', u); this.set('last_sub_date', now); }
        if (tier) this.set('last_sub_tier', tier);
        if (months !== null) this.set('last_sub_months', months);
        this.set('last_sub_is_gift', Boolean(data.is_gift));
        this.increment('session_subs'); this.increment('total_subs');
        break;
      }
      case 'TWITCH_CHANNELPOINTS': {
        // Decode the relay's `rewards` JSON string (raw Twitch event_data): reward.title/cost are nested, user_name is top-level, with flat-key fallbacks.
        const r = decodeJson(data.rewards);
        const reward = (r.reward as Record<string, unknown> | undefined) ?? {};
        const u = pick(r, 'user_name', 'username') ?? pick(data, 'username', 'user', 'user_name');
        const title = pick(reward, 'title') ?? pick(r, 'reward_title') ?? pick(data, 'reward', 'reward_title', 'title');
        const cost = toInt(pick(reward, 'cost') ?? pick(data, 'cost', 'reward_cost'));
        if (u) this.set('last_redemption_user', u);
        if (title) this.set('last_redemption_title', title);
        if (cost !== null) this.set('last_redemption_cost', cost);
        this.increment('session_redemptions');
        break;
      }
      case 'FOURTHWALL': case 'KOFI': case 'PATREON': {
        // Donations arrive as a `data` JSON string whose shape differs per platform.
        const { who, amount } = decodeDonation(type, data);
        if (who) { this.set('last_donor', who); this.set('last_donation_platform', type); }
        if (amount !== null) {
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
