// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { CommandsService } from './commands-service';

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as Response;

// Test fixtures; real shape is { commands: { <name>: {...} } } where one entry is literally named "commands" — the parser must treat it as an entry, not descend into it.
const BUILTIN = {
  commands: {
    commands: { description: 'Lists all commands.', aliases: ['cmds'], syntax: '!commands' },
    ping: { description: 'Checks latency.', syntax: '!ping' },
    songrequest: {
      description: 'Adds a song to the queue.',
      aliases: ['sr'],
      syntax: ['!songrequest Title', '!songrequest https://example/track']
    },
    obs: {
      description: 'OBS bridge.',
      force_level: 'mod',
      syntax: ['!obs', '!obs scene Gaming']
    }
  }
};

const CUSTOM = {
  user: 'teststreamer',
  total_commands: 2,
  commands: [
    { command: 'discord', response: 'Join the discord at example.invalid', status: 'Enabled', cooldown: 15, permission: 'everyone' },
    { command: 'raid', response: 'Raid time', status: 'Disabled', cooldown: 30, permission: 'mod' }
  ]
};

const USER = {
  user: 'teststreamer',
  total_commands: 3,
  commands: {
    viewer1: [
      { command: 'hello', response: 'Hi from viewer1', status: 'Enabled', cooldown: 15 }
    ],
    viewer2: [
      { command: 'wave',  response: 'Wave!',         status: 'Enabled', cooldown: 10 },
      { command: 'beep',  response: 'Beep beep',     status: 'Disabled', cooldown: 5 }
    ]
  },
  profile_images: {
    viewer1: 'https://example/p1.png',
    viewer2: 'https://example/p2.png'
  }
};

function setupFetch() {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    if (String(url).includes('/commands/info')) return jsonResponse(BUILTIN);
    if (String(url).includes('/v2/custom-commands')) return jsonResponse(CUSTOM);
    if (String(url).includes('/v2/user-commands/get/all')) return jsonResponse(USER);
    return jsonResponse({}, false, 404);
  });
}

describe('CommandsService.refresh', () => {
  it('fetches built-in without auth, custom+user with X-API-KEY, and flattens the result', async () => {
    const fetchMock = setupFetch();
    const svc = new CommandsService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    await svc.refresh();
    const snap = svc.snapshot();

    expect(snap.state).toBe('ok');
    expect(snap.builtin).toHaveLength(4);
    expect(snap.builtin.map((c) => c.name).sort()).toEqual(['commands', 'obs', 'ping', 'songrequest']);
    expect(snap.builtin.find((c) => c.name === 'commands')).toMatchObject({ description: 'Lists all commands.', aliases: ['cmds'], usage: ['!commands'] });
    expect(snap.builtin.find((c) => c.name === 'ping')).toMatchObject({ description: 'Checks latency.', usage: ['!ping'], aliases: [] });
    expect(snap.builtin.find((c) => c.name === 'songrequest')).toMatchObject({ aliases: ['sr'], usage: ['!songrequest Title', '!songrequest https://example/track'] });
    expect(snap.builtin.find((c) => c.name === 'obs')).toMatchObject({ forceLevel: 'mod' });

    expect(snap.custom).toEqual([
      { name: 'discord', response: 'Join the discord at example.invalid', enabled: true,  cooldown: 15, permission: 'everyone' },
      { name: 'raid',    response: 'Raid time',                           enabled: false, cooldown: 30, permission: 'mod' }
    ]);

    expect(snap.user).toEqual([
      { name: 'hello', response: 'Hi from viewer1', enabled: true,  cooldown: 15, ownerLogin: 'viewer1', ownerProfileImage: 'https://example/p1.png' },
      { name: 'wave',  response: 'Wave!',           enabled: true,  cooldown: 10, ownerLogin: 'viewer2', ownerProfileImage: 'https://example/p2.png' },
      { name: 'beep',  response: 'Beep beep',       enabled: false, cooldown: 5,  ownerLogin: 'viewer2', ownerProfileImage: 'https://example/p2.png' }
    ]);

    // Built-in must NOT carry the API key (it's a public endpoint).
    const builtinCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/commands/info'))!;
    expect((builtinCall[1] as RequestInit | undefined)?.headers as Record<string, string> | undefined)
      .not.toHaveProperty('X-API-KEY');

    // Custom + user MUST carry the API key.
    for (const path of ['/v2/custom-commands', '/v2/user-commands/get/all']) {
      const call = fetchMock.mock.calls.find(([u]) => String(u).includes(path))!;
      expect(((call[1] as RequestInit).headers as Record<string, string>)['X-API-KEY']).toBe('KEY');
    }
  });

  it('emits "changed" with the new snapshot once refresh completes', async () => {
    const svc = new CommandsService({ fetch: setupFetch(), getApiKey: () => 'KEY' });
    const seen: number[] = [];
    svc.on('changed', (s: { builtin: unknown[] }) => seen.push(s.builtin.length));
    await svc.refresh();
    // First the loading transition (still 0 builtins), then the completed snapshot (4).
    expect(seen).toEqual([0, 4]);
  });

  it('still returns built-in when no API key is set (user/custom remain empty)', async () => {
    const fetchMock = setupFetch();
    const svc = new CommandsService({ fetch: fetchMock, getApiKey: () => '' });
    await svc.refresh();
    const snap = svc.snapshot();

    expect(snap.builtin).toHaveLength(4);
    expect(snap.custom).toEqual([]);
    expect(snap.user).toEqual([]);
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes('/v2/'))).toBe(false);
  });

  it('records an error on the built-in fetch but still surfaces what was loaded', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/commands/info')) return jsonResponse({}, false, 500);
      if (String(url).includes('/v2/custom-commands')) return jsonResponse(CUSTOM);
      if (String(url).includes('/v2/user-commands/get/all')) return jsonResponse(USER);
      return jsonResponse({}, false, 404);
    });
    const svc = new CommandsService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    await svc.refresh();
    const snap = svc.snapshot();
    expect(snap.state).toBe('error');
    expect(snap.error).toMatch(/built-in/i);
    expect(snap.builtin).toEqual([]);
    expect(snap.custom).toHaveLength(2);   // partial success still surfaces
    expect(snap.user).toHaveLength(3);
  });

  it('updates a built-in command via PUT with the API key + query string the API expects', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      if (String(url).includes('/commands/info')) return jsonResponse(BUILTIN);
      if (String(url).includes('/v2/builtin-commands/update')) return jsonResponse({ status: 'success', command: 'songrequest', message: "Built-in command 'songrequest' updated successfully" });
      if (String(url).includes('/v2/custom-commands')) return jsonResponse(CUSTOM);
      if (String(url).includes('/v2/user-commands/get/all')) return jsonResponse(USER);
      return jsonResponse({}, false, 404);
    });
    const svc = new CommandsService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    await svc.refresh();
    const ok = await svc.updateBuiltin('songrequest', { status: 'Disabled', permission: 'everyone' });
    expect(ok).toBe(true);

    const updateCall = fetchMock.mock.calls.find(([u]) => String(u).includes('/v2/builtin-commands/update'))!;
    const [url, opts] = updateCall;
    expect(String(url)).toContain('command=songrequest');
    expect(String(url)).toContain('status=Disabled');
    expect(String(url)).toContain('permission=everyone');
    expect((opts as RequestInit).method).toBe('PUT');
    expect(((opts as RequestInit).headers as Record<string, string>)['X-API-KEY']).toBe('KEY');
  });

  it('mirrors the updated status/permission on the in-memory snapshot so the UI updates without a re-fetch', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/commands/info')) return jsonResponse(BUILTIN);
      if (String(url).includes('/v2/builtin-commands/update')) return jsonResponse({ status: 'success', command: 'songrequest', message: "Built-in command 'songrequest' updated successfully" });
      return jsonResponse({}, true);
    });
    const svc = new CommandsService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    await svc.refresh();
    await svc.updateBuiltin('songrequest', { status: 'Disabled', permission: 'mod' });
    const updated = svc.snapshot().builtin.find((c) => c.name === 'songrequest')!;
    expect(updated.enabled).toBe(false);
    expect(updated.forceLevel).toBe('mod');
  });

  it('refuses to update without an API key and never hits the network', async () => {
    const fetchMock = vi.fn();
    const svc = new CommandsService({ fetch: fetchMock, getApiKey: () => '' });
    expect(await svc.updateBuiltin('x', { status: 'Enabled', permission: 'everyone' })).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns false on a failed update and does not mutate the snapshot', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/commands/info')) return jsonResponse(BUILTIN);
      if (String(url).includes('/v2/builtin-commands/update')) return jsonResponse({}, false, 500);
      return jsonResponse({}, true);
    });
    const svc = new CommandsService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    await svc.refresh();
    const before = svc.snapshot().builtin.find((c) => c.name === 'songrequest')!;
    const ok = await svc.updateBuiltin('songrequest', { status: 'Disabled', permission: 'mod' });
    expect(ok).toBe(false);
    expect(svc.snapshot().builtin.find((c) => c.name === 'songrequest')).toEqual(before);
  });

  it('preserves locally-applied overrides across a subsequent refresh', async () => {
    // /commands/info omits per-streamer overrides, so refresh must merge rather than overwrite a saved Disabled back to Enabled.
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/commands/info')) return jsonResponse(BUILTIN);
      if (String(url).includes('/v2/builtin-commands/update')) return jsonResponse({ status: 'success' });
      if (String(url).includes('/v2/custom-commands')) return jsonResponse(CUSTOM);
      if (String(url).includes('/v2/user-commands/get/all')) return jsonResponse(USER);
      return jsonResponse({}, false, 404);
    });
    const svc = new CommandsService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    await svc.refresh();
    await svc.updateBuiltin('songrequest', { status: 'Disabled', permission: 'mod' });
    // Sanity — override was applied.
    expect(svc.snapshot().builtin.find((c) => c.name === 'songrequest')).toMatchObject({ enabled: false, forceLevel: 'mod' });
    // Now refresh — the override MUST survive.
    await svc.refresh();
    expect(svc.snapshot().builtin.find((c) => c.name === 'songrequest')).toMatchObject({ enabled: false, forceLevel: 'mod' });
    // Other (non-overridden) commands still pick up catalog values.
    expect(svc.snapshot().builtin.find((c) => c.name === 'ping')).toMatchObject({ enabled: true, forceLevel: 'everyone' });
  });

  it('treats a 200 response with status != "success" as failure', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/commands/info')) return jsonResponse(BUILTIN);
      if (String(url).includes('/v2/builtin-commands/update')) return jsonResponse({ status: 'error', message: 'unknown command' });
      return jsonResponse({}, true);
    });
    const svc = new CommandsService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    await svc.refresh();
    expect(await svc.updateBuiltin('songrequest', { status: 'Disabled', permission: 'mod' })).toBe(false);
  });

  it('emits a "changed" event with state:loading at the start of a refresh', async () => {
    const svc = new CommandsService({ fetch: setupFetch(), getApiKey: () => '' });
    const states: string[] = [];
    svc.on('changed', (s: { state: string }) => states.push(s.state));
    await svc.refresh();
    expect(states[0]).toBe('loading');
    expect(states.at(-1)).toBe('ok');
  });

  it('reports state = "loading" while a refresh is in flight', async () => {
    let resolveBuiltin: (v: Response) => void = () => undefined;
    const builtinPromise = new Promise<Response>((r) => { resolveBuiltin = r; });
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      if (String(url).includes('/commands/info')) return builtinPromise;
      return jsonResponse({}, true);
    });
    const svc = new CommandsService({ fetch: fetchMock, getApiKey: () => '' });
    const inFlight = svc.refresh();
    expect(svc.snapshot().state).toBe('loading');
    resolveBuiltin(jsonResponse(BUILTIN));
    await inFlight;
    expect(svc.snapshot().state).toBe('ok');
  });
});
