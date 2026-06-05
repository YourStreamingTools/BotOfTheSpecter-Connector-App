import { EventEmitter } from 'events';
import { TWITCH_API_BASE, TWITCH_CLIENT_ID } from '@shared/constants';
import type { ChannelReward, ChannelRewardCreate, ChannelRewardUpdate, ChannelPointsSnapshot, RedemptionItem, RedemptionStatus } from '@shared/ipc';
import type { TwitchCredentials } from '../api/specter-api';

export interface ChannelPointsServiceDeps {
  fetch?: typeof fetch;
  clientId?: string;
  getCredentials: (key: string) => Promise<TwitchCredentials | null>;
  /** Live API key getter (the key the credentials are fetched against). */
  getApiKey: () => string;
}

const REWARDS_URL = `${TWITCH_API_BASE}/channel_points/custom_rewards`;
const REDEMPTIONS_URL = `${TWITCH_API_BASE}/channel_points/custom_rewards/redemptions`;
const IMPORT_TITLE_PREFIX = 'Specter-';
const REWARD_TITLE_MAX = 45;

// Imported-copy title: original prefixed with "Specter-" (sidesteps Twitch's unique-title rule), capped at 45 chars.
const importedTitle = (original: string): string => `${IMPORT_TITLE_PREFIX}${original}`.slice(0, REWARD_TITLE_MAX);

// Maps ChannelRewardUpdate (camelCase) keys to the Helix PATCH body (snake_case); only provided fields are sent.
const UPDATE_KEY_MAP: Record<keyof ChannelRewardUpdate, string> = {
  title: 'title',
  cost: 'cost',
  prompt: 'prompt',
  backgroundColor: 'background_color',
  isEnabled: 'is_enabled',
  isPaused: 'is_paused',
  isUserInputRequired: 'is_user_input_required',
  isGlobalCooldownEnabled: 'is_global_cooldown_enabled',
  globalCooldownSeconds: 'global_cooldown_seconds',
  isMaxPerStreamEnabled: 'is_max_per_stream_enabled',
  maxPerStream: 'max_per_stream',
  isMaxPerUserPerStreamEnabled: 'is_max_per_user_per_stream_enabled',
  maxPerUserPerStream: 'max_per_user_per_stream'
};

const CREATE_KEY_MAP: Record<keyof ChannelRewardCreate, string> = {
  title: 'title',
  cost: 'cost',
  prompt: 'prompt',
  backgroundColor: 'background_color',
  isEnabled: 'is_enabled',
  isUserInputRequired: 'is_user_input_required',
  isGlobalCooldownEnabled: 'is_global_cooldown_enabled',
  globalCooldownSeconds: 'global_cooldown_seconds',
  isMaxPerStreamEnabled: 'is_max_per_stream_enabled',
  maxPerStream: 'max_per_stream',
  isMaxPerUserPerStreamEnabled: 'is_max_per_user_per_stream_enabled',
  maxPerUserPerStream: 'max_per_user_per_stream',
  shouldRedemptionsSkipRequestQueue: 'should_redemptions_skip_request_queue'
};

/** Manages Twitch channel-point custom rewards + redemptions via direct Helix (broadcaster token + Specter Client-Id); main-process only so the token never crosses IPC. A reward is `manageable` only if created by this Client-Id (only_manageable_rewards=true returns those), since Twitch rejects edits to other apps' rewards. */
export class ChannelPointsService extends EventEmitter {
  private fetch: typeof fetch;
  private clientId: string;
  private getCredentials: (key: string) => Promise<TwitchCredentials | null>;
  private getApiKey: () => string;
  private snap: ChannelPointsSnapshot = { rewards: [], state: 'idle' };
  private manageableIds = new Set<string>();

  constructor(deps: ChannelPointsServiceDeps) {
    super();
    this.fetch = deps.fetch ?? fetch;
    this.clientId = deps.clientId ?? TWITCH_CLIENT_ID;
    this.getCredentials = deps.getCredentials;
    this.getApiKey = deps.getApiKey;
  }

  snapshot(): ChannelPointsSnapshot {
    return this.snap;
  }

  async refresh(): Promise<void> {
    const creds = await this.creds();
    if (!creds) { this.setSnap({ rewards: [], state: 'idle', error: undefined }); return; }
    this.setSnap({ ...this.snap, state: 'loading', error: undefined });
    try {
      // Fetch both lists: all rewards (for display) + manageable (to flag editable).
      const [all, manageable] = await Promise.all([
        this.getRewards(creds, false),
        this.getRewards(creds, true)
      ]);
      if (all === null) { this.setSnap({ rewards: [], state: 'error', error: 'Failed to load rewards' }); return; }
      this.manageableIds = new Set((manageable ?? []).map((r) => String(r.id)));
      const rewards = all.map((raw) => this.mapReward(raw));
      this.setSnap({ rewards, state: 'ok', error: undefined, fetchedAt: new Date().toISOString() });
    } catch (err) {
      this.setSnap({ rewards: [], state: 'error', error: err instanceof Error ? err.message : 'fetch failed' });
    }
  }

  async createReward(input: ChannelRewardCreate): Promise<boolean> {
    // Validate locally (Twitch rules: title 1–45, cost >= 1) before hitting the API.
    if (!input || !input.title?.trim() || input.title.length > 45) return false;
    if (!Number.isInteger(input.cost) || input.cost < 1) return false;
    const creds = await this.creds();
    if (!creds) return false;
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(input)) {
      if (v === undefined) continue;
      const mapped = CREATE_KEY_MAP[k as keyof ChannelRewardCreate];
      if (mapped) body[mapped] = v;
    }
    const url = `${REWARDS_URL}?broadcaster_id=${encodeURIComponent(creds.broadcasterId)}`;
    const ok = await this.send('POST', url, creds, body);
    if (ok) await this.refresh();
    return ok;
  }

  /** Import a non-Specter reward: recreate it under Specter ownership with a "Specter-" prefixed title. The original stays on Twitch (the app can't delete another app's reward) for the user to remove manually; the image can't be copied via the API so the user re-uploads it. */
  async importReward(rewardId: string): Promise<boolean> {
    const src = this.snap.rewards.find((r) => r.id === rewardId);
    if (!src) return false;
    const input: ChannelRewardCreate = {
      title: importedTitle(src.title),
      cost: src.cost,
      prompt: src.prompt || undefined,
      backgroundColor: src.backgroundColor,
      isEnabled: src.isEnabled,
      isUserInputRequired: src.isUserInputRequired,
      isGlobalCooldownEnabled: src.globalCooldownEnabled,
      globalCooldownSeconds: src.globalCooldownEnabled ? src.globalCooldownSeconds : undefined,
      isMaxPerStreamEnabled: src.maxPerStreamEnabled,
      maxPerStream: src.maxPerStreamEnabled ? src.maxPerStream : undefined,
      isMaxPerUserPerStreamEnabled: src.maxPerUserPerStreamEnabled,
      maxPerUserPerStream: src.maxPerUserPerStreamEnabled ? src.maxPerUserPerStream : undefined
    };
    return this.createReward(input);
  }

  async updateReward(id: string, patch: ChannelRewardUpdate): Promise<boolean> {
    if (!this.manageableIds.has(id)) return false; // Twitch only lets the creating app edit
    const creds = await this.creds();
    if (!creds) return false;
    const body: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) continue;
      const mapped = UPDATE_KEY_MAP[k as keyof ChannelRewardUpdate];
      if (mapped) body[mapped] = v;
    }
    if (Object.keys(body).length === 0) return false;
    const url = `${REWARDS_URL}?broadcaster_id=${encodeURIComponent(creds.broadcasterId)}&id=${encodeURIComponent(id)}`;
    const ok = await this.send('PATCH', url, creds, body);
    if (ok) await this.refresh();
    return ok;
  }

  async listRedemptions(rewardId: string): Promise<RedemptionItem[]> {
    const creds = await this.creds();
    if (!creds) return [];
    const url = `${REDEMPTIONS_URL}?broadcaster_id=${encodeURIComponent(creds.broadcasterId)}&reward_id=${encodeURIComponent(rewardId)}&status=UNFULFILLED&sort=NEWEST&first=50`;
    const res = await this.helix('GET', url, creds);
    if (!res || !res.ok) return [];
    const body = (await res.json()) as { data?: unknown[] };
    const data = Array.isArray(body?.data) ? body.data : [];
    return data.map((raw) => this.mapRedemption(raw as Record<string, unknown>));
  }

  async setRedemption(rewardId: string, redemptionId: string, status: 'FULFILLED' | 'CANCELED'): Promise<boolean> {
    const creds = await this.creds();
    if (!creds) return false;
    const url = `${REDEMPTIONS_URL}?broadcaster_id=${encodeURIComponent(creds.broadcasterId)}&reward_id=${encodeURIComponent(rewardId)}&id=${encodeURIComponent(redemptionId)}`;
    return this.send('PATCH', url, creds, { status });
  }

  // ---- helpers ----

  private creds(): Promise<TwitchCredentials | null> {
    const key = (this.getApiKey() ?? '').trim();
    if (!key) return Promise.resolve(null);
    return this.getCredentials(key);
  }

  private async getRewards(creds: TwitchCredentials, manageable: boolean): Promise<Array<Record<string, unknown>> | null> {
    const url = `${REWARDS_URL}?broadcaster_id=${encodeURIComponent(creds.broadcasterId)}${manageable ? '&only_manageable_rewards=true' : ''}`;
    const res = await this.helix('GET', url, creds);
    if (!res || !res.ok) return null;
    const body = (await res.json()) as { data?: unknown[] };
    return Array.isArray(body?.data) ? (body.data as Array<Record<string, unknown>>) : [];
  }

  private async helix(method: string, url: string, creds: TwitchCredentials, body?: unknown): Promise<Response | null> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      Authorization: `Bearer ${creds.accessToken}`,
      'Client-Id': this.clientId
    };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    try {
      return await this.fetch(url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
    } catch {
      return null;
    }
  }

  private async send(method: string, url: string, creds: TwitchCredentials, body: unknown): Promise<boolean> {
    const res = await this.helix(method, url, creds, body);
    return Boolean(res && res.ok);
  }

  private mapReward(r: Record<string, unknown>): ChannelReward {
    const obj = (v: unknown) => (v && typeof v === 'object' ? v as Record<string, unknown> : {});
    const gc = obj(r.global_cooldown_setting);
    const mps = obj(r.max_per_stream_setting);
    const mpu = obj(r.max_per_user_per_stream_setting);
    const image = obj(r.image);
    const defImage = obj(r.default_image);
    const id = String(r.id ?? '');
    return {
      id,
      title: String(r.title ?? ''),
      cost: Number(r.cost ?? 0),
      prompt: String(r.prompt ?? ''),
      backgroundColor: typeof r.background_color === 'string' ? r.background_color : undefined,
      isEnabled: Boolean(r.is_enabled),
      isPaused: Boolean(r.is_paused),
      isInStock: Boolean(r.is_in_stock),
      isUserInputRequired: Boolean(r.is_user_input_required),
      globalCooldownEnabled: Boolean(gc.is_enabled),
      globalCooldownSeconds: Number(gc.global_cooldown_seconds ?? 0),
      maxPerStreamEnabled: Boolean(mps.is_enabled),
      maxPerStream: Number(mps.max_per_stream ?? 0),
      maxPerUserPerStreamEnabled: Boolean(mpu.is_enabled),
      maxPerUserPerStream: Number(mpu.max_per_user_per_stream ?? 0),
      imageUrl: (typeof image.url_2x === 'string' ? image.url_2x : undefined)
        ?? (typeof defImage.url_2x === 'string' ? defImage.url_2x : undefined),
      manageable: this.manageableIds.has(id)
    };
  }

  private mapRedemption(r: Record<string, unknown>): RedemptionItem {
    const reward = (r.reward && typeof r.reward === 'object' ? r.reward as Record<string, unknown> : {});
    const status = String(r.status ?? 'UNFULFILLED') as RedemptionStatus;
    return {
      id: String(r.id ?? ''),
      rewardId: String(reward.id ?? ''),
      rewardTitle: String(reward.title ?? ''),
      rewardCost: Number(reward.cost ?? 0),
      userName: String(r.user_name ?? r.user_login ?? ''),
      userInput: String(r.user_input ?? ''),
      redeemedAt: String(r.redeemed_at ?? ''),
      status
    };
  }

  private setSnap(next: ChannelPointsSnapshot): void {
    this.snap = next;
    this.emit('changed', this.snap);
  }
}
