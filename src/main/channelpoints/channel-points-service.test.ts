// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { ChannelPointsService } from './channel-points-service';

const creds = { accessToken: 'TOK', broadcasterId: '274637212' };
const json = (body: unknown, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body }) as Response;

// A Helix custom_reward object (only the fields the service reads).
const reward = (id: string, over: Record<string, unknown> = {}) => ({
  id, title: `r${id}`, cost: 100, prompt: '', background_color: '#00E5CB',
  is_enabled: true, is_paused: false, is_in_stock: true, is_user_input_required: false,
  global_cooldown_setting: { is_enabled: false, global_cooldown_seconds: 0 },
  max_per_stream_setting: { is_enabled: false, max_per_stream: 0 },
  max_per_user_per_stream_setting: { is_enabled: false, max_per_user_per_stream: 0 },
  default_image: { url_2x: 'https://img/2x.png' },
  ...over
});

const makeService = (fetchMock: ReturnType<typeof vi.fn>) =>
  new ChannelPointsService({ fetch: fetchMock as unknown as typeof fetch, getCredentials: async () => creds, clientId: 'CID', getApiKey: () => 'KEY' });

describe('ChannelPointsService.refresh', () => {
  it('fetches all + manageable rewards and flags which are manageable', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      const u = String(url);
      if (u.includes('only_manageable_rewards=true')) return json({ data: [reward('a')] });
      return json({ data: [reward('a'), reward('b')] }); // all
    });
    const svc = makeService(fetchMock);
    await svc.refresh();
    const snap = svc.snapshot();
    expect(snap.state).toBe('ok');
    expect(snap.rewards.map((r) => [r.id, r.manageable])).toEqual([['a', true], ['b', false]]);
    // Auth headers on the GET.
    const [, opts] = fetchMock.mock.calls[0];
    const h = (opts as { headers: Record<string, string> }).headers;
    expect(h.Authorization).toBe('Bearer TOK');
    expect(h['Client-Id']).toBe('CID');
  });

  it('maps Helix fields (cost, cooldown, image) to the camelCase model', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('only_manageable_rewards=true')) return json({ data: [] });
      return json({ data: [reward('a', { cost: 500, image: { url_2x: 'https://custom/2x.png' }, global_cooldown_setting: { is_enabled: true, global_cooldown_seconds: 60 } })] });
    });
    const svc = makeService(fetchMock);
    await svc.refresh();
    expect(svc.snapshot().rewards[0]).toMatchObject({
      id: 'a', cost: 500, globalCooldownEnabled: true, globalCooldownSeconds: 60, imageUrl: 'https://custom/2x.png', manageable: false
    });
  });

  it('is idle without credentials (no fetch)', async () => {
    const fetchMock = vi.fn();
    const svc = new ChannelPointsService({ fetch: fetchMock as unknown as typeof fetch, getCredentials: async () => null, clientId: 'CID', getApiKey: () => '' });
    await svc.refresh();
    expect(svc.snapshot()).toMatchObject({ state: 'idle', rewards: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records an error when Helix fails', async () => {
    const svc = makeService(vi.fn(async () => json({}, 500)));
    await svc.refresh();
    expect(svc.snapshot().state).toBe('error');
  });

  it('emits "changed" with a loading transition then ok', async () => {
    const fetchMock = vi.fn(async () => json({ data: [] }));
    const svc = makeService(fetchMock);
    const states: string[] = [];
    svc.on('changed', (s: { state: string }) => states.push(s.state));
    await svc.refresh();
    expect(states[0]).toBe('loading');
    expect(states.at(-1)).toBe('ok');
  });
});

describe('ChannelPointsService.createReward', () => {
  it('POSTs to custom_rewards with broadcaster_id and a snake_case body, then refreshes', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
      return json({ data: [reward('new1')] });
    });
    const svc = makeService(fetchMock);
    const ok = await svc.createReward({ title: 'Hydrate', cost: 300, prompt: 'drink', isGlobalCooldownEnabled: true, globalCooldownSeconds: 60 });
    expect(ok).toBe(true);
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.url).toContain('/channel_points/custom_rewards');
    expect(post.url).toContain('broadcaster_id=274637212');
    expect(post.url).not.toContain('&id='); // create has no reward id
    expect(post.body).toEqual({ title: 'Hydrate', cost: 300, prompt: 'drink', is_global_cooldown_enabled: true, global_cooldown_seconds: 60 });
    // re-lists after create
    expect(calls.some((c) => c.method === 'GET')).toBe(true);
  });

  it('rejects invalid input locally (no title / cost < 1) without POSTing', async () => {
    const fetchMock = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => json({ data: [] }));
    const svc = makeService(fetchMock);
    expect(await svc.createReward({ title: '', cost: 100 })).toBe(false);
    expect(await svc.createReward({ title: 'X', cost: 0 })).toBe(false);
    expect(fetchMock.mock.calls.some(([, o]) => (o as RequestInit | undefined)?.method === 'POST')).toBe(false);
  });

  it('returns false without credentials', async () => {
    const fetchMock = vi.fn();
    const svc = new ChannelPointsService({ fetch: fetchMock as unknown as typeof fetch, getCredentials: async () => null, clientId: 'CID', getApiKey: () => '' });
    expect(await svc.createReward({ title: 'X', cost: 100 })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('ChannelPointsService.updateReward', () => {
  it('PATCHes custom_rewards with the broadcaster_id+id and a snake_case body, then refreshes', async () => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
      return json({ data: [reward('a')] });
    });
    const svc = makeService(fetchMock);
    // Seed the manageable set so the service knows 'a' is editable.
    await svc.refresh();
    calls.length = 0;
    const ok = await svc.updateReward('a', { isEnabled: false, cost: 200, isGlobalCooldownEnabled: true, globalCooldownSeconds: 90 });
    expect(ok).toBe(true);
    const patch = calls.find((c) => c.method === 'PATCH')!;
    expect(patch.url).toContain('/channel_points/custom_rewards');
    expect(patch.url).toContain('broadcaster_id=274637212');
    expect(patch.url).toContain('id=a');
    expect(patch.body).toEqual({ is_enabled: false, cost: 200, is_global_cooldown_enabled: true, global_cooldown_seconds: 90 });
  });

  it('refuses to update a non-manageable reward (no PATCH)', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, _init?: RequestInit) => {
      if (String(url).includes('only_manageable_rewards=true')) return json({ data: [] }); // none manageable
      return json({ data: [reward('b')] });
    });
    const svc = makeService(fetchMock);
    await svc.refresh();
    const patchesBefore = fetchMock.mock.calls.filter(([, o]) => (o as RequestInit | undefined)?.method === 'PATCH').length;
    expect(await svc.updateReward('b', { isEnabled: false })).toBe(false);
    const patchesAfter = fetchMock.mock.calls.filter(([, o]) => (o as RequestInit | undefined)?.method === 'PATCH').length;
    expect(patchesAfter).toBe(patchesBefore);
  });
});

describe('ChannelPointsService.importReward', () => {
  // Seed the snapshot with one non-manageable reward, then discard the refresh traffic.
  const importReady = async (over: Record<string, unknown> = {}) => {
    const calls: Array<{ url: string; method: string; body: unknown }> = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : null });
      if (String(url).includes('only_manageable_rewards=true')) return json({ data: [] }); // none manageable
      return json({ data: [reward('a', over)] });
    });
    const svc = makeService(fetchMock);
    await svc.refresh();
    calls.length = 0;
    return { svc, calls };
  };

  it('recreates the reward with a "Specter-" prefixed title and copied fields, then refreshes', async () => {
    const { svc, calls } = await importReady({
      title: 'Coffee', cost: 250, prompt: 'gimme', is_user_input_required: true, background_color: '#112233',
      global_cooldown_setting: { is_enabled: true, global_cooldown_seconds: 30 }
    });
    expect(await svc.importReward('a')).toBe(true);
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.url).toContain('/channel_points/custom_rewards');
    expect(post.url).toContain('broadcaster_id=274637212');
    expect(post.url).not.toContain('&id=');
    expect(post.body).toMatchObject({
      title: 'Specter-Coffee', cost: 250, prompt: 'gimme', is_user_input_required: true,
      background_color: '#112233', is_global_cooldown_enabled: true, global_cooldown_seconds: 30
    });
    expect(calls.some((c) => c.method === 'DELETE')).toBe(false); // Twitch always 403s a non-owned reward
    expect(calls.some((c) => c.method === 'GET')).toBe(true);     // re-lists after import
  });

  it('caps the prefixed title at 45 characters', async () => {
    const { svc, calls } = await importReady({ title: 'C'.repeat(45) });
    expect(await svc.importReward('a')).toBe(true);
    const title = (calls.find((c) => c.method === 'POST')!.body as { title: string }).title;
    expect(title.startsWith('Specter-')).toBe(true);
    expect(title.length).toBe(45);
  });

  it('returns false for a reward id not in the snapshot, without POSTing', async () => {
    const { svc, calls } = await importReady();
    expect(await svc.importReward('zzz')).toBe(false);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
  });

  it('returns false when Twitch rejects the create (e.g. duplicate name)', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (method === 'POST') return json({ error: 'Bad Request' }, 400);
      if (String(url).includes('only_manageable_rewards=true')) return json({ data: [] });
      return json({ data: [reward('a', { title: 'Coffee' })] });
    });
    const svc = makeService(fetchMock);
    await svc.refresh();
    expect(await svc.importReward('a')).toBe(false);
  });
});

describe('ChannelPointsService redemptions', () => {
  it('lists UNFULFILLED redemptions for a reward, mapped', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => json({ data: [
      { id: 'rd1', user_name: 'owl', user_input: 'hi', redeemed_at: '2026-06-01T00:00:00Z', status: 'UNFULFILLED', reward: { id: 'a', title: 'Hydrate', cost: 100 } }
    ] }));
    const svc = makeService(fetchMock);
    const list = await svc.listRedemptions('a');
    expect(list).toEqual([{ id: 'rd1', rewardId: 'a', rewardTitle: 'Hydrate', rewardCost: 100, userName: 'owl', userInput: 'hi', redeemedAt: '2026-06-01T00:00:00Z', status: 'UNFULFILLED' }]);
    const u = String(fetchMock.mock.calls[0][0]);
    expect(u).toContain('/channel_points/custom_rewards/redemptions');
    expect(u).toContain('reward_id=a');
    expect(u).toContain('status=UNFULFILLED');
  });

  it('sets a redemption status via PATCH with reward_id + id', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => json({ data: [{ id: 'rd1', status: 'CANCELED' }] }));
    const svc = makeService(fetchMock);
    expect(await svc.setRedemption('a', 'rd1', 'CANCELED')).toBe(true);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('reward_id=a');
    expect(String(url)).toContain('id=rd1');
    expect((opts as RequestInit).method).toBe('PATCH');
    expect(JSON.parse(String((opts as RequestInit).body))).toEqual({ status: 'CANCELED' });
  });
});
