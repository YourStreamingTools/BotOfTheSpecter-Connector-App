// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { PollsService, validatePollInput } from './polls-service';
import type { PollInput } from '@shared/ipc';

const creds = { accessToken: 'TOK', broadcasterId: '123' };
const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as Response;

const pollInput = (over: Partial<PollInput> = {}): PollInput => ({
  title: 'Best game?', choices: ['Apex', 'Valorant'], duration: 120,
  channelPointsVotingEnabled: false, channelPointsPerVote: 0, ...over
});

const apiPoll = (over: Record<string, unknown> = {}) => ({
  id: 'p1', broadcaster_id: '123', broadcaster_name: 'X', broadcaster_login: 'x',
  title: 'Best game?',
  choices: [
    { id: 'c1', title: 'Apex', votes: 3, channel_points_votes: 1, bits_votes: 0 },
    { id: 'c2', title: 'Valorant', votes: 5, channel_points_votes: 0, bits_votes: 0 }
  ],
  bits_voting_enabled: false, bits_per_vote: 0,
  channel_points_voting_enabled: true, channel_points_per_vote: 100,
  status: 'ACTIVE', duration: 120, started_at: '2026-06-04T00:00:00Z', ended_at: null, ...over
});

describe('validatePollInput', () => {
  it('accepts a valid poll', () => { expect(validatePollInput(pollInput())).toBeNull(); });
  it('requires a title', () => { expect(validatePollInput(pollInput({ title: '  ' }))).toMatch(/title/i); });
  it('rejects a title over 60 chars', () => { expect(validatePollInput(pollInput({ title: 'x'.repeat(61) }))).toMatch(/60/); });
  it('requires 2–5 non-empty choices', () => {
    expect(validatePollInput(pollInput({ choices: ['Apex'] }))).toMatch(/2/);
    expect(validatePollInput(pollInput({ choices: ['a', 'b', 'c', 'd', 'e', 'f'] }))).toMatch(/5/);
    expect(validatePollInput(pollInput({ choices: ['Apex', '  '] }))).toMatch(/2/);
  });
  it('rejects a choice over 25 chars', () => { expect(validatePollInput(pollInput({ choices: ['Apex', 'y'.repeat(26)] }))).toMatch(/25/); });
  it('rejects a duration outside 15–1800', () => {
    expect(validatePollInput(pollInput({ duration: 10 }))).toMatch(/15.*1800/);
    expect(validatePollInput(pollInput({ duration: 2000 }))).toMatch(/15.*1800/);
  });
  it('validates channel points per vote only when enabled', () => {
    expect(validatePollInput(pollInput({ channelPointsVotingEnabled: true, channelPointsPerVote: 0 }))).toMatch(/point/i);
    expect(validatePollInput(pollInput({ channelPointsVotingEnabled: true, channelPointsPerVote: 100 }))).toBeNull();
    // ignored when disabled
    expect(validatePollInput(pollInput({ channelPointsVotingEnabled: false, channelPointsPerVote: 0 }))).toBeNull();
  });
});

describe('PollsService.refresh', () => {
  it('GETs helix/polls with auth headers and maps to camelCase', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => jsonResponse({ data: [apiPoll()] }));
    const svc = new PollsService({ fetch: fetchMock, clientId: 'CID', getCredentials: async () => creds, getApiKey: () => 'KEY' });
    await svc.refresh();
    const snap = svc.snapshot();
    expect(snap.state).toBe('ok');
    expect(snap.polls[0]).toEqual({
      id: 'p1', title: 'Best game?',
      choices: [
        { id: 'c1', title: 'Apex', votes: 3, channelPointsVotes: 1 },
        { id: 'c2', title: 'Valorant', votes: 5, channelPointsVotes: 0 }
      ],
      status: 'ACTIVE', duration: 120, channelPointsVotingEnabled: true, channelPointsPerVote: 100,
      startedAt: '2026-06-04T00:00:00Z', endedAt: null
    });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/polls');
    expect(url).toContain('broadcaster_id=123');
    const headers = (fetchMock.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer TOK');
    expect(headers['Client-Id']).toBe('CID');
  });

  it('is idle without credentials and does not fetch', async () => {
    const fetchMock = vi.fn();
    const svc = new PollsService({ fetch: fetchMock, getCredentials: async () => null, getApiKey: () => 'KEY' });
    await svc.refresh();
    expect(svc.snapshot()).toMatchObject({ state: 'idle', polls: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records an error on a failed request', async () => {
    const svc = new PollsService({ fetch: vi.fn(async () => jsonResponse({}, false, 500)), getCredentials: async () => creds, getApiKey: () => 'KEY' });
    await svc.refresh();
    expect(svc.snapshot().state).toBe('error');
  });
});

describe('PollsService.create', () => {
  it('POSTs helix/polls with the mapped body, then refreshes', async () => {
    const calls: Array<{ method: string; body: Record<string, unknown> | null }> = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
      return jsonResponse({ data: [apiPoll()] });
    });
    const svc = new PollsService({ fetch: fetchMock, getCredentials: async () => creds, getApiKey: () => 'KEY' });
    expect(await svc.create(pollInput({
      title: 'Map?', choices: ['One', 'Two', 'Three'], duration: 300,
      channelPointsVotingEnabled: true, channelPointsPerVote: 50
    }))).toBe(true);
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({
      broadcaster_id: '123', title: 'Map?',
      choices: [{ title: 'One' }, { title: 'Two' }, { title: 'Three' }],
      duration: 300, channel_points_voting_enabled: true, channel_points_per_vote: 50
    });
    expect(calls.some((c) => c.method === 'GET')).toBe(true); // re-listed
  });

  it('omits channel_points_per_vote when voting is disabled', async () => {
    const calls: Array<{ method: string; body: Record<string, unknown> | null }> = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
      return jsonResponse({ data: [] });
    });
    const svc = new PollsService({ fetch: fetchMock, getCredentials: async () => creds, getApiKey: () => 'KEY' });
    await svc.create(pollInput({ channelPointsVotingEnabled: false, channelPointsPerVote: 999 }));
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.body!.channel_points_voting_enabled).toBe(false);
    expect('channel_points_per_vote' in post.body!).toBe(false);
  });

  it('rejects invalid input locally without hitting the network', async () => {
    const fetchMock = vi.fn();
    const svc = new PollsService({ fetch: fetchMock, getCredentials: async () => creds, getApiKey: () => 'KEY' });
    expect(await svc.create(pollInput({ choices: ['only one'] }))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns false without credentials', async () => {
    const fetchMock = vi.fn();
    const svc = new PollsService({ fetch: fetchMock, getCredentials: async () => null, getApiKey: () => 'KEY' });
    expect(await svc.create(pollInput())).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('PollsService.end', () => {
  it('PATCHes helix/polls with the status and refreshes', async () => {
    const calls: Array<{ method: string; body: Record<string, unknown> | null }> = [];
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
      return jsonResponse({ data: [apiPoll({ status: 'TERMINATED' })] });
    });
    const svc = new PollsService({ fetch: fetchMock, getCredentials: async () => creds, getApiKey: () => 'KEY' });
    expect(await svc.end('p1', 'TERMINATED')).toBe(true);
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.body).toEqual({ broadcaster_id: '123', id: 'p1', status: 'TERMINATED' });
    expect(calls.some((c) => c.method === 'GET')).toBe(true);
  });

  it('rejects an invalid end status', async () => {
    const fetchMock = vi.fn();
    const svc = new PollsService({ fetch: fetchMock, getCredentials: async () => creds, getApiKey: () => 'KEY' });
    // @ts-expect-error invalid status is rejected at runtime too
    expect(await svc.end('p1', 'NOPE')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
