import type { Alert, AlertPlatform } from './ipc';

// Relay event names the Alerts feed consumes, keyed off the stable event NAME not payload shape.
export const ALERT_EVENTS: ReadonlySet<string> = new Set([
  'TWITCH_FOLLOW', 'TWITCH_CHEER', 'TWITCH_SUB', 'TWITCH_RAID', 'TWITCH_CHANNELPOINTS',
  'FOURTHWALL', 'KOFI', 'PATREON', 'STREAM_ONLINE', 'STREAM_OFFLINE'
]);

let counter = 0;
function nextId(): string {
  counter = (counter + 1) % 1_000_000;
  return `alt_${Date.now().toString(36)}_${counter}`;
}

// All wire numbers arrive as strings (relay query-param origin). Coerce safely.
function num(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

function parseJson(v: unknown): Record<string, unknown> | null {
  if (typeof v !== 'string') return (v && typeof v === 'object') ? (v as Record<string, unknown>) : null;
  try {
    const o = JSON.parse(v);
    return o && typeof o === 'object' ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

/** Normalize a relay alert event into the Alert model (null if not an alert), using hyphenated Twitch keys, `rewards`/`data` JSON strings, and now() for receivedAt except channel-points' redeemed_at. */
export function normalizeAlert(event: string, data: Record<string, unknown>): Alert | null {
  if (!ALERT_EVENTS.has(event)) return null;
  const base = { id: nextId(), receivedAt: Date.now() };

  switch (event) {
    case 'TWITCH_FOLLOW': {
      const who = str(data['twitch-username']) ?? str(data.username);
      return { ...base, kind: 'follow', platform: 'twitch', who, detail: `${who ?? 'Someone'} followed` };
    }
    case 'TWITCH_CHEER': {
      const who = str(data['twitch-username']) ?? str(data.username);
      const amount = num(data['twitch-cheer-amount']);
      return { ...base, kind: 'cheer', platform: 'twitch', who, amount, unit: 'bits',
        detail: `${who ?? 'Someone'} cheered${amount != null ? ` ${amount} bits` : ''}` };
    }
    case 'TWITCH_SUB': {
      const who = str(data['twitch-username']) ?? str(data.username);
      const tier = str(data['twitch-tier']);
      const months = num(data['twitch-sub-months']);
      const resub = months != null && months > 1;
      return { ...base, kind: 'sub', platform: 'twitch', who, tier, amount: months, unit: 'months',
        detail: `${who ?? 'Someone'} ${resub ? `resubscribed (${months} months)` : 'subscribed'}${tier ? ` — ${tier}` : ''}` };
    }
    case 'TWITCH_RAID': {
      const who = str(data['twitch-username']) ?? str(data.username);
      const amount = num(data['twitch-raid']);
      return { ...base, kind: 'raid', platform: 'twitch', who, amount, unit: 'viewers',
        detail: `${who ?? 'Someone'} raided${amount != null ? ` with ${amount} viewers` : ''}` };
    }
    case 'TWITCH_CHANNELPOINTS': {
      const r = parseJson(data.rewards) ?? {};
      const reward = (r.reward as Record<string, unknown> | undefined) ?? {};
      const who = str(r.user_name) ?? str(r.username) ?? str(data.username);
      const rewardTitle = str(reward.title) ?? str(r.reward_title);
      const message = str(r.user_input);
      const redeemedAt = Date.parse(String(r.redeemed_at ?? ''));
      return {
        ...base,
        kind: 'redemption', platform: 'twitch', who, rewardTitle, message,
        receivedAt: Number.isFinite(redeemedAt) ? redeemedAt : base.receivedAt,
        detail: `${who ?? 'Someone'} redeemed${rewardTitle ? ` ${rewardTitle}` : ' a reward'}`
      };
    }
    case 'FOURTHWALL':
      return donation('fourthwall', data, base);
    case 'KOFI':
      return donation('kofi', data, base);
    case 'PATREON':
      return donation('patreon', data, base);
    case 'STREAM_ONLINE':
      return { ...base, kind: 'stream', platform: 'twitch', online: true, detail: 'Stream went live' };
    case 'STREAM_OFFLINE':
      return { ...base, kind: 'stream', platform: 'twitch', online: false, detail: 'Stream went offline' };
    default:
      return null;
  }
}

// Each donation platform wraps a different JSON shape under the `data` key.
function donation(platform: AlertPlatform, data: Record<string, unknown>, base: { id: string; receivedAt: number }): Alert {
  const parsed = parseJson(data.data);
  let who: string | undefined;
  let amount: number | undefined;
  let unit: string | undefined;
  let message: string | undefined;

  if (parsed) {
    if (platform === 'fourthwall') {
      // Nested envelope: { type, data: { ... } }
      const d = (parsed.data as Record<string, unknown> | undefined) ?? {};
      who = str(d.username) ?? str(d.nickname);
      const total = ((d.amounts as Record<string, unknown> | undefined)?.total) as Record<string, unknown> | undefined;
      const variantAmount = (((d.subscription as Record<string, unknown> | undefined)?.variant as Record<string, unknown> | undefined)?.amount) as Record<string, unknown> | undefined;
      const money = total ?? variantAmount;
      amount = num(money?.value);
      unit = str(money?.currency);
      message = str(d.message);
    } else if (platform === 'kofi') {
      // Flat under data: { type, from_name, amount, currency, message }
      who = str(parsed.from_name);
      amount = num(parsed.amount);
      unit = str(parsed.currency);
      message = str(parsed.message);
    } else {
      // patreon: JSON:API { data: { attributes: { full_name, currency_code, currently_entitled_amount_cents } } }
      const attrs = ((parsed.data as Record<string, unknown> | undefined)?.attributes) as Record<string, unknown> | undefined ?? {};
      who = str(attrs.full_name);
      const cents = num(attrs.currently_entitled_amount_cents);
      amount = cents != null ? cents / 100 : undefined;
      unit = str(attrs.currency_code);
    }
  }

  const platformLabel = platform === 'fourthwall' ? 'Fourthwall' : platform === 'kofi' ? 'Ko-fi' : 'Patreon';
  const money = amount != null ? `${amount}${unit ? ` ${unit}` : ''}` : '';
  return {
    ...base, kind: 'donation', platform, who, amount, unit, message,
    detail: `${who ?? 'Someone'} donated${money ? ` ${money}` : ''} via ${platformLabel}`
  };
}
