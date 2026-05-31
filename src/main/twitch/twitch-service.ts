import { EventEmitter } from 'events';
import { TWITCH_API_BASE, TWITCH_CLIENT_ID } from '@shared/constants';
import type { TwitchStatus } from '@shared/ipc';
import type { TwitchCredentials } from '../api/specter-api';

export interface TwitchServiceDeps {
  fetch?: typeof fetch;
  clientId?: string;
  /** Fetch fresh Twitch credentials (useable token + broadcaster id) for an API key. */
  getCredentials: (key: string) => Promise<TwitchCredentials | null>;
  intervalMs?: number;
  /** Fallback token lifetime when the account's updated timestamp can't be parsed. */
  tokenTtlMs?: number;
  /**
   * Called with each freshly-fetched Twitch access token so it can be registered
   * as a secret and scrubbed from log lines. Defense-in-depth: the token must
   * never surface in logs even if it leaks into a message string.
   */
  registerSecret?: (secret: string) => void;
}

const OFFLINE: TwitchStatus = { reachable: false, online: false };
const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;
const EXPIRY_MARGIN_MS = 5 * 60 * 1000;

type CachedCreds = { accessToken: string; broadcasterId: string };

/**
 * Polls the Twitch Helix API for the channel's live status, game and title.
 *
 * Twitch tokens issued by BotOfTheSpecter expire after ~4 hours (rotated by the
 * backend), so the useable token is cached and only re-fetched from /v2/account
 * when it nears expiry (per `useable_access_token_updated`) or Twitch returns 401.
 */
export class TwitchService extends EventEmitter {
  private fetch: typeof fetch;
  private clientId: string;
  private getCredentials: (key: string) => Promise<TwitchCredentials | null>;
  private registerSecret?: (secret: string) => void;
  private intervalMs: number;
  private tokenTtlMs: number;
  private apiKey = '';
  private timer?: NodeJS.Timeout;
  private status: TwitchStatus = { ...OFFLINE };
  private creds: CachedCreds | null = null;
  private credsValidUntil = 0;
  private inFlight: Promise<void> | null = null;

  constructor(deps: TwitchServiceDeps) {
    super();
    this.fetch = deps.fetch ?? fetch;
    this.clientId = deps.clientId ?? TWITCH_CLIENT_ID;
    this.getCredentials = deps.getCredentials;
    this.registerSecret = deps.registerSecret;
    this.intervalMs = deps.intervalMs ?? 60_000;
    this.tokenTtlMs = deps.tokenTtlMs ?? (FOUR_HOURS_MS - 30 * 60 * 1000);
  }

  getStatus(): TwitchStatus {
    return this.status;
  }

  setApiKey(key: string): void {
    this.apiKey = key.trim();
    this.creds = null; // a different key means different credentials
    this.credsValidUntil = 0;
    if (!this.apiKey) {
      // Key cleared — stop polling and reset the status so the dashboard doesn't
      // keep showing the previous channel's online/viewers/title.
      this.stop();
      this.set({ ...OFFLINE });
    }
  }

  /** Begin polling (immediately + on an interval). Safe to call repeatedly. */
  start(): void {
    this.stop();
    if (!this.apiKey) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  /** Coalesce overlapping refreshes so a poll tick + a key-change refresh don't
   *  fire duplicate /v2/account + Helix calls or broadcast out-of-order status. */
  async refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.doRefresh().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  private async doRefresh(): Promise<void> {
    let creds = await this.ensureCredentials(false);
    if (!creds) { this.set({ ...OFFLINE }); return; }

    let result = await this.queryTwitch(creds);
    if (result === 'unauthorized') {
      // Token rejected — force a fresh one from the account and retry once.
      creds = await this.ensureCredentials(true);
      if (!creds) { this.set({ ...OFFLINE }); return; }
      result = await this.queryTwitch(creds);
    }
    this.set(result === 'unauthorized' || result === 'error' ? { ...OFFLINE } : result);
  }

  /** Return cached credentials, only hitting /v2/account when missing/stale/forced. */
  private async ensureCredentials(force: boolean): Promise<CachedCreds | null> {
    if (!this.apiKey) return null;
    if (!force && this.creds && Date.now() < this.credsValidUntil) return this.creds;
    const fresh = await this.getCredentials(this.apiKey);
    if (!fresh) { this.creds = null; this.credsValidUntil = 0; return null; }
    // Defense-in-depth: scrub the live Twitch token from any future log line.
    this.registerSecret?.(fresh.accessToken);
    this.creds = { accessToken: fresh.accessToken, broadcasterId: fresh.broadcasterId };
    this.credsValidUntil = this.computeValidUntil(fresh.updatedAt);
    return this.creds;
  }

  private computeValidUntil(updatedAt?: string): number {
    if (updatedAt) {
      const ms = Date.parse(toUtcIso(updatedAt));
      if (Number.isFinite(ms)) return ms + FOUR_HOURS_MS - EXPIRY_MARGIN_MS;
    }
    return Date.now() + this.tokenTtlMs;
  }

  private async queryTwitch(creds: CachedCreds): Promise<TwitchStatus | 'unauthorized' | 'error'> {
    const headers = {
      accept: 'application/json',
      Authorization: `Bearer ${creds.accessToken}`,
      'Client-Id': this.clientId
    };
    try {
      const sres = await this.fetch(`${TWITCH_API_BASE}/streams?user_id=${encodeURIComponent(creds.broadcasterId)}`, { headers });
      if (sres.status === 401) return 'unauthorized';
      if (!sres.ok) return 'error';
      const live = (((await sres.json()) as { data?: Array<Record<string, unknown>> }).data ?? [])[0];
      if (live) {
        return {
          reachable: true, online: true,
          game: (live.game_name as string) || undefined,
          title: (live.title as string) || undefined,
          viewers: Number(live.viewer_count ?? 0),
          startedAt: (live.started_at as string) || undefined
        };
      }
      // Offline: pull the configured game/title from the channel.
      const cres = await this.fetch(`${TWITCH_API_BASE}/channels?broadcaster_id=${encodeURIComponent(creds.broadcasterId)}`, { headers });
      if (cres.status === 401) return 'unauthorized';
      if (!cres.ok) return { reachable: true, online: false };
      const ch = (((await cres.json()) as { data?: Array<Record<string, unknown>> }).data ?? [])[0];
      return {
        reachable: true, online: false,
        game: (ch?.game_name as string) || undefined,
        title: (ch?.title as string) || undefined
      };
    } catch {
      return 'error';
    }
  }

  private set(status: TwitchStatus): void {
    this.status = status;
    this.emit('status', status);
  }
}

/**
 * Normalize a server timestamp to an explicit-UTC ISO string. The BotOfTheSpecter
 * API sends UTC, but as "YYYY-MM-DD HH:MM:SS" or an ISO string WITHOUT an offset —
 * both of which `Date.parse` would otherwise interpret in the host's local zone,
 * skewing token-expiry math by the local UTC offset. If an offset (Z or ±hh:mm)
 * is already present we trust it.
 */
export function toUtcIso(raw: string): string {
  const s = raw.trim();
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(s)) return s; // already has a timezone
  return `${s.replace(' ', 'T')}Z`;
}
