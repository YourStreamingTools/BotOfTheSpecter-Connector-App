// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { SoundboardService } from './soundboard-service';

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as Response;

describe('SoundboardService.refresh', () => {
  it('lists sounds from /sound-alerts with the API key and sets state ok', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => jsonResponse({ total_sounds: 2, sounds: ['airhorn.mp3', 'yay.wav'] }));
    const svc = new SoundboardService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    await svc.refresh();
    const snap = svc.snapshot();
    expect(snap.state).toBe('ok');
    expect(snap.sounds).toEqual(['airhorn.mp3', 'yay.wav']);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/sound-alerts');
    expect(url).toContain('api_key=KEY');
  });

  it('emits "changed" with the loading transition then the result', async () => {
    const svc = new SoundboardService({ fetch: vi.fn(async () => jsonResponse({ sounds: ['a.mp3'] })), getApiKey: () => 'KEY' });
    const states: string[] = [];
    svc.on('changed', (s: { state: string }) => states.push(s.state));
    await svc.refresh();
    expect(states[0]).toBe('loading');
    expect(states.at(-1)).toBe('ok');
  });

  it('is idle and does not fetch without an API key', async () => {
    const fetchMock = vi.fn();
    const svc = new SoundboardService({ fetch: fetchMock, getApiKey: () => '' });
    await svc.refresh();
    expect(svc.snapshot()).toMatchObject({ state: 'idle', sounds: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records an error on a failed request', async () => {
    const svc = new SoundboardService({ fetch: vi.fn(async () => jsonResponse({}, false, 500)), getApiKey: () => 'KEY' });
    await svc.refresh();
    expect(svc.snapshot().state).toBe('error');
    expect(svc.snapshot().sounds).toEqual([]);
  });

  it('tolerates a malformed payload (no sounds array)', async () => {
    const svc = new SoundboardService({ fetch: vi.fn(async () => jsonResponse({ nope: true })), getApiKey: () => 'KEY' });
    await svc.refresh();
    expect(svc.snapshot()).toMatchObject({ state: 'ok', sounds: [] });
  });
});

describe('SoundboardService.play', () => {
  it('triggers /websocket/sound_alert with the API key + sound and returns true', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => jsonResponse({ message: 'SOUND_ALERT event sent successfully.' }));
    const svc = new SoundboardService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    expect(await svc.play('airhorn.mp3')).toBe(true);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/websocket/sound_alert');
    expect(url).toContain('api_key=KEY');
    expect(url).toContain('sound=airhorn.mp3');
  });

  it('refuses to play without an API key (no network)', async () => {
    const fetchMock = vi.fn();
    const svc = new SoundboardService({ fetch: fetchMock, getApiKey: () => '' });
    expect(await svc.play('airhorn.mp3')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses to play an empty sound name (no network)', async () => {
    const fetchMock = vi.fn();
    const svc = new SoundboardService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    expect(await svc.play('  ')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns false on a failed trigger', async () => {
    const svc = new SoundboardService({ fetch: vi.fn(async () => jsonResponse({}, false, 500)), getApiKey: () => 'KEY' });
    expect(await svc.play('airhorn.mp3')).toBe(false);
  });

  it('URL-encodes a sound name with spaces', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => jsonResponse({ message: 'ok' }));
    const svc = new SoundboardService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    await svc.play('big yay.mp3');
    expect(String(fetchMock.mock.calls[0][0])).toContain('sound=big%20yay.mp3');
  });
});
