import type { ChatMessage, ChatModeration } from '@shared/ipc';

function timecode(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Tolerate either the bare event object or a {payload:{event}} envelope.
function pickEvent(raw: Record<string, unknown>): Record<string, unknown> {
  const payloadEvent = (raw?.payload as { event?: Record<string, unknown> } | undefined)?.event;
  if (payloadEvent && typeof payloadEvent === 'object') return payloadEvent;
  return raw ?? {};
}

// Text from `message` in whatever shape it arrives: a plain string, a {text}
// object, or a {fragments:[{text}]} object. Returns null only if there's nothing.
function extractText(msg: unknown): string | null {
  if (typeof msg === 'string') return msg;
  if (msg && typeof msg === 'object') {
    const o = msg as { text?: unknown; fragments?: unknown };
    if (typeof o.text === 'string') return o.text;
    if (Array.isArray(o.fragments)) {
      return o.fragments.map((f) => { const t = (f as { text?: unknown })?.text; return typeof t === 'string' ? t : ''; }).join('');
    }
  }
  return null;
}

// IRC /me action messages travel over Twitch as CTCP-wrapped text — i.e.
// <0x01>ACTION text<0x01>. Depending on the relay we may see the raw bytes,
// an already-stripped form, or the relay-mangled "ACTION - text" (with a dash).
// Peel any of those off so we can render the message in the proper Twitch
// "* name text" style.
const CTCP = String.fromCharCode(1);
// Two forms only — never strip a leading bare "ACTION" because real users say
// "action movie tonight" and we'd butcher their message:
//   - CTCP-wrapped:   <0x01>ACTION text<0x01>
//   - relay-mangled:  ACTION - text     (or ACTION: text)
const ACTION_PREFIX_RE = new RegExp('^(?:' + CTCP + 'ACTION\\s+|ACTION\\s*[-:]\\s+)', 'i');
const ACTION_TRAILING_RE = new RegExp(CTCP + '\\s*$');
export function detectAction(text: string): { text: string; isAction: boolean } {
  const m = ACTION_PREFIX_RE.exec(text);
  if (!m) return { text, isAction: false };
  return { text: text.slice(m[0].length).replace(ACTION_TRAILING_RE, '').trim(), isAction: true };
}

// Roles from badges in whatever shape they arrive: [{set_id}], ['broadcaster'], or {broadcaster:'1'}.
function badgeRoles(badges: unknown): Set<string> {
  const out = new Set<string>();
  const add = (v: unknown) => { if (typeof v === 'string' && v) out.add(v.toLowerCase()); };
  if (Array.isArray(badges)) {
    for (const b of badges) {
      if (typeof b === 'string') add(b);
      else if (b && typeof b === 'object') add((b as { set_id?: unknown }).set_id);
    }
  } else if (badges && typeof badges === 'object') {
    for (const k of Object.keys(badges as Record<string, unknown>)) add(k);
  }
  return out;
}

/**
 * Map a SpecterWS CHAT_MESSAGE into a compact ChatMessage (null if unusable).
 * The relay sends a normalized flat shape — user_id / username / display_name,
 * `message` as a plain string, badges + emotes split out — but we also tolerate
 * the raw Twitch EventSub shape (chatter_* fields, `message` object) defensively.
 */
export function normalizeChatMessage(raw: Record<string, unknown>): ChatMessage | null {
  const e = pickEvent(raw);
  const id = e.message_id;
  if (typeof id !== 'string' || !id) return null; // need an id to track/moderate the line
  const roles = badgeRoles(e.badges);
  const bits = (e.cheer as { bits?: unknown } | null | undefined)?.bits;
  const rawText = extractText(e.message) ?? '';
  const { text, isAction } = detectAction(rawText);
  return {
    id,
    userId: String(e.user_id ?? e.chatter_user_id ?? ''),
    login: String(e.username ?? e.chatter_user_login ?? ''),
    displayName: String(e.display_name ?? e.chatter_user_name ?? e.username ?? e.chatter_user_login ?? ''),
    text,
    color: typeof e.color === 'string' && e.color ? e.color : undefined,
    isBroadcaster: roles.has('broadcaster'),
    isMod: roles.has('moderator') || roles.has('mod'),
    isVip: roles.has('vip'),
    isSubscriber: roles.has('subscriber') || roles.has('founder'),
    isAction,
    bits: typeof bits === 'number' && bits > 0 ? bits : undefined,
    t: timecode()
  };
}

/** Map a SpecterWS MODERATION event into a compact ChatModeration (null if no action). */
export function normalizeModeration(raw: Record<string, unknown>): ChatModeration | null {
  const e = pickEvent(raw);
  const action = typeof e.action === 'string' ? e.action : '';
  if (!action) return null;
  // For ban/timeout/delete/etc., the details live under a key matching the action name.
  const sub = e[action] as Record<string, unknown> | null | undefined;
  const fromSub = (k: string): string | undefined => {
    const v = sub && typeof sub === 'object' ? sub[k] : undefined;
    return typeof v === 'string' && v ? v : undefined;
  };
  return {
    action,
    moderator: String(e.moderator_user_name ?? e.moderator_user_login ?? ''),
    targetUserId: fromSub('user_id'),
    targetUserName: fromSub('user_name'),
    messageId: fromSub('message_id'),
    t: timecode()
  };
}
