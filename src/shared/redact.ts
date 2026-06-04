import { SENSITIVE_KEYS } from './constants';

const REDACTED = '***REDACTED***';
// Specific multi-char substrings marking a key as sensitive (NOT bare `auth`/`code`, which would wrongly redact `author`/`qrcode`); covers snake_case and camelCase spellings plus `authorization` (Bearer headers) and `oauth`.
const SENSITIVE_SUBSTRINGS = [
  'token', 'secret', 'password', 'apikey', 'api_key',
  'authorization', 'oauth', 'auth_code', 'authcode', 'access_code', 'accesscode', 'channelcode'
];

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEYS.includes(k) || SENSITIVE_SUBSTRINGS.some((s) => k.includes(s));
}

/** Single chokepoint that recursively redacts secrets before logs/variables view: sensitive-named keys become `***REDACTED***`, and any literal known secret in `secrets` is scrubbed from every string value even under a benign key. */
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
