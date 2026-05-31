import { SENSITIVE_KEYS } from './constants';

const REDACTED = '***REDACTED***';
// Substrings that mark a key as sensitive even when it isn't an exact match
// (e.g. `useable_access_token`, `refresh_token`, `bot_password`). These are
// deliberately specific multi-character fragments — NOT bare `auth`/`code`,
// which would wrongly redact benign keys like `author`, `qrcode`, `zipcode`.
// `auth_code`/`authcode` and `access_code`/`accesscode` cover both the snake_case
// and camelCase/concatenated spellings; `authorization` catches HTTP header keys
// carrying `Bearer <token>`; `oauth` catches OAuth grant fields.
const SENSITIVE_SUBSTRINGS = [
  'token', 'secret', 'password', 'apikey', 'api_key',
  'authorization', 'oauth', 'auth_code', 'authcode', 'access_code', 'accesscode', 'channelcode'
];

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEYS.includes(k) || SENSITIVE_SUBSTRINGS.some((s) => k.includes(s));
}

/**
 * Recursively redact secrets so they never reach logs, the variables view, or
 * anywhere user-visible. This is the single chokepoint for hiding the API key.
 *
 * - Any key named like a secret (SENSITIVE_KEYS, or containing token/secret/
 *   password/apikey) has its value replaced with `***REDACTED***`.
 * - Any literal occurrence of a known secret (e.g. the active API key, passed in
 *   `secrets`) is scrubbed from every string value, even under a benign key name.
 */
export function redactSensitive<T>(value: T, secrets: string[] = []): T {
  const live = secrets.filter((s) => typeof s === 'string' && s.length >= 6);
  const scrubString = (s: string): string => {
    let out = s;
    for (const secret of live) if (out.includes(secret)) out = out.split(secret).join(REDACTED);
    return out;
  };
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return scrubString(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        out[k] = isSensitiveKey(k) ? REDACTED : walk(val);
      }
      return out;
    }
    return v;
  };
  return walk(value) as T;
}
