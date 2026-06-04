import { EventEmitter } from 'events';
import { TWITCH_API_BASE, TWITCH_CLIENT_ID } from '@shared/constants';
import type { Poll, PollChoice, PollInput, PollEndStatus, PollStatus, PollsSnapshot } from '@shared/ipc';
import type { TwitchCredentials } from '../api/specter-api';
import { validatePollInput } from '@shared/polls';

// Re-exported for tests + callers that already import it from here.
export { validatePollInput };

export interface PollsServiceDeps {
  fetch?: typeof fetch;
  clientId?: string;
  getCredentials: (key: string) => Promise<TwitchCredentials | null>;
  /** Live API key getter (the key the credentials are fetched against). */
  getApiKey: () => string;
}

const POLLS_URL = `${TWITCH_API_BASE}/polls`;
const POLL_STATUSES: PollStatus[] = ['ACTIVE', 'COMPLETED', 'TERMINATED', 'ARCHIVED', 'MODERATED', 'INVALID'];

/**
 * Manages Twitch polls via direct Helix (broadcaster token + the Specter Client-Id):
 * GET helix/polls (list, last 90 days), POST helix/polls (create), PATCH helix/polls
 * (end → TERMINATED or ARCHIVED). Lives in the main process so the token never crosses
 * IPC. Only one poll can be ACTIVE at a time (Twitch rejects a second). There is no
 * live event feed, so the renderer re-fetches on a short interval while a poll runs.
 */
export class PollsService extends EventEmitter {
  private fetch: typeof fetch;
  private clientId: string;
  private getCredentials: (key: string) => Promise<TwitchCredentials | null>;
  private getApiKey: () => string;
  private snap: PollsSnapshot = { polls: [], state: 'idle' };

  constructor(deps: PollsServiceDeps) {
    super();
    this.fetch = deps.fetch ?? fetch;
    this.clientId = deps.clientId ?? TWITCH_CLIENT_ID;
    this.getCredentials = deps.getCredentials;
    this.getApiKey = deps.getApiKey;
  }

  snapshot(): PollsSnapshot {
    return this.snap;
  }

  async refresh(): Promise<void> {
    const creds = await this.creds();
    if (!creds) { this.setSnap({ polls: [], state: 'idle', error: undefined }); return; }
    this.setSnap({ ...this.snap, state: 'loading', error: undefined });
    try {
      const url = `${POLLS_URL}?broadcaster_id=${encodeURIComponent(creds.broadcasterId)}&first=20`;
      const res = await this.helix('GET', url, creds);
      if (!res || !res.ok) {
        this.setSnap({ polls: [], state: 'error', error: res ? `HTTP ${res.status}` : 'fetch failed' });
        return;
      }
      const body = (await res.json()) as { data?: unknown[] };
      const polls = Array.isArray(body?.data) ? body.data.map((p) => mapPoll(p as Record<string, unknown>)) : [];
      this.setSnap({ polls, state: 'ok', error: undefined, fetchedAt: new Date().toISOString() });
    } catch (err) {
      this.setSnap({ polls: [], state: 'error', error: err instanceof Error ? err.message : 'fetch failed' });
    }
  }

  async create(input: PollInput): Promise<boolean> {
    if (validatePollInput(input) !== null) return false;
    const creds = await this.creds();
    if (!creds) return false;
    const choices = input.choices.map((c) => c.trim()).filter((c) => c.length > 0).map((title) => ({ title }));
    const body: Record<string, unknown> = {
      broadcaster_id: creds.broadcasterId,
      title: input.title.trim(),
      choices,
      duration: input.duration,
      channel_points_voting_enabled: input.channelPointsVotingEnabled
    };
    if (input.channelPointsVotingEnabled) body.channel_points_per_vote = input.channelPointsPerVote;
    const ok = await this.send('POST', POLLS_URL, creds, body);
    if (ok) await this.refresh();
    return ok;
  }

  async end(id: string, status: PollEndStatus): Promise<boolean> {
    if (status !== 'TERMINATED' && status !== 'ARCHIVED') return false;
    const creds = await this.creds();
    if (!creds || !id) return false;
    const ok = await this.send('PATCH', POLLS_URL, creds, { broadcaster_id: creds.broadcasterId, id, status });
    if (ok) await this.refresh();
    return ok;
  }

  // ---- helpers ----

  private creds(): Promise<TwitchCredentials | null> {
    const key = (this.getApiKey() ?? '').trim();
    if (!key) return Promise.resolve(null);
    return this.getCredentials(key);
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

  private setSnap(next: PollsSnapshot): void {
    this.snap = next;
    this.emit('changed', this.snap);
  }
}

function mapPoll(p: Record<string, unknown>): Poll {
  const status = String(p.status ?? 'INVALID');
  return {
    id: String(p.id ?? ''),
    title: String(p.title ?? ''),
    choices: Array.isArray(p.choices) ? p.choices.map((c) => mapChoice(c as Record<string, unknown>)) : [],
    status: (POLL_STATUSES.includes(status as PollStatus) ? status : 'INVALID') as PollStatus,
    duration: Number(p.duration ?? 0),
    channelPointsVotingEnabled: Boolean(p.channel_points_voting_enabled),
    channelPointsPerVote: Number(p.channel_points_per_vote ?? 0),
    startedAt: String(p.started_at ?? ''),
    endedAt: p.ended_at != null ? String(p.ended_at) : null
  };
}

function mapChoice(c: Record<string, unknown>): PollChoice {
  return {
    id: String(c.id ?? ''),
    title: String(c.title ?? ''),
    votes: Number(c.votes ?? 0),
    channelPointsVotes: Number(c.channel_points_votes ?? 0)
  };
}
