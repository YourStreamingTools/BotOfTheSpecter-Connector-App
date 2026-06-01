import { EventEmitter } from 'events';
import { io, type Socket } from 'socket.io-client';
import { SPECTER_WEBSOCKET_URI, APP_VERSION, RECONNECT_DELAY_MS, JITTER_MAX_MS } from '@shared/constants';
import type { RelayStatus } from '@shared/ipc';
import { redactSensitive } from '@shared/redact';
import type { ObsService } from '../obs/obs-service';
import type { VariablesService } from '../variables/variables-service';
import type { LogService } from '../log/log-service';

const IGNORED_FOR_VARS = new Set(['OBS_EVENT', 'OBS_REQUEST', 'OBS_EVENT_RECEIVED', 'SEND_OBS_EVENT']);

export interface RelayServiceDeps {
  obs: Pick<ObsService, 'setScene' | 'setSourceEnabled'>;
  variables: Pick<VariablesService, 'handleEvent'>;
  log: Pick<LogService, 'add'>;
  socketFactory?: (url: string) => Socket;
  getVersion?: () => string;
}

export class RelayService extends EventEmitter {
  private socket?: Socket;
  private apiKey = '';
  private status: RelayStatus = { state: 'disconnected', registered: false, locked: false, hasApiKey: false };

  constructor(private deps: RelayServiceDeps) {
    super();
  }

  getStatus(): RelayStatus { return this.status; }

  private setStatus(patch: Partial<RelayStatus>): void {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.status);
  }

  setApiKey(key: string): void {
    this.apiKey = key.trim();
    this.setStatus({ hasApiKey: Boolean(this.apiKey) });
  }

  setLock(locked: boolean): void {
    this.setStatus({ locked });
    this.deps.log.add('APP', 'warn', locked ? 'Control panel LOCKED — inbound OBS commands ignored' : 'Control panel UNLOCKED');
  }

  connect(): void {
    if (!this.apiKey) {
      this.setStatus({ state: 'error', error: 'No API key set' });
      return;
    }
    this.disconnect();
    this.setStatus({ state: 'connecting', url: SPECTER_WEBSOCKET_URI, error: undefined, registered: false });

    const factory = this.deps.socketFactory ?? ((url: string) => io(url, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: RECONNECT_DELAY_MS,
      reconnectionDelayMax: RECONNECT_DELAY_MS + JITTER_MAX_MS,
      randomizationFactor: JITTER_MAX_MS / RECONNECT_DELAY_MS,
      autoConnect: false
    }));
    const socket = factory(SPECTER_WEBSOCKET_URI);
    this.socket = socket;

    socket.on('connect', () => {
      socket.emit('REGISTER', { code: this.apiKey, channel: 'BotOfTheSpecter APP', name: `V${this.deps.getVersion?.() ?? APP_VERSION}` });
      // Socket is up but the relay hasn't acknowledged registration yet — that
      // arrives as the 'SUCCESS' event (see onAny), which flips `registered`.
      this.setStatus({ state: 'connected' });
      this.deps.log.add('WS', 'ok', 'Connected to BotOfTheSpecter relay');
    });
    socket.on('disconnect', () => {
      this.setStatus({ state: this.apiKey ? 'connecting' : 'disconnected', registered: false });
      this.deps.log.add('WS', 'warn', 'Relay disconnected — reconnecting');
    });
    socket.on('connect_error', (err: Error) => {
      // socket.io keeps auto-reconnecting (reconnection:true), so a connect error
      // is transient — reflect "connecting" (keeping the message) rather than a
      // terminal "error" that would make the UI look permanently broken.
      this.setStatus({ state: 'connecting', error: err?.message ?? 'connect error' });
      this.deps.log.add('WS', 'err', `Relay connect error: ${err?.message ?? err}`);
    });
    socket.on('OBS_REQUEST', (data: Record<string, unknown>) => void this.handleObsRequest(data));
    socket.on('SEND_OBS_EVENT', (data: Record<string, unknown>) => void this.handleObsRequest(data));
    socket.onAny((event: string, data: unknown) => this.onAny(event, data));

    socket.connect();
  }

  disconnect(): void {
    if (this.socket) {
      try { this.socket.disconnect(); } catch { /* ignore */ }
      this.socket = undefined;
    }
    this.setStatus({ state: 'disconnected', registered: false });
  }

  forwardObsEvent(type: string, data: Record<string, unknown>): void {
    if (this.socket?.connected) this.socket.emit('OBS_EVENT', { type, data });
  }

  private onAny(event: string, data: unknown): void {
    if (event === 'WELCOME') { this.deps.log.add('WS', 'ok', 'Specter connected'); return; }
    if (event === 'SUCCESS') { this.setStatus({ registered: true }); this.deps.log.add('WS', 'ok', 'Registered with relay'); return; }
    if (IGNORED_FOR_VARS.has(event)) return;
    const raw = (data && typeof data === 'object') ? (data as Record<string, unknown>) : {};
    // Redact secrets (incl. the literal API key) at the boundary so neither the
    // variables view nor the logs can ever surface them.
    const obj = redactSensitive(raw, this.apiKey ? [this.apiKey] : []);
    // Chat is high-volume and moderation is its own stream — route them to the
    // chat pipeline instead of spamming the variables view / event log.
    if (event === 'CHAT_MESSAGE') { this.emit('chat', obj); return; }
    if (event === 'MODERATION') { this.emit('moderation', obj); this.deps.log.add('TWITCH', 'evt', describeModeration(obj)); return; }
    // Surface the raw (event, payload) so consumers like the Alerts feed can pick
    // out the events they care about, alongside the variables engine + log.
    this.emit('specterEvent', event, obj);
    this.deps.variables.handleEvent(event, obj);
    this.deps.log.add(srcFor(event), levelFor(event), describe(event, obj));
  }

  /** Execute an inbound OBS request (public for testing). */
  async handleObsRequest(data: Record<string, unknown>): Promise<void> {
    if (this.status.locked) {
      this.ack('blocked', data, 'Control panel is locked');
      this.deps.log.add('BOT', 'warn', 'Inbound OBS request BLOCKED (locked)');
      return;
    }
    try {
      const sub = String(data.subcommand ?? '').toLowerCase();
      if (data.action === 'set_current_program_scene' || sub === 'scene') {
        const scene = String(data.scene ?? data.scene_name ?? '');
        await this.deps.obs.setScene(scene);
        this.ack('success', data, `scene → ${scene}`);
      } else if (data.action === 'set_scene_item_enabled' || sub === 'source') {
        const scene = String(data.scene ?? data.scene_name ?? '');
        const id = Number(data.item_id ?? data.source_id ?? data.sceneItemId);
        const enabled = data.enabled === undefined ? true : Boolean(data.enabled);
        await this.deps.obs.setSourceEnabled(scene, id, enabled);
        this.ack('success', data, `source ${id} → ${enabled}`);
      } else {
        throw new Error('Unknown OBS request');
      }
      this.deps.log.add('BOT', 'ok', 'Executed inbound OBS request');
    } catch (err) {
      this.ack('error', data, err instanceof Error ? err.message : String(err));
      this.deps.log.add('BOT', 'err', `Inbound OBS request failed: ${err instanceof Error ? err.message : err}`);
    }
  }

  private ack(status: string, action: unknown, message: string): void {
    if (this.socket?.connected) {
      this.socket.emit('OBS_EVENT_RECEIVED', { code: this.apiKey, status, action, message });
    }
  }
}

function describeModeration(d: Record<string, unknown>): string {
  const who = d.moderator_user_name ?? 'A moderator';
  const action = String(d.action ?? 'action');
  const target = (d[action] as { user_name?: string } | undefined)?.user_name;
  return target ? `${who} → ${action} ${target}` : `${who} → ${action}`;
}

function srcFor(event: string): 'TWITCH' | 'BOT' {
  return event.startsWith('TWITCH_') ? 'TWITCH' : 'BOT';
}
function levelFor(event: string): 'evt' | 'info' {
  return event.startsWith('TWITCH_') ? 'evt' : 'info';
}
function describe(event: string, d: Record<string, unknown>): string {
  const who = d.username ?? d.user ?? d.user_name;
  if (event === 'TWITCH_FOLLOW' && who) return `${who} followed`;
  if (event === 'TWITCH_SUB' && who) return `${who} subscribed`;
  if (event === 'TWITCH_CHEER' && who) return `${who} cheered ${d.bits ?? d.amount ?? '?'} bits`;
  if (event === 'TWITCH_RAID' && who) return `raid from ${who}`;
  if (event === 'TWITCH_CHANNELPOINTS' && who) return `${who} redeemed ${d.reward ?? d.title ?? 'a reward'}`;
  return event;
}
