// Ported verbatim from the legacy Python constants.py (values must not drift).
export const APP_VERSION = '2.0.0';

export const SPECTER_WEBSOCKET_URI = 'https://websocket.botofthespecter.com';
export const BOTOFTHESPECTER_API_BASE = 'https://api.botofthespecter.com';
export const TWITCH_API_BASE = 'https://api.twitch.tv/helix';
export const TWITCH_CLIENT_ID = 'mrjucsmsnri89ifucl66jj1n35jkj8';
export const ICON_URL = 'https://cdn.botofthespecter.com/logo.png';

export const RECONNECT_DELAY_MS = 60_000;
export const CONNECTION_TIMEOUT_MS = 30_000;
export const JITTER_MAX_MS = 5_000;

export const OBS_DEFAULT_HOST = 'localhost';
export const OBS_DEFAULT_PORT = 4455;

// Keys redacted before logging (matches legacy redact_sensitive_data).
export const SENSITIVE_KEYS = ['code', 'api_key', 'password', 'token', 'secret', 'auth', 'channel_code'];
