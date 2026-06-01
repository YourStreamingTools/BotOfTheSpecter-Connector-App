// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { TimersService, validateTimerInput } from './timers-service';
import type { TimerInput } from '@shared/ipc';

const jsonResponse = (body: unknown, ok = true, status = 200) =>
  ({ ok, status, json: async () => body }) as Response;

const timer = (over: Partial<TimerInput> = {}): TimerInput => ({
  triggerType: 'timer', intervalCount: 30, message: 'Follow on socials!', ...over
});

describe('validateTimerInput', () => {
  it('accepts a valid timer (interval 5–480)', () => {
    expect(validateTimerInput(timer({ intervalCount: 30 }))).toBeNull();
    expect(validateTimerInput(timer({ intervalCount: 5 }))).toBeNull();
    expect(validateTimerInput(timer({ intervalCount: 480 }))).toBeNull();
  });

  it('rejects an interval out of range', () => {
    expect(validateTimerInput(timer({ intervalCount: 4 }))).toMatch(/5.*480/);
    expect(validateTimerInput(timer({ intervalCount: 481 }))).toMatch(/5.*480/);
    expect(validateTimerInput(timer({ intervalCount: null }))).toMatch(/interval/i);
  });

  it('requires interval >= 60 when the message uses a (shoutout.x) variable', () => {
    expect(validateTimerInput(timer({ intervalCount: 30, message: 'go follow (shoutout.username)!' }))).toMatch(/60/);
    expect(validateTimerInput(timer({ intervalCount: 60, message: 'go follow (shoutout.username)!' }))).toBeNull();
  });

  it('validates chat_lines (>= 5)', () => {
    expect(validateTimerInput({ triggerType: 'chat_lines', chatLineTrigger: 10, message: 'hi' })).toBeNull();
    expect(validateTimerInput({ triggerType: 'chat_lines', chatLineTrigger: 4, message: 'hi' })).toMatch(/5/);
    expect(validateTimerInput({ triggerType: 'chat_lines', chatLineTrigger: null, message: 'hi' })).toMatch(/chat/i);
  });

  it("validates both fields when triggerType is 'both'", () => {
    expect(validateTimerInput({ triggerType: 'both', intervalCount: 30, chatLineTrigger: 10, message: 'hi' })).toBeNull();
    expect(validateTimerInput({ triggerType: 'both', intervalCount: 30, chatLineTrigger: 2, message: 'hi' })).toMatch(/5/);
  });

  it('rejects an empty message', () => {
    expect(validateTimerInput(timer({ message: '   ' }))).toMatch(/message/i);
  });
});

describe('TimersService.refresh', () => {
  it('lists timers from /timers and maps API snake_case → camelCase', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => jsonResponse({
      timers: [
        { id: 1, trigger_type: 'timer', interval_count: 30, chat_line_trigger: null, message: 'A', enabled: true },
        { id: 2, trigger_type: 'chat_lines', interval_count: null, chat_line_trigger: 10, message: 'B', enabled: false }
      ]
    }));
    const svc = new TimersService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    await svc.refresh();
    const snap = svc.snapshot();
    expect(snap.state).toBe('ok');
    expect(snap.timers).toEqual([
      { id: 1, triggerType: 'timer', intervalCount: 30, chatLineTrigger: null, message: 'A', enabled: true },
      { id: 2, triggerType: 'chat_lines', intervalCount: null, chatLineTrigger: 10, message: 'B', enabled: false }
    ]);
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toContain('/timers');
    expect(url).toContain('api_key=KEY');
  });

  it('is idle and does not fetch without an API key', async () => {
    const fetchMock = vi.fn();
    const svc = new TimersService({ fetch: fetchMock, getApiKey: () => '' });
    await svc.refresh();
    expect(svc.snapshot()).toMatchObject({ state: 'idle', timers: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('records an error on a failed request', async () => {
    const svc = new TimersService({ fetch: vi.fn(async () => jsonResponse({}, false, 500)), getApiKey: () => 'KEY' });
    await svc.refresh();
    expect(svc.snapshot().state).toBe('error');
  });

  it('emits "changed" with a loading transition then the result', async () => {
    const svc = new TimersService({ fetch: vi.fn(async () => jsonResponse({ timers: [] })), getApiKey: () => 'KEY' });
    const states: string[] = [];
    svc.on('changed', (s: { state: string }) => states.push(s.state));
    await svc.refresh();
    expect(states[0]).toBe('loading');
    expect(states.at(-1)).toBe('ok');
  });
});

describe('TimersService.create', () => {
  it('POSTs to /timers/add with mapped params and refreshes on success', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      calls.push(`${(init?.method ?? 'GET')} ${String(url)}`);
      return jsonResponse(String(url).includes('/timers/add') ? { status: 'success', id: 7 } : { timers: [] });
    });
    const svc = new TimersService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    expect(await svc.create(timer({ intervalCount: 30, message: 'Hi' }))).toBe(true);
    const add = calls.find((c) => c.includes('/timers/add'))!;
    expect(add).toContain('POST');
    expect(add).toContain('trigger_type=timer');
    expect(add).toContain('interval_count=30');
    expect(add).toContain('message=Hi');
    // create() should re-list afterwards so the screen updates.
    expect(calls.some((c) => c.includes('/timers') && !c.includes('/timers/'))).toBe(true);
  });

  it('rejects invalid input locally without hitting the network', async () => {
    const fetchMock = vi.fn();
    const svc = new TimersService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    expect(await svc.create(timer({ intervalCount: 1 }))).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns false without an API key', async () => {
    const fetchMock = vi.fn();
    const svc = new TimersService({ fetch: fetchMock, getApiKey: () => '' });
    expect(await svc.create(timer())).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('TimersService.update / toggle / delete', () => {
  it('PUTs to /timers/update with the id', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
      jsonResponse(String(url).includes('/timers/update') ? { status: 'success' } : { timers: [] }, true));
    const svc = new TimersService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    expect(await svc.update(3, timer({ intervalCount: 45, message: 'Edit' }))).toBe(true);
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/timers/update'))!;
    expect((call[1] as RequestInit).method).toBe('PUT');
    expect(String(call[0])).toContain('id=3');
    expect(String(call[0])).toContain('interval_count=45');
  });

  it('PUTs to /timers/toggle with enabled flag (no validation needed)', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      jsonResponse(String(url).includes('/timers/toggle') ? { status: 'success' } : { timers: [] }, true));
    const svc = new TimersService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    expect(await svc.toggle(5, false)).toBe(true);
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/timers/toggle'))!;
    expect(String(call[0])).toContain('id=5');
    expect(String(call[0])).toContain('enabled=false');
  });

  it('DELETEs to /timers/delete with the id', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) =>
      jsonResponse(String(url).includes('/timers/delete') ? { status: 'success' } : { timers: [] }, true));
    const svc = new TimersService({ fetch: fetchMock, getApiKey: () => 'KEY' });
    expect(await svc.delete(9)).toBe(true);
    const call = fetchMock.mock.calls.find(([u]) => String(u).includes('/timers/delete'))!;
    expect((call[1] as RequestInit).method).toBe('DELETE');
    expect(String(call[0])).toContain('id=9');
  });

  it('returns false on a failed mutation', async () => {
    const svc = new TimersService({ fetch: vi.fn(async () => jsonResponse({}, false, 500)), getApiKey: () => 'KEY' });
    expect(await svc.delete(9)).toBe(false);
  });
});
