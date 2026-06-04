import { EventEmitter } from 'events';
import { TWITCH_API_BASE, TWITCH_CLIENT_ID } from '@shared/constants';
import type {
  Prediction, PredictionOutcome, PredictionInput, PredictionEndStatus, PredictionStatus, PredictionsSnapshot
} from '@shared/ipc';
import type { TwitchCredentials } from '../api/specter-api';
import { validatePredictionInput } from '@shared/predictions';

// Re-exported for tests + callers that already import it from here.
export { validatePredictionInput };

export interface PredictionsServiceDeps {
  fetch?: typeof fetch;
  clientId?: string;
  getCredentials: (key: string) => Promise<TwitchCredentials | null>;
  /** Live API key getter (the key the credentials are fetched against). */
  getApiKey: () => string;
}

const PREDICTIONS_URL = `${TWITCH_API_BASE}/predictions`;
const PREDICTION_STATUSES: PredictionStatus[] = ['ACTIVE', 'LOCKED', 'RESOLVED', 'CANCELED'];
const SCOPE_HINT = 'Re-authorize Specter to enable predictions (missing channel:manage:predictions scope)';

/** Manages Twitch Channel Points Predictions via direct Helix (broadcaster token + Specter Client-Id) in the main process so the token never crosses IPC: GET list, POST create, PATCH end (LOCKED / RESOLVED with winning outcome / CANCELED); one prediction at a time; requires channel:manage:predictions scope (401 → re-authorize hint); renderer re-fetches on an interval since there's no live event feed. */
export class PredictionsService extends EventEmitter {
  private fetch: typeof fetch;
  private clientId: string;
  private getCredentials: (key: string) => Promise<TwitchCredentials | null>;
  private getApiKey: () => string;
  private snap: PredictionsSnapshot = { predictions: [], state: 'idle' };

  constructor(deps: PredictionsServiceDeps) {
    super();
    this.fetch = deps.fetch ?? fetch;
    this.clientId = deps.clientId ?? TWITCH_CLIENT_ID;
    this.getCredentials = deps.getCredentials;
    this.getApiKey = deps.getApiKey;
  }

  snapshot(): PredictionsSnapshot {
    return this.snap;
  }

  async refresh(): Promise<void> {
    const creds = await this.creds();
    if (!creds) { this.setSnap({ predictions: [], state: 'idle', error: undefined }); return; }
    this.setSnap({ ...this.snap, state: 'loading', error: undefined });
    try {
      const url = `${PREDICTIONS_URL}?broadcaster_id=${encodeURIComponent(creds.broadcasterId)}&first=25`;
      const res = await this.helix('GET', url, creds);
      if (!res || !res.ok) {
        const error = res && res.status === 401 ? SCOPE_HINT : (res ? `HTTP ${res.status}` : 'fetch failed');
        this.setSnap({ predictions: [], state: 'error', error });
        return;
      }
      const body = (await res.json()) as { data?: unknown[] };
      const predictions = Array.isArray(body?.data) ? body.data.map((p) => mapPrediction(p as Record<string, unknown>)) : [];
      this.setSnap({ predictions, state: 'ok', error: undefined, fetchedAt: new Date().toISOString() });
    } catch (err) {
      this.setSnap({ predictions: [], state: 'error', error: err instanceof Error ? err.message : 'fetch failed' });
    }
  }

  async create(input: PredictionInput): Promise<boolean> {
    if (validatePredictionInput(input) !== null) return false;
    const creds = await this.creds();
    if (!creds) return false;
    const outcomes = input.outcomes.map((o) => o.trim()).filter((o) => o.length > 0).map((title) => ({ title }));
    const body: Record<string, unknown> = {
      broadcaster_id: creds.broadcasterId,
      title: input.title.trim(),
      outcomes,
      prediction_window: input.predictionWindow
    };
    const ok = await this.send('POST', PREDICTIONS_URL, creds, body);
    if (ok) await this.refresh();
    return ok;
  }

  /** Lock / resolve / cancel a prediction. RESOLVED requires the winning outcome id. */
  async end(id: string, status: PredictionEndStatus, winningOutcomeId?: string): Promise<boolean> {
    if (status !== 'LOCKED' && status !== 'RESOLVED' && status !== 'CANCELED') return false;
    if (status === 'RESOLVED' && !winningOutcomeId) return false;
    const creds = await this.creds();
    if (!creds || !id) return false;
    const body: Record<string, unknown> = { broadcaster_id: creds.broadcasterId, id, status };
    if (status === 'RESOLVED') body.winning_outcome_id = winningOutcomeId;
    const ok = await this.send('PATCH', PREDICTIONS_URL, creds, body);
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

  private setSnap(next: PredictionsSnapshot): void {
    this.snap = next;
    this.emit('changed', this.snap);
  }
}

function mapPrediction(p: Record<string, unknown>): Prediction {
  const status = String(p.status ?? 'ACTIVE');
  return {
    id: String(p.id ?? ''),
    title: String(p.title ?? ''),
    outcomes: Array.isArray(p.outcomes) ? p.outcomes.map((o) => mapOutcome(o as Record<string, unknown>)) : [],
    winningOutcomeId: p.winning_outcome_id != null ? String(p.winning_outcome_id) : null,
    predictionWindow: Number(p.prediction_window ?? 0),
    status: (PREDICTION_STATUSES.includes(status as PredictionStatus) ? status : 'ACTIVE') as PredictionStatus,
    createdAt: String(p.created_at ?? ''),
    endedAt: p.ended_at != null ? String(p.ended_at) : null,
    lockedAt: p.locked_at != null ? String(p.locked_at) : null
  };
}

function mapOutcome(o: Record<string, unknown>): PredictionOutcome {
  return {
    id: String(o.id ?? ''),
    title: String(o.title ?? ''),
    users: Number(o.users ?? 0),
    channelPoints: Number(o.channel_points ?? 0),
    color: typeof o.color === 'string' ? o.color : 'BLUE'
  };
}
