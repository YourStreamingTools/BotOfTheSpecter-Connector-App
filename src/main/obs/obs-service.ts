import { EventEmitter } from 'events';
import OBSWebSocket, { EventSubscription } from 'obs-websocket-js';
import type { ObsAudioMeter, ObsAudioSource, ObsConnectParams, ObsOutputs, ObsScenes, ObsSnapshot, ObsSource, ObsSourceFilter, ObsStats, ObsStatus } from '@shared/ipc';
import { deltaBitrateKbps } from './bitrate';
import { normalizeObsEvent } from './obs-events';
import { classifySource } from './obs-sources';
import { peakDbFromLevels } from './audio-meters';

// obs-websocket-js exports its class as the ESM default; under CommonJS bundling the import can bind to the namespace, so resolve the real constructor via `.default ?? OBSWebSocket`.
const OBSWebSocketCtor: typeof OBSWebSocket =
  (OBSWebSocket as unknown as { default?: typeof OBSWebSocket }).default ?? OBSWebSocket;

const FORWARDED_EVENTS = [
  'CurrentProgramSceneChanged', 'CurrentPreviewSceneChanged', 'SceneItemEnableStateChanged',
  'SceneCreated', 'SceneRemoved', 'StreamStateChanged', 'RecordStateChanged',
  'ReplayBufferStateChanged', 'VirtualcamStateChanged', 'InputMuteStateChanged'
];
const RELAYOUT_EVENTS = new Set([
  'SceneItemEnableStateChanged', 'SceneCreated', 'SceneRemoved', 'SceneItemCreated', 'SceneItemRemoved'
]);

export interface ObsServiceDeps {
  client?: OBSWebSocket;
  /** Optional accessor for the user-configured stream output count (1-4); when known, anchors the LIVE timecode immediately via a preset ratio, else falls back to median-of-3 sampling. */
  getStreamOutputCount?: () => number | null | undefined;
}

/** outputDuration → real-time conversion ratios by stream output count; 1 and 3 verified, 2 and 4 extrapolated from `1 + (N-1) × 0.75`. */
const KNOWN_OUTPUT_RATIOS: Record<number, number> = {
  1: 1.0,
  2: 1.75,
  3: 2.5,
  4: 3.25
};

export class ObsService extends EventEmitter {
  private obs: OBSWebSocket;
  private getStreamOutputCount: () => number | null | undefined;
  private status: ObsStatus = { state: 'disconnected', eventsForwarded: 0 };
  // Byte counters from the previous poll for bitrate deltas; time deltas use wall-clock (`lastPollAt`), not OBS's outputDuration, which can drift across sessions.
  private prev = { streamBytes: 0, recordBytes: 0 };
  private lastPollAt = 0;
  private lastStreamKbps = 0;
  private lastRecordKbps = 0;
  // OBS stream `outputDuration` ticks at ~Nx wall-clock for N multi-output destinations; we anchor once (fresh stream → wall-clock now; mid-stream → median of 3 outputDuration/wall-clock ratio samples) then display `realAtAnchor + (now - wallAnchor)` without re-reading outputDuration, so mid-stream destination changes can't perturb it. Recording is single-output so its timecode is `outputDuration` direct.
  private streamWallAnchor: number | null = null;
  private streamRealAtAnchor = 0;
  private streamRatioSamples: number[] = [];
  private prevStreamDurationMs: number | null = null;
  // Mid-stream join is anything above this much already on the clock at first observation.
  private static readonly FRESH_THRESHOLD_MS = 2_000;
  private static readonly NEEDED_SAMPLES = 3;
  // InputVolumeMeters fires at ~60 Hz; throttle to ~30 Hz to spare IPC traffic but keep the latest sample for snapshot reads.
  private lastAudioMeters: ObsAudioMeter[] = [];
  private lastMetersEmittedAt = 0;
  private url = '';
  // Latest pushed values, retained so a renderer mounting mid-session can seed from getSnapshot() instead of waiting for the next push.
  private lastOutputs: ObsOutputs | null = null;
  private lastStats: ObsStats | null = null;
  private lastScenes: ObsScenes | null = null;
  private lastAudio: ObsAudioSource[] | null = null;
  private audioRefreshTimer?: NodeJS.Timeout;

  constructor(deps: ObsServiceDeps = {}) {
    super();
    this.obs = deps.client ?? new OBSWebSocketCtor();
    this.getStreamOutputCount = deps.getStreamOutputCount ?? (() => null);
    this.registerEventForwarding();
  }

  getStatus(): ObsStatus {
    return this.status;
  }

  getSnapshot(): ObsSnapshot {
    return { status: this.status, outputs: this.lastOutputs, stats: this.lastStats, scenes: this.lastScenes, audio: this.lastAudio, audioMeters: this.lastAudioMeters };
  }

  private setStatus(patch: Partial<ObsStatus>): void {
    this.status = { ...this.status, ...patch };
    this.emit('status', this.status);
  }

  async connect(params: ObsConnectParams): Promise<void> {
    this.url = `ws://${params.host}:${params.port}`;
    // Start from a clean slate so a stale stream anchor or bitrate counter from a prior session (e.g. one ended via ConnectionClosed without disconnect) can't skew the new session.
    this.resetSession();
    this.setStatus({ state: 'connecting', url: this.url, error: undefined });
    try {
      const { obsWebSocketVersion, negotiatedRpcVersion } = await this.obs.connect(
        this.url,
        params.password,
        // EventSubscription.All excludes the high-volume meter event, so OR in InputVolumeMeters explicitly for the UI bars.
        { eventSubscriptions: EventSubscription.All | EventSubscription.InputVolumeMeters, rpcVersion: 1 }
      );
      this.setStatus({ state: 'connected', obsVersion: obsWebSocketVersion, rpcVersion: negotiatedRpcVersion });
      await this.refreshScenes();
      await this.refreshAudio().catch(() => undefined);
    } catch (err) {
      this.setStatus({ state: 'error', error: err instanceof Error ? err.message : String(err) });
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.obs.disconnect();
    } finally {
      this.resetSession();
      this.setStatus({ state: 'disconnected', error: undefined });
    }
  }

  /** Reset all per-connection state (bitrate sampling, stream-duration anchor, throttled meters, cached snapshots, pending audio-refresh timer); called on (re)connect and on connection end via disconnect() or ConnectionClosed. */
  private resetSession(): void {
    this.prev = { streamBytes: 0, recordBytes: 0 };
    this.lastPollAt = 0;
    this.lastStreamKbps = 0;
    this.lastRecordKbps = 0;
    this.resetStreamAnchor();
    this.lastAudioMeters = [];
    this.lastMetersEmittedAt = 0;
    this.lastOutputs = null;
    this.lastStats = null;
    this.lastScenes = null;
    this.lastAudio = null;
    if (this.audioRefreshTimer) { clearTimeout(this.audioRefreshTimer); this.audioRefreshTimer = undefined; }
  }

  async refreshScenes(): Promise<void> {
    const list = await this.obs.call('GetSceneList');
    const current = list.currentProgramSceneName ?? '';
    const sceneNames = list.scenes.map((s) => String((s as { sceneName: string }).sceneName)).reverse();
    const sources: Record<string, ObsSource[]> = {};
    for (const name of sceneNames) {
      const items = await this.obs.call('GetSceneItemList', { sceneName: name });
      sources[name] = items.sceneItems.map((it) => {
        const item = it as unknown as { sceneItemId: number; sourceName: string; inputKind?: string; sceneItemEnabled: boolean };
        return {
          id: item.sceneItemId,
          name: item.sourceName,
          enabled: item.sceneItemEnabled,
          type: classifySource(item.inputKind)
        };
      });
    }
    const payload: ObsScenes = { current, scenes: sceneNames, sources };
    this.lastScenes = payload;
    this.emit('scenes', payload);
  }

  /** Fetch the audio mixer (audio-kind inputs from GetInputList plus global/special inputs like desktop audio and mic/aux), each with mute state and volume; emits 'audio'. */
  async refreshAudio(): Promise<void> {
    if (this.status.state !== 'connected') return;
    const list = await this.obs.call('GetInputList');
    const inputs = (list.inputs ?? []) as Array<{ inputName: string; inputKind: string }>;

    const kindByName = new Map<string, string>();
    for (const inp of inputs) {
      if (classifySource(inp.inputKind) === 'audio') kindByName.set(inp.inputName, inp.inputKind);
    }
    try {
      const special = (await this.obs.call('GetSpecialInputs')) as Record<string, string | null | undefined>;
      for (const name of Object.values(special)) {
        if (name && !kindByName.has(name)) kindByName.set(name, inputs.find((i) => i.inputName === name)?.inputKind ?? 'audio');
      }
    } catch { /* GetSpecialInputs may be unavailable on older OBS builds */ }

    const sources: ObsAudioSource[] = [];
    for (const [name, kind] of kindByName) {
      try {
        const [mute, vol] = await Promise.all([
          this.obs.call('GetInputMute', { inputName: name }),
          this.obs.call('GetInputVolume', { inputName: name })
        ]);
        const db = (vol as { inputVolumeDb: number }).inputVolumeDb;
        sources.push({
          name, kind,
          muted: Boolean((mute as { inputMuted: boolean }).inputMuted),
          volumeDb: Number.isFinite(db) ? Math.round(db * 10) / 10 : -100
        });
      } catch { /* input exposes no audio track (no mute/volume) — skip it */ }
    }
    sources.sort((a, b) => a.name.localeCompare(b.name));
    this.lastAudio = sources;
    this.emit('audio', sources);
  }

  setInputMute(name: string, muted: boolean): Promise<unknown> {
    return this.obs.call('SetInputMute', { inputName: name, inputMuted: muted });
  }

  // Collapse bursts of audio events (mute + volume often fire together) into one refresh.
  private scheduleAudioRefresh(): void {
    if (this.audioRefreshTimer) return;
    this.audioRefreshTimer = setTimeout(() => {
      this.audioRefreshTimer = undefined;
      if (this.status.state === 'connected') void this.refreshAudio().catch(() => undefined);
    }, 250);
  }

  setScene(sceneName: string): Promise<unknown> {
    return this.obs.call('SetCurrentProgramScene', { sceneName });
  }
  setSourceEnabled(sceneName: string, sceneItemId: number, enabled: boolean): Promise<unknown> {
    return this.obs.call('SetSceneItemEnabled', { sceneName, sceneItemId, sceneItemEnabled: enabled });
  }
  startStream(): Promise<unknown> { return this.obs.call('StartStream'); }
  stopStream(): Promise<unknown> { return this.obs.call('StopStream'); }
  startRecord(): Promise<unknown> { return this.obs.call('StartRecord'); }
  stopRecord(): Promise<unknown> { return this.obs.call('StopRecord'); }
  saveReplay(): Promise<unknown> { return this.obs.call('SaveReplayBuffer'); }
  startReplayBuffer(): Promise<unknown> { return this.obs.call('StartReplayBuffer'); }
  stopReplayBuffer(): Promise<unknown> { return this.obs.call('StopReplayBuffer'); }
  toggleVcam(): Promise<unknown> { return this.obs.call('ToggleVirtualCam'); }

  /** Fetch a source's filter list in OBS stacking order (smaller `filterIndex` renders first); order is passed through for the renderer to sort if desired. */
  async listSourceFilters(sourceName: string): Promise<ObsSourceFilter[]> {
    const res = await this.obs.call('GetSourceFilterList', { sourceName });
    const raw = (res as { filters?: Array<{ filterName: string; filterKind: string; filterEnabled: boolean; filterIndex: number }> }).filters;
    if (!Array.isArray(raw)) return [];
    return raw.map((f) => ({
      name: String(f.filterName ?? ''),
      kind: String(f.filterKind ?? ''),
      enabled: Boolean(f.filterEnabled),
      index: Number(f.filterIndex ?? 0)
    }));
  }

  async setSourceFilterEnabled(sourceName: string, filterName: string, filterEnabled: boolean): Promise<void> {
    await this.obs.call('SetSourceFilterEnabled', { sourceName, filterName, filterEnabled });
  }

  /** One status poll: emits outputs + stats. Driven on a 1s interval by the main process. */
  async pollOnce(): Promise<void> {
    if (this.status.state !== 'connected') return;
    const [stream, record, replay, stats] = await Promise.all([
      this.obs.call('GetStreamStatus'),
      this.obs.call('GetRecordStatus'),
      this.obs.call('GetReplayBufferStatus').catch(() => ({ outputActive: false })),
      this.obs.call('GetStats')
    ]);

    const s = stream as {
      outputActive: boolean; outputReconnecting?: boolean; outputCongestion?: number;
      outputBytes: number; outputDuration: number; outputTimecode: string;
      outputSkippedFrames?: number; outputTotalFrames?: number;
    };
    const r = record as { outputActive: boolean; outputPaused?: boolean; outputBytes: number; outputDuration: number; outputTimecode: string };
    const st = stats as {
      cpuUsage: number; memoryUsage: number; availableDiskSpace?: number;
      activeFps: number; outputSkippedFrames?: number; outputTotalFrames?: number;
      renderSkippedFrames?: number; renderTotalFrames?: number;
    };

    const now = Date.now();
    const wallDeltaMs = this.lastPollAt > 0 ? now - this.lastPollAt : 0;

    // Bitrate: delta bytes over wall-clock delta time, not OBS's outputDuration, which can drift from real time (e.g. counter not fully reset between sessions in the same process).
    if (wallDeltaMs > 0) {
      const streamKbps = deltaBitrateKbps(this.prev.streamBytes, 0, s.outputBytes, wallDeltaMs);
      if (streamKbps !== null) this.lastStreamKbps = streamKbps;
      const recordKbps = deltaBitrateKbps(this.prev.recordBytes, 0, r.outputBytes, wallDeltaMs);
      if (recordKbps !== null) this.lastRecordKbps = recordKbps;
    }
    this.prev = { streamBytes: s.outputBytes, recordBytes: r.outputBytes };
    this.lastPollAt = now;

    const streamDur = s.outputDuration ?? 0;
    const recordDur = r.outputDuration ?? 0;
    if (s.outputActive) {
      this.advanceStreamAnchor(streamDur, recordDur, r.outputActive, now, wallDeltaMs);
    } else {
      this.resetStreamAnchor();
    }
    const streamTimecode = !s.outputActive
      ? '00:00:00'
      : this.streamWallAnchor !== null
        ? formatHms(this.streamRealAtAnchor + (now - this.streamWallAnchor))
        : '00:00:00';
    const recordTimecode = r.outputActive ? formatHms(r.outputDuration ?? 0) : '00:00:00';

    const outputs: ObsOutputs = {
      streaming: s.outputActive,
      recording: r.outputActive,
      recordingPaused: Boolean(r.outputPaused),
      replayBuffer: Boolean((replay as { outputActive?: boolean }).outputActive),
      streamTimecode,
      recordTimecode,
      streamReconnecting: Boolean(s.outputReconnecting),
      streamCongestion: clamp01(s.outputCongestion ?? 0)
    };
    this.lastOutputs = outputs;
    this.emit('outputs', outputs);

    const out: ObsStats = {
      streamBitrateKbps: this.lastStreamKbps,
      recordBitrateKbps: this.lastRecordKbps,
      cpuUsage: Number((st.cpuUsage ?? 0).toFixed(1)),
      memoryMb: Math.round(st.memoryUsage ?? 0),
      activeFps: Math.round(st.activeFps ?? 0),
      droppedFrames: st.outputSkippedFrames ?? 0,
      // GetStats reports availableDiskSpace in BYTES; surface it in megabytes for the UI.
      availableDiskSpaceMb: Math.round((st.availableDiskSpace ?? 0) / 1_048_576),
      renderSkippedFrames: st.renderSkippedFrames ?? 0,
      renderTotalFrames: st.renderTotalFrames ?? 0,
      outputTotalFrames: st.outputTotalFrames ?? 0
    };
    this.lastStats = out;
    this.emit('stats', out);
  }

  /** Latest throttled audio meter sample — used by getSnapshot fallbacks. */
  getAudioMeters(): ObsAudioMeter[] {
    return this.lastAudioMeters;
  }

  private registerEventForwarding(): void {
    const on = this.obs.on.bind(this.obs) as unknown as (event: string, cb: (data?: Record<string, unknown>) => void) => void;
    for (const name of FORWARDED_EVENTS) {
      on(name, (data = {}) => {
        const entry = normalizeObsEvent(name, data);
        this.setStatus({ eventsForwarded: this.status.eventsForwarded + 1 });
        this.emit('event', { ...entry, t: timecode(), data });
        if (name === 'CurrentProgramSceneChanged' || RELAYOUT_EVENTS.has(name)) {
          if (this.status.state === 'connected') void this.refreshScenes().catch(() => undefined);
        }
      });
    }
    for (const name of ['InputMuteStateChanged', 'InputVolumeChanged', 'InputCreated', 'InputRemoved', 'InputNameChanged']) {
      on(name, () => this.scheduleAudioRefresh());
    }
    // High-volume audio meters throttled to ~30 Hz to spare IPC traffic; latest sample cached for snapshot reads.
    on('InputVolumeMeters', (data) => this.onAudioMeters(data));
    on('ConnectionClosed', () => {
      if (this.status.state === 'connected') {
        // Drop the dead session's state; ConnectionClosed is the unexpected-drop path (no disconnect()), so without this a reconnect would reuse a stale anchor and jump the LIVE timecode.
        this.resetSession();
        this.setStatus({ state: 'disconnected' });
      }
    });
  }

  /** Set the stream timecode anchor on a poll, trying in order: configured output-count preset, recording-derived (recording's single-output outputDuration as ground truth when ratio is plausible), fresh-start (outputDuration ≈ 0 → wall-clock now), then median-of-3 sampling; no-op once anchored. */
  private advanceStreamAnchor(streamDur: number, recordDur: number, recordActive: boolean, now: number, wallDeltaMs: number): void {
    if (this.streamWallAnchor !== null) return; // already anchored — nothing to do

    // 1. User-configured output count → exact ratio from the lookup table.
    const configuredCount = this.getStreamOutputCount();
    const presetRatio = typeof configuredCount === 'number' ? KNOWN_OUTPUT_RATIOS[configuredCount] : undefined;
    if (presetRatio !== undefined) {
      this.streamRealAtAnchor = streamDur / presetRatio;
      this.streamWallAnchor = now;
      this.prevStreamDurationMs = streamDur;
      return;
    }

    // 2. Auto mode + recording active + plausible implied ratio (stream ÷ record, valid only when both outputs started close together) → use recording's outputDuration as true elapsed time, else fall through to sampling.
    if (recordActive && recordDur > 1_000 && streamDur > 1_000) {
      const impliedRatio = streamDur / recordDur;
      if (impliedRatio >= 0.5 && impliedRatio <= 10) {
        this.streamRealAtAnchor = recordDur;
        this.streamWallAnchor = now;
        this.prevStreamDurationMs = streamDur;
        return;
      }
    }

    if (this.prevStreamDurationMs === null) {
      // First observation. Fresh start → anchor immediately. Mid-stream → wait.
      if (streamDur < ObsService.FRESH_THRESHOLD_MS) {
        this.streamRealAtAnchor = streamDur;
        this.streamWallAnchor = now;
      }
      this.prevStreamDurationMs = streamDur;
      return;
    }
    if (wallDeltaMs <= 100) return; // too short to derive a meaningful ratio
    const durDelta = streamDur - this.prevStreamDurationMs;
    this.prevStreamDurationMs = streamDur;
    if (durDelta <= 0) return; // counter went backwards or paused — skip
    const r = durDelta / wallDeltaMs;
    if (r <= 0.5 || r >= 10) return; // wildly out of range — ignore as noise
    this.streamRatioSamples.push(r);
    if (this.streamRatioSamples.length < ObsService.NEEDED_SAMPLES) return;
    // Median of N samples → robust against a single noisy poll
    const sorted = [...this.streamRatioSamples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    this.streamRealAtAnchor = streamDur / median;
    this.streamWallAnchor = now;
  }

  private resetStreamAnchor(): void {
    this.streamWallAnchor = null;
    this.streamRealAtAnchor = 0;
    this.streamRatioSamples = [];
    this.prevStreamDurationMs = null;
  }

  private onAudioMeters(data: Record<string, unknown> = {}): void {
    const inputs = (data as { inputs?: Array<{ inputName?: string; inputLevelsMul?: unknown }> }).inputs;
    if (!Array.isArray(inputs)) return;
    const meters: ObsAudioMeter[] = inputs.map((input) => ({
      name: String(input?.inputName ?? ''),
      peakDb: peakDbFromLevels(input?.inputLevelsMul)
    })).filter((m) => m.name);
    this.lastAudioMeters = meters;
    const now = Date.now();
    if (now - this.lastMetersEmittedAt < 33) return; // ~30 Hz
    this.lastMetersEmittedAt = now;
    this.emit('audioMeters', meters);
  }
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function timecode(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}

// HH:MM:SS (no decimal) from a duration in milliseconds, for the streaming/recording timecode display.
function formatHms(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(h)}:${p(m)}:${p(s)}`;
}
