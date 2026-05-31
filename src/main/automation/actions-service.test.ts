// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { ActionsService } from './actions-service';
import type { ActionInput, ActionBody } from '@shared/ipc';

// Lightweight in-memory ConfigStore stand-in matching what ActionsService consumes.
function fakeStore(initial: { actions?: unknown } = {}) {
  let data: { actions?: unknown } = { ...initial };
  return {
    get: vi.fn((k: 'actions') => data[k]),
    set: vi.fn(async (k: 'actions', v: unknown) => { data = { ...data, [k]: v }; })
  };
}

const inputCallWebpage: ActionInput = {
  name: 'Call my webhook',
  body: {
    type: 'call_webpage',
    config: { url: 'https://example.invalid/hook', method: 'POST', headers: [{ key: 'X-Test', value: '1' }], body: '{"hello":1}' }
  }
};

const inputCmd: ActionInput = {
  name: 'Shoutout',
  body: { type: 'trigger_command', config: { command: 'so' } }
};

describe('ActionsService.list', () => {
  it('starts empty when the store has nothing persisted', () => {
    const svc = new ActionsService({ store: fakeStore() });
    expect(svc.list()).toEqual([]);
  });

  it('rehydrates from the persisted config on construction', () => {
    const persisted = [{
      id: 'act_existing', name: 'Persisted', enabled: true,
      body: { type: 'change_variable', config: { name: 'foo', value: 'bar' } },
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
    }];
    const svc = new ActionsService({ store: fakeStore({ actions: persisted }) });
    expect(svc.list()).toEqual(persisted);
  });

  it('de-duplicates persisted actions that share an id on hydrate (keeps the first)', () => {
    const dup = (name: string) => ({
      id: 'act_dup000000', name, enabled: true,
      body: { type: 'create_clip', config: { hasDelay: false } },
      createdAt: 't', updatedAt: 't'
    });
    const svc = new ActionsService({ store: fakeStore({ actions: [dup('first'), dup('second')] }) });
    expect(svc.list()).toHaveLength(1);
    expect(svc.list()[0].name).toBe('first');
  });

  it('drops persisted entries that are not valid Actions instead of crashing', () => {
    const persisted = [
      { id: 'act_ok', name: 'OK', enabled: true,
        body: { type: 'trigger_command', config: { command: 'so' } },
        createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' },
      // Garbage entries — wrong shape, unknown type, missing fields.
      'not-an-object',
      { id: 'bad', body: { type: 'unknown_thing', config: {} } }
    ];
    const svc = new ActionsService({ store: fakeStore({ actions: persisted }) });
    expect(svc.list().map((a) => a.id)).toEqual(['act_ok']);
  });
});

describe('ActionsService.create', () => {
  it('assigns an id + timestamps and persists the new action', async () => {
    const store = fakeStore();
    const svc = new ActionsService({ store, now: () => '2026-05-28T10:00:00.000Z' });
    const a = await svc.create(inputCallWebpage);
    expect(a.id).toMatch(/^act_/);
    expect(a.name).toBe('Call my webhook');
    expect(a.enabled).toBe(true);
    expect(a.createdAt).toBe('2026-05-28T10:00:00.000Z');
    expect(a.updatedAt).toBe('2026-05-28T10:00:00.000Z');
    expect(store.set).toHaveBeenCalledWith('actions', [a]);
  });

  it('emits "changed" with the full list after creating', async () => {
    const svc = new ActionsService({ store: fakeStore() });
    const seen: number[] = [];
    svc.on('changed', (list: unknown[]) => seen.push(list.length));
    await svc.create(inputCallWebpage);
    await svc.create(inputCmd);
    expect(seen).toEqual([1, 2]);
  });

  it('rejects an input with no name or an unknown body type', async () => {
    const svc = new ActionsService({ store: fakeStore() });
    await expect(svc.create({ name: '', body: inputCallWebpage.body })).rejects.toThrow(/name/i);
    // @ts-expect-error — testing the runtime guard
    await expect(svc.create({ name: 'X', body: { type: 'made_up', config: {} } })).rejects.toThrow(/type/i);
  });

  it('accepts every documented action type', async () => {
    const svc = new ActionsService({ store: fakeStore(), now: () => '2026-05-28T12:00:00.000Z' });
    const bodies: ActionBody[] = [
      { type: 'call_webpage',       config: { url: 'https://example.invalid', method: 'GET', headers: [], body: '' } },
      { type: 'change_variable',    config: { name: 'foo', value: 'bar' } },
      { type: 'trigger_command',    config: { command: 'so' } },
      { type: 'play_sound',         config: { soundId: 'snd_1', soundName: '' } },
      { type: 'tts',                config: { text: 'hello world', voice: '' } },
      { type: 'toggle_automation',  config: { targetAutomationId: 'auto_1', mode: 'toggle' } },
      { type: 'send_webhook',       config: { url: 'https://example.invalid/hook', method: 'POST', headers: [], payload: '{}' } },
      { type: 'toggle_redemption',       config: { rewardId: 'reward_1', rewardName: 'Test reward', mode: 'toggle' } },
      { type: 'run_ads',                 config: { length: 60 } },
      { type: 'create_marker',           config: { description: 'mid-stream highlight' } },
      { type: 'start_end_poll',          config: { mode: 'start', title: 'Best language?', choices: ['JS','TS'], durationSeconds: 60, channelPointsVotingEnabled: false, channelPointsPerVote: 100 } },
      { type: 'start_cancel_prediction', config: { mode: 'start', title: 'Will I win?', outcomes: ['Yes','No'], predictionWindowSeconds: 90 } },
      { type: 'toggle_slow_mode',        config: { mode: 'on', waitTimeSeconds: 10 } },
      { type: 'create_clip',             config: { hasDelay: false } }
    ];
    for (const body of bodies) {
      const a = await svc.create({ name: `Test ${body.type}`, body });
      expect(a.body.type).toBe(body.type);
    }
    expect(svc.list()).toHaveLength(bodies.length);
  });
});

describe('ActionsService.update', () => {
  it('overwrites the existing action and refreshes updatedAt', async () => {
    const svc = new ActionsService({ store: fakeStore(), now: () => '2026-05-28T11:00:00.000Z' });
    const a = await svc.create(inputCallWebpage);
    const updated = await svc.update(a.id, { ...inputCallWebpage, name: 'Renamed', enabled: false });
    expect(updated).toMatchObject({ id: a.id, name: 'Renamed', enabled: false, createdAt: a.createdAt, updatedAt: '2026-05-28T11:00:00.000Z' });
  });

  it('returns null when the id does not exist', async () => {
    const svc = new ActionsService({ store: fakeStore() });
    expect(await svc.update('nope', inputCmd)).toBeNull();
  });
});

describe('ActionsService.delete', () => {
  it('removes the action and persists', async () => {
    const store = fakeStore();
    const svc = new ActionsService({ store });
    const a = await svc.create(inputCmd);
    expect(await svc.delete(a.id)).toBe(true);
    expect(svc.list()).toEqual([]);
    // Last persist was an empty array.
    expect(store.set).toHaveBeenLastCalledWith('actions', []);
  });

  it('returns false when the id does not exist (no persist)', async () => {
    const store = fakeStore();
    const svc = new ActionsService({ store });
    expect(await svc.delete('nope')).toBe(false);
    expect(store.set).not.toHaveBeenCalled();
  });
});
