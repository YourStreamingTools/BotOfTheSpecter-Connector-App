import { BOTOFTHESPECTER_API_BASE } from '@shared/constants';
import type { ValidateResult, AccountInfo } from '@shared/ipc';

// Twitch API credentials sourced from /v2/account. Main-process only — the
// access token is never sent across IPC to the renderer.
export interface TwitchCredentials {
  accessToken: string;
  broadcasterId: string;
  updatedAt?: string;
}

export interface SpecterApiDeps {
  fetch?: typeof fetch;
}

/**
 * Talks to the BotOfTheSpecter HTTP API. Auth is via the `X-API-KEY` header.
 * The `fetch` dependency is injectable so the service can be unit-tested.
 */
export class SpecterApiService {
  private fetch: typeof fetch;

  constructor(deps: SpecterApiDeps = {}) {
    this.fetch = deps.fetch ?? fetch;
  }

  /**
   * Verify an API key via `GET /v2/checkkey`. A valid key responds with
   * `{ status: "Valid API Key", username: "<name>" }`; an invalid one with
   * `{ status: "Invalid API Key", username: null }`.
   */
  async validateApiKey(key: string): Promise<ValidateResult> {
    if (!key) return { valid: false, message: 'API key is empty' };
    try {
      const res = await this.fetch(`${BOTOFTHESPECTER_API_BASE}/v2/checkkey`, {
        headers: { accept: 'application/json', 'X-API-KEY': key }
      });
      if (!res.ok) return { valid: false, message: `Validation failed (HTTP ${res.status})` };
      const data = (await res.json()) as { status?: string; username?: string | null };
      const status = String(data.status ?? '').trim();
      const valid = status.toLowerCase() === 'valid api key' && Boolean(data.username);
      return { valid, username: data.username ?? undefined, message: status || 'Invalid API key' };
    } catch (err) {
      return { valid: false, message: err instanceof Error ? err.message : 'Validation failed' };
    }
  }

  /**
   * Fetch the account profile via `GET /v2/account`, returning only the
   * display-safe fields. The raw response also carries OAuth tokens and the
   * api_key; those are dropped here so they never reach the renderer.
   * Returns `null` on missing key, HTTP error, or malformed payload.
   */
  async getAccount(key: string): Promise<AccountInfo | null> {
    if (!key) return null;
    try {
      const res = await this.fetch(`${BOTOFTHESPECTER_API_BASE}/v2/account`, {
        headers: { accept: 'application/json', 'X-API-KEY': key }
      });
      if (!res.ok) return null;
      const d = (await res.json()) as Record<string, unknown>;
      if (!d || typeof d.username !== 'string') return null;
      const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);
      return {
        id: Number(d.id ?? 0),
        username: String(d.username),
        displayName: str(d.twitch_display_name) ?? String(d.username),
        twitchUserId: str(d.twitch_user_id) ?? '',
        profileImage: str(d.profile_image),
        isAdmin: Boolean(d.is_admin),
        betaAccess: Boolean(d.beta_access),
        isTechnical: Boolean(d.is_technical)
      };
    } catch {
      return null;
    }
  }

  /**
   * Fetch the Twitch API credentials from /v2/account: the useable access token,
   * the broadcaster id (twitch_user_id), and the token's last-updated timestamp.
   * Used only in the main process to call the Twitch Helix API.
   */
  async getCredentials(key: string): Promise<TwitchCredentials | null> {
    if (!key) return null;
    try {
      const res = await this.fetch(`${BOTOFTHESPECTER_API_BASE}/v2/account`, {
        headers: { accept: 'application/json', 'X-API-KEY': key }
      });
      if (!res.ok) return null;
      const d = (await res.json()) as { useable_access_token?: string; twitch_user_id?: string | number; useable_access_token_updated?: string };
      const accessToken = String(d.useable_access_token ?? '').trim();
      const broadcasterId = String(d.twitch_user_id ?? '').trim();
      if (!accessToken || !broadcasterId) return null;
      return { accessToken, broadcasterId, updatedAt: d.useable_access_token_updated };
    } catch {
      return null;
    }
  }
}
