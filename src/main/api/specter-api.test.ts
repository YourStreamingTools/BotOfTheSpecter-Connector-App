// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { SpecterApiService } from './specter-api';

const jsonResponse = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body }) as Response;

describe('SpecterApiService.validateApiKey', () => {
  it('validates a good key via /v2/checkkey with the API key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'Valid API Key', username: 'teststreamer' }));
    const svc = new SpecterApiService({ fetch: fetchMock });
    const res = await svc.validateApiKey('KEY');
    expect(res).toEqual({ valid: true, username: 'teststreamer', message: 'Valid API Key' });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/v2/checkkey');
    expect((opts.headers as Record<string, string>)['X-API-KEY']).toBe('KEY');
  });

  it('reports an invalid key (status "Invalid API Key", username null)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'Invalid API Key', username: null }));
    const svc = new SpecterApiService({ fetch: fetchMock });
    const res = await svc.validateApiKey('bad');
    expect(res.valid).toBe(false);
    expect(res.message).toBe('Invalid API Key');
  });

  it('treats an empty key as invalid without calling the API', async () => {
    const fetchMock = vi.fn();
    const svc = new SpecterApiService({ fetch: fetchMock });
    expect((await svc.validateApiKey('')).valid).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('handles a non-200 response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 500));
    const svc = new SpecterApiService({ fetch: fetchMock });
    expect((await svc.validateApiKey('KEY')).valid).toBe(false);
  });
});

describe('SpecterApiService.getAccount', () => {
  const raw = {
    id: 2, username: 'teststreamer', twitch_display_name: 'TestStreamer', twitch_user_id: '1234567',
    access_token: 'SECRET-A', refresh_token: 'SECRET-R', useable_access_token: 'SECRET-U', api_key: 'SECRET-K',
    spotify_access_token: 'SECRET-S', discord_access_token: 'SECRET-D',
    is_admin: true, beta_access: true, is_technical: true,
    signup_date: '2020-01-01 00:00:00', last_login: '2020-01-01 00:00:00',
    profile_image: 'https://example/avatar.png', email: 'a@b.com', language: 'EN', app_password_set: true
  };

  it('maps /v2/account to a camelCase display subset with the API key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(raw));
    const svc = new SpecterApiService({ fetch: fetchMock });
    const res = await svc.getAccount('KEY');
    expect(res).toEqual({
      id: 2, username: 'teststreamer', displayName: 'TestStreamer', twitchUserId: '1234567',
      profileImage: 'https://example/avatar.png', isAdmin: true, betaAccess: true, isTechnical: true
    });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/v2/account');
    expect((opts.headers as Record<string, string>)['X-API-KEY']).toBe('KEY');
  });

  it('never leaks tokens across the boundary', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(raw));
    const svc = new SpecterApiService({ fetch: fetchMock });
    const res = await svc.getAccount('KEY');
    expect(JSON.stringify(res)).not.toMatch(/SECRET/);
  });

  it('returns null without a key (no fetch)', async () => {
    const fetchMock = vi.fn();
    const svc = new SpecterApiService({ fetch: fetchMock });
    expect(await svc.getAccount('')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null on a failed request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false, 401));
    const svc = new SpecterApiService({ fetch: fetchMock });
    expect(await svc.getAccount('KEY')).toBeNull();
  });
});

describe('SpecterApiService.getCredentials', () => {
  it('extracts the useable token + broadcaster id + updated time from /v2/account', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      useable_access_token: 'UTOK', twitch_user_id: '1234567', useable_access_token_updated: '2020-01-01 00:00:00'
    }));
    const svc = new SpecterApiService({ fetch: fetchMock });
    expect(await svc.getCredentials('KEY')).toEqual({
      accessToken: 'UTOK', broadcasterId: '1234567', updatedAt: '2020-01-01 00:00:00'
    });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/v2/account');
    expect((opts.headers as Record<string, string>)['X-API-KEY']).toBe('KEY');
  });

  it('returns null when the account has no useable token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ twitch_user_id: '1' }));
    const svc = new SpecterApiService({ fetch: fetchMock });
    expect(await svc.getCredentials('KEY')).toBeNull();
  });

  it('returns null without a key (no fetch)', async () => {
    const fetchMock = vi.fn();
    const svc = new SpecterApiService({ fetch: fetchMock });
    expect(await svc.getCredentials('')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
