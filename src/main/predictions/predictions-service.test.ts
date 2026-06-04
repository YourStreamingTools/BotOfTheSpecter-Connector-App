// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { PredictionsService, validatePredictionInput } from './predictions-service';
import type { PredictionInput } from '@shared/ipc';

const creds = { accessToken: 'TOK', broadcasterId: '123' };
const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as Response;

const predInput = (over: Partial<PredictionInput> = {}): PredictionInput => ({
  title: 'Win the game?', outcomes: ['Yes', 'No'], predictionWindow: 120, ...over
});

const apiPrediction = (over: Record<string, unknown> = {}) => ({
  id: 'pr1', broadcaster_id: '123', broadcaster_name: 'X', broadcaster_login: 'x',
  title: 'Win the game?', winning_outcome_id: null,
  outcomes: [
    { id: 'o1', title: 'Yes', users: 4, channel_points: 400, top_predictors: null, color: 'BLUE' },
    { id: 'o2', title: 'No', users: 2, channel_points: 150, top_predictors: null, color: 'PINK' }
  ],
  prediction_window: 120, status: 'ACTIVE',
  created_at: '2026-06-04T00:00:00Z', ended_at: null, locked_at: null, ...over
});

describe('validatePredictionInput', () => {
  it('accepts a valid prediction', () => { expect(validatePredictionInput(predInput())).toBeNull(); });
  it('requires a title', () => { expect(validatePredictionInput(predInput({ title: ' ' }))).toMatch(/title/i); });
  it('rejects a title over 45 chars', () => { expect(validatePredictionInput(predInput({ title: 'x'.repeat(46) }))).toMatch(/45/); });
  it('requires 2–10 non-empty outcomes', () => {
    expect(validatePredictionInput(predInput({ outcomes: ['Yes'] }))).toMatch(/2/);
    expect(validatePredictionInput(predInput({ outcomes: Array.from({ length: 11 }, (_, i) => `o${i}`) }))).toMatch(/10/);
    expect(validatePredictionInput(predInput({ outcomes: ['Yes', '  '] }))).toMatch(/2/);
  });
  it('rejects an outcome over 25 chars', () => { expect(validatePredictionInput(predInput({ outcomes: ['Yes', 'z'.repeat(26)] }))).toMatch(/25/); });
  it('rejects a window outside 30–1800', () => {
    expect(validatePredictionInput(predInput({ predictionWindow: 20 }))).toMatch(/30.*1800/);
    expect(validatePredictionInput(predInput({ predictionWindow: 2000 }))).toMatch(/30.*1800/);
  });
});

describe('PredictionsService.refresh', () => {
  it('GETs helix/predictions with auth headers and maps to camelCase', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => jsonResponse({ data: [apiPrediction()] }));
    const svc = new PredictionsService({ fetch: fetchMock, clientId: 'CID', getCredentials: async () => creds, getApiKey: () => 'KEY' });
    await svc.refresh();
    const snap = svc.snapshot();
    expect(snap.state).toBe('ok');
    expect(snap.predictions[0]).toEqual({
      id: 'pr1', title: 'Win the game?', winningOutcomeId: null, predictionWindow: 120, status: 'ACTIVE',
      createdAt: '2026-06-04T00:00:00Z', endedAt: null, lockedAt: null,
      outcomes: [
        { id: 'o1', title: 'Yes', users: 4, channelPoints: 400, color: 'BLUE' },
        { id: 'o2', title: 'No', users: 2, channelPoints: 150, color: 'PINK' }
      ]
    });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/predictions');
    expect(url).toContain('broadcaster_id=123');
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer TOK');
    expect(headers['Client-Id']).toBe('CID');
  });

  it('is idle without credentials and does not fetch', async () => {
    const fetchMock = vi.fn();
    const svc = new PredictionsService({ fetch: fetchMock, getCredentials: async () => null, getApiKey: () => 'KEY' });
    await svc.refresh();
    expect(svc.snapshot()).toMatchObject({ state: 'idle', predictions: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('flags a re-authorization need on a 401 (missing scope)', async () => {
    const svc = new PredictionsService({ fetch: vi.fn(async () => jsonResponse({}, false, 401)), getCredentials: async () => creds, getApiKey: () => 'KEY' });
    await svc.refresh();
    const snap = svc.snapshot();
    expect(snap.state).toBe('error');
    expect(snap.error).toMatch(/re-?authorize|scope/i);
  });

  it('records a generic error on other failures', async () => {
    const svc = new PredictionsService({ fetch: vi.fn(async () => jsonResponse({}, false, 500)), getCredentials: async () => creds, getApiKey: () => 'KEY' });
    await svc.refresh();
    expect(svc.snapshot().state).toBe('error');
  });
});

describe('PredictionsService.create', () => {
  it('POSTs helix/predictions with the mapped body, then refreshes', async () => {
    const calls: Array<{ method: string; body: Record<string, unknown> | null }> = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
      return jsonResponse({ data: [apiPrediction()] });
    });
    const svc = new PredictionsService({ fetch: fetchMock, getCredentials: async () => creds, getApiKey: () => 'KEY' });
    expect(await svc.create(predInput({ title: 'Pizza?', outcomes: ['Yes', 'No', 'Maybe'], predictionWindow: 300 }))).toBe(true);
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({
      broadcaster_id: '123', title: 'Pizza?',
      outcomes: [{ title: 'Yes' }, { title: 'No' }, { title: 'Maybe' }],
      prediction_window: 300
    });
    expect(calls.some((c) => c.method === 'GET')).toBe(true);
  });

  it('rejects invalid input locally without hitting the network', async () => {
    const fetchMock = vi.fn();
    const svc = new PredictionsService({ fetch: fetchMock, getCredentials: async () => creds, getApiKey: () => 'KEY' });
    expect(await svc.create(predInput({ outcomes: ['only one'] }))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns false without credentials', async () => {
    const fetchMock = vi.fn();
    const svc = new PredictionsService({ fetch: fetchMock, getCredentials: async () => null, getApiKey: () => 'KEY' });
    expect(await svc.create(predInput())).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('PredictionsService.end', () => {
  it('PATCHes LOCKED without a winning outcome and refreshes', async () => {
    const calls: Array<{ method: string; body: Record<string, unknown> | null }> = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
      return jsonResponse({ data: [apiPrediction({ status: 'LOCKED' })] });
    });
    const svc = new PredictionsService({ fetch: fetchMock, getCredentials: async () => creds, getApiKey: () => 'KEY' });
    expect(await svc.end('pr1', 'LOCKED')).toBe(true);
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.body).toEqual({ broadcaster_id: '123', id: 'pr1', status: 'LOCKED' });
    expect('winning_outcome_id' in patch.body!).toBe(false);
    expect(calls.some((c) => c.method === 'GET')).toBe(true);
  });

  it('PATCHes RESOLVED with the winning outcome id', async () => {
    const calls: Array<{ method: string; body: Record<string, unknown> | null }> = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
      return jsonResponse({ data: [apiPrediction({ status: 'RESOLVED', winning_outcome_id: 'o1' })] });
    });
    const svc = new PredictionsService({ fetch: fetchMock, getCredentials: async () => creds, getApiKey: () => 'KEY' });
    expect(await svc.end('pr1', 'RESOLVED', 'o1')).toBe(true);
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.body).toEqual({ broadcaster_id: '123', id: 'pr1', status: 'RESOLVED', winning_outcome_id: 'o1' });
  });

  it('refuses to RESOLVE without a winning outcome id', async () => {
    const fetchMock = vi.fn();
    const svc = new PredictionsService({ fetch: fetchMock, getCredentials: async () => creds, getApiKey: () => 'KEY' });
    expect(await svc.end('pr1', 'RESOLVED')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('PATCHes CANCELED', async () => {
    const calls: Array<{ method: string; body: Record<string, unknown> | null }> = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
      return jsonResponse({ data: [apiPrediction({ status: 'CANCELED' })] });
    });
    const svc = new PredictionsService({ fetch: fetchMock, getCredentials: async () => creds, getApiKey: () => 'KEY' });
    expect(await svc.end('pr1', 'CANCELED')).toBe(true);
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.body).toEqual({ broadcaster_id: '123', id: 'pr1', status: 'CANCELED' });
  });

  it('rejects an invalid end status', async () => {
    const fetchMock = vi.fn();
    const svc = new PredictionsService({ fetch: fetchMock, getCredentials: async () => creds, getApiKey: () => 'KEY' });
    // @ts-expect-error invalid status is rejected at runtime too
    expect(await svc.end('pr1', 'NOPE')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
