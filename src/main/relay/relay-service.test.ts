// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { RelayService } from './relay-service';

// Fake socket.io client.
class FakeSocket extends EventEmitter {
  connected = false;
  emit = vi.fn((...args: unknown[]) => { super.emit(...(args as [string])); return true; });
  connect = vi.fn(() => { this.connected = true; super.emit('connect'); return this; });
  disconnect = vi.fn(() => { this.connected = false; super.emit('disconnect', 'io client disconnect'); return this; });
  onAny = vi.fn((cb: (event: string, ...args: unknown[]) => void) => { this._any = cb; return this; });
  _any?: (event: string, ...args: unknown[]) => void;
  fireAny(event: string, data: unknown) { this._any?.(event, data); }
}

const makeDeps = () => {
  const socket = new FakeSocket();
  const obs = { setScene: vi.fn().mockResolvedValue(undefined), setSourceEnabled: vi.fn().mockResolvedValue(undefined) };
  const variables = { handleEvent: vi.fn() };
  const log = { add: vi.fn() };
  const svc = new RelayService({
    socketFactory: () => socket as unknown as import('socket.io-client').Socket,
    obs: obs as never, variables: variables as never, log: log as never, getVersion: () => '2.0.0'
  });
  return { socket, obs, variables, log, svc };
};

describe('RelayService', () => {
  let d: ReturnType<typeof makeDeps>;
  beforeEach(() => { d = makeDeps(); d.svc.setApiKey('KEY'); });

  it('REGISTERs on connect', () => {
    d.svc.connect();
    d.socket.connect();
    expect(d.socket.emit).toHaveBeenCalledWith('REGISTER', { code: 'KEY', channel: 'BotOfTheSpecter APP', name: 'V2.0.0' });
  });

  it('marks registered only after the relay confirms (SUCCESS), not merely on socket connect', () => {
    d.svc.connect();
    d.socket.connect();
    expect(d.svc.getStatus().state).toBe('connected');
    expect(d.svc.getStatus().registered).toBe(false);
    d.socket.fireAny('SUCCESS', {});
    expect(d.svc.getStatus().registered).toBe(true);
  });

  it('treats connect_error as a transient reconnecting state, not a terminal error', () => {
    d.svc.connect();
    d.socket.connect();
    d.socket.emit('connect_error', new Error('boom'));
    expect(d.svc.getStatus().state).toBe('connecting');
    expect(d.svc.getStatus().error).toContain('boom');
  });

  it('reports error and does not connect without an api key', () => {
    const d2 = makeDeps();
    const states: string[] = [];
    d2.svc.on('status', (s: { state: string }) => states.push(s.state));
    d2.svc.connect();
    expect(states.at(-1)).toBe('error');
    expect(d2.socket.connect).not.toHaveBeenCalled();
  });

  it('routes a TWITCH event through variables + log', () => {
    d.svc.connect(); d.socket.connect();
    d.socket.fireAny('TWITCH_FOLLOW', { username: 'owl' });
    expect(d.variables.handleEvent).toHaveBeenCalledWith('TWITCH_FOLLOW', { username: 'owl' });
    expect(d.log.add).toHaveBeenCalled();
  });

  it('redacts secrets from event payloads before they reach variables or logs', () => {
    d.svc.connect(); d.socket.connect();
    d.socket.fireAny('TWITCH_FOLLOW', { username: 'owl', code: 'KEY' });
    const passed = d.variables.handleEvent.mock.calls.at(-1)![1] as Record<string, unknown>;
    expect(passed.code).toBe('***REDACTED***');
    expect(passed.username).toBe('owl');
  });

  it('routes CHAT_MESSAGE to the chat stream, not variables', () => {
    d.svc.connect(); d.socket.connect();
    const chat: unknown[] = [];
    d.svc.on('chat', (c) => chat.push(c));
    d.socket.fireAny('CHAT_MESSAGE', { message_id: '1', chatter_user_id: 'a', message: { text: 'hi' }, badges: [] });
    expect(chat).toHaveLength(1);
    expect(d.variables.handleEvent).not.toHaveBeenCalledWith('CHAT_MESSAGE', expect.anything());
  });

  it('routes MODERATION to the moderation stream', () => {
    d.svc.connect(); d.socket.connect();
    const mod: unknown[] = [];
    d.svc.on('moderation', (m) => mod.push(m));
    d.socket.fireAny('MODERATION', { action: 'clear', moderator_user_name: 'M' });
    expect(mod).toHaveLength(1);
  });

  it('executes an inbound OBS scene request and acks success', async () => {
    d.svc.connect(); d.socket.connect();
    await d.svc.handleObsRequest({ subcommand: 'scene', scene_name: 'BRB' });
    expect(d.obs.setScene).toHaveBeenCalledWith('BRB');
    expect(d.socket.emit).toHaveBeenCalledWith('OBS_EVENT_RECEIVED', expect.objectContaining({ status: 'success' }));
  });

  it('blocks inbound OBS requests when locked', async () => {
    d.svc.connect(); d.socket.connect();
    d.svc.setLock(true);
    await d.svc.handleObsRequest({ subcommand: 'scene', scene_name: 'BRB' });
    expect(d.obs.setScene).not.toHaveBeenCalled();
    expect(d.socket.emit).toHaveBeenCalledWith('OBS_EVENT_RECEIVED', expect.objectContaining({ status: 'blocked' }));
  });

  it('forwards OBS events to the relay', () => {
    d.svc.connect(); d.socket.connect();
    d.svc.forwardObsEvent('CurrentProgramSceneChanged', { sceneName: 'BRB' });
    expect(d.socket.emit).toHaveBeenCalledWith('OBS_EVENT', { type: 'CurrentProgramSceneChanged', data: { sceneName: 'BRB' } });
  });
});
