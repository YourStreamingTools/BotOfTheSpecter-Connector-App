// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { BotStatusService } from './bot-status-service';
import type { BotStatus } from '@shared/ipc';

const jsonResponse = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response;

describe('BotStatusService', () => {
  it('maps the /v2/bot/status response with the API key header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      running: true, pid: 3343684, version: '5.8', bot_type: 'beta', outdated: false, latest_version: '5.8'
    }));
    const svc = new BotStatusService({ fetch: fetchMock });
    svc.setApiKey('KEY');
    await svc.refresh();
    expect(svc.getStatus()).toEqual({
      running: true, reachable: true, pid: 3343684, version: '5.8', botType: 'beta', outdated: false, latestVersion: '5.8'
    });
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toContain('/v2/bot/status');
    expect((opts.headers as Record<string, string>)['X-API-KEY']).toBe('KEY');
  });

  it('is unreachable (and does not fetch) without an API key', async () => {
    const fetchMock = vi.fn();
    const svc = new BotStatusService({ fetch: fetchMock });
    await svc.refresh();
    expect(svc.getStatus()).toEqual({ running: false, reachable: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is unreachable on a failed request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, false));
    const svc = new BotStatusService({ fetch: fetchMock });
    svc.setApiKey('KEY');
    await svc.refresh();
    expect(svc.getStatus().reachable).toBe(false);
    expect(svc.getStatus().running).toBe(false);
  });

  it('emits status on refresh', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ running: true, version: '5.8' }));
    const svc = new BotStatusService({ fetch: fetchMock });
    svc.setApiKey('KEY');
    const seen: boolean[] = [];
    svc.on('status', (s: { running: boolean }) => seen.push(s.running));
    await svc.refresh();
    expect(seen).toEqual([true]);
  });

  it('resets and re-emits an unreachable status when the API key is cleared', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ running: true, version: '5.8' }));
    const svc = new BotStatusService({ fetch: fetchMock });
    svc.setApiKey('KEY');
    await svc.refresh();
    expect(svc.getStatus().running).toBe(true);

    const seen: BotStatus[] = [];
    svc.on('status', (s: BotStatus) => seen.push(s));
    svc.setApiKey('');
    expect(svc.getStatus()).toEqual({ running: false, reachable: false });
    expect(seen.at(-1)).toEqual({ running: false, reachable: false });
  });
});
