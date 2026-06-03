// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { RafflesService, validateRaffleInput } from './raffles-service';
import type { RaffleInput } from '@shared/ipc';

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as Response;

const raffle = (over: Partial<RaffleInput> = {}): RaffleInput => ({
  name: 'Big Giveaway', prize: 'A T-shirt', numberOfWinners: 1, isWeighted: false,
  weightSubT1: 2, weightSubT2: 3, weightSubT3: 4, weightVip: 1.5,
  excludeMods: false, subscribersOnly: false, followersOnly: false,
  followersMinEnabled: false, followersMinValue: 0, followersMinUnit: 'days', ...over
});

describe('validateRaffleInput', () => {
  it('accepts a valid raffle', () => {
    expect(validateRaffleInput(raffle())).toBeNull();
  });

  it('rejects an empty name', () => {
    expect(validateRaffleInput(raffle({ name: '   ' }))).toMatch(/name/i);
  });

  it('rejects a non-positive or non-integer winner count', () => {
    expect(validateRaffleInput(raffle({ numberOfWinners: 0 }))).toMatch(/winner/i);
    expect(validateRaffleInput(raffle({ numberOfWinners: -2 }))).toMatch(/winner/i);
    expect(validateRaffleInput(raffle({ numberOfWinners: 1.5 }))).toMatch(/winner/i);
  });

  it('rejects weights outside 1–999.99', () => {
    expect(validateRaffleInput(raffle({ weightSubT1: 0.5 }))).toMatch(/weight/i);
    expect(validateRaffleInput(raffle({ weightVip: 1000 }))).toMatch(/weight/i);
  });

  it('accepts the weight boundaries', () => {
    expect(validateRaffleInput(raffle({ weightSubT1: 1, weightSubT2: 999.99, weightSubT3: 1, weightVip: 1 }))).toBeNull();
  });
});

describe('RafflesService.refresh', () => {
  it('lists raffles from /raffles and maps API snake_case → camelCase', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => jsonResponse({
      raffles: [{
        id: 1, name: 'Giveaway', prize: 'Shirt', number_of_winners: 2, status: 'running',
        is_weighted: true, weight_sub_t1: 2, weight_sub_t2: 3, weight_sub_t3: 4, weight_vip: 1.5,
        exclude_mods: false, subscribers_only: true, followers_only: false,
        followers_min_enabled: false, followers_min_value: 0, followers_min_unit: 'days',
        created_at: '2026-06-03T00:00:00', entry_count: 5, winner_count: 0, winners: []
      }]
    }));
    const svc = new RafflesService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    await svc.refresh();
    const snap = svc.snapshot();
    expect(snap.state).toBe('ok');
    expect(snap.raffles[0]).toEqual({
      id: 1, name: 'Giveaway', prize: 'Shirt', numberOfWinners: 2, status: 'running',
      isWeighted: true, weightSubT1: 2, weightSubT2: 3, weightSubT3: 4, weightVip: 1.5,
      excludeMods: false, subscribersOnly: true, followersOnly: false,
      followersMinEnabled: false, followersMinValue: 0, followersMinUnit: 'days',
      createdAt: '2026-06-03T00:00:00', entryCount: 5, winnerCount: 0, winners: []
    });
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/raffles');
    expect(url).toContain('api_key=KEY');
  });

  it('is idle and does not fetch without an API key', async () => {
    const fetchMock = vi.fn();
    const svc = new RafflesService({ fetch: fetchMock, getApiKey: () => '' });
    await svc.refresh();
    expect(svc.snapshot()).toMatchObject({ state: 'idle', raffles: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records an error on a failed request', async () => {
    const svc = new RafflesService({ fetch: vi.fn(async () => jsonResponse({}, false, 500)), getApiKey: () => 'KEY' });
    await svc.refresh();
    expect(svc.snapshot().state).toBe('error');
  });

  it('emits "changed" with a loading transition then the result', async () => {
    const svc = new RafflesService({ fetch: vi.fn(async () => jsonResponse({ raffles: [] })), getApiKey: () => 'KEY' });
    const states: string[] = [];
    svc.on('changed', (s: { state: string }) => states.push(s.state));
    await svc.refresh();
    expect(states[0]).toBe('loading');
    expect(states.at(-1)).toBe('ok');
  });
});

describe('RafflesService.create', () => {
  it('POSTs to /raffles/add with mapped snake_case params and refreshes', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${String(url)}`);
      return jsonResponse(String(url).includes('/raffles/add') ? { status: 'success', id: 7 } : { raffles: [] });
    });
    const svc = new RafflesService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    expect(await svc.create(raffle({ name: 'Cool', numberOfWinners: 3, isWeighted: true }))).toBe(true);
    const add = calls.find((c) => c.includes('/raffles/add'))!;
    expect(add).toContain('POST');
    expect(add).toContain('name=Cool');
    expect(add).toContain('number_of_winners=3');
    expect(add).toContain('is_weighted=true');
    expect(add).toContain('weight_sub_t1=2');
    // re-lists afterwards
    expect(calls.some((c) => c.includes('/raffles?') || /\/raffles$/.test(c.split(' ')[1].split('?')[0]))).toBe(true);
  });

  it('rejects invalid input locally without hitting the network', async () => {
    const fetchMock = vi.fn();
    const svc = new RafflesService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    expect(await svc.create(raffle({ name: '' }))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns false without an API key', async () => {
    const fetchMock = vi.fn();
    const svc = new RafflesService({ fetch: fetchMock, getApiKey: () => '' });
    expect(await svc.create(raffle())).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('RafflesService.update / start / stop / delete', () => {
  it('PUTs to /raffles/update with the id and mapped params', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(String(url).includes('/raffles/update') ? { status: 'success' } : { raffles: [] }, true));
    const svc = new RafflesService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    expect(await svc.update(3, raffle({ name: 'Edited', numberOfWinners: 2 }))).toBe(true);
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/raffles/update'))!;
    expect((call[1] as RequestInit).method).toBe('PUT');
    expect(String(call[0])).toContain('id=3');
    expect(String(call[0])).toContain('name=Edited');
  });

  it('PUTs to /raffles/start with the id', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(String(url).includes('/raffles/start') ? { status: 'success' } : { raffles: [] }, true));
    const svc = new RafflesService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    expect(await svc.start(5)).toBe(true);
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/raffles/start'))!;
    expect((call[1] as RequestInit).method).toBe('PUT');
    expect(String(call[0])).toContain('id=5');
  });

  it('PUTs to /raffles/stop with the id', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      jsonResponse(String(url).includes('/raffles/stop') ? { status: 'success' } : { raffles: [] }, true));
    const svc = new RafflesService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    expect(await svc.stop(5)).toBe(true);
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/raffles/stop'))!;
    expect(String(call[0])).toContain('id=5');
  });

  it('DELETEs to /raffles/delete with the id', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(String(url).includes('/raffles/delete') ? { status: 'success' } : { raffles: [] }, true));
    const svc = new RafflesService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    expect(await svc.delete(9)).toBe(true);
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/raffles/delete'))!;
    expect((call[1] as RequestInit).method).toBe('DELETE');
    expect(String(call[0])).toContain('id=9');
  });

  it('returns false on a failed mutation', async () => {
    const svc = new RafflesService({ fetch: vi.fn(async () => jsonResponse({}, false, 409)), getApiKey: () => 'KEY' });
    expect(await svc.start(9)).toBe(false);
  });
});

describe('RafflesService.draw', () => {
  it('POSTs to /raffles/draw and returns the winner usernames', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) =>
      jsonResponse(String(url).includes('/raffles/draw')
        ? { status: 'success', winners: ['owl', 'fox'] } : { raffles: [] }, true));
    const svc = new RafflesService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    expect(await svc.draw(4)).toEqual(['owl', 'fox']);
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/raffles/draw'))!;
    expect((call[1] as RequestInit).method).toBe('POST');
    expect(String(call[0])).toContain('id=4');
  });

  it('returns null when the draw fails', async () => {
    const svc = new RafflesService({ fetch: vi.fn(async () => jsonResponse({}, false, 409)), getApiKey: () => 'KEY' });
    expect(await svc.draw(4)).toBeNull();
  });
});

describe('RafflesService.entries / winners', () => {
  it('GETs /raffles/entries and maps to RaffleEntry[]', async () => {
    const fetchMock = vi.fn(async (_url?: string | URL | Request) => jsonResponse({
      entries: [{ id: 11, raffle_id: 4, user_id: '900', username: 'owl', weight: 100, source: 'Twitch', entered_at: '2026-06-03T00:00:00' }]
    }));
    const svc = new RafflesService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    const entries = await svc.entries(4);
    expect(entries).toEqual([{ id: 11, raffleId: 4, userId: '900', username: 'owl', weight: 100, source: 'Twitch', enteredAt: '2026-06-03T00:00:00' }]);
    expect(String(fetchMock.mock.calls[0][0])).toContain('raffle_id=4');
  });

  it('GETs /raffles/winners and maps to RaffleWinner[]', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({
      winners: [{ id: 2, raffle_id: 4, entry_id: 11, user_id: '900', username: 'owl', source: 'Twitch', won_at: '2026-06-03T00:00:00' }]
    }));
    const svc = new RafflesService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    const winners = await svc.winners(4);
    expect(winners).toEqual([{ id: 2, raffleId: 4, entryId: 11, userId: '900', username: 'owl', source: 'Twitch', wonAt: '2026-06-03T00:00:00' }]);
  });

  it('returns [] without an API key', async () => {
    const fetchMock = vi.fn();
    const svc = new RafflesService({ fetch: fetchMock, getApiKey: () => '' });
    expect(await svc.entries(4)).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
