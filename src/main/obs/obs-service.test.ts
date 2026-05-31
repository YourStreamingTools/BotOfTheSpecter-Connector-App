// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import { ObsService } from './obs-service';
import type OBSWebSocket from 'obs-websocket-js';

// Minimal fake of the obs-websocket-js client.
class FakeObs extends EventEmitter {
  connect = vi.fn(async () => ({ obsWebSocketVersion: '5.5.0', negotiatedRpcVersion: 1 }));
  disconnect = vi.fn(async () => {});
  call = vi.fn(async (type: string, _data?: unknown): Promise<Record<string, unknown>> => {
    switch (type) {
      case 'GetSceneList':
        return { currentProgramSceneName: 'Gameplay', scenes: [{ sceneName: 'Gameplay' }, { sceneName: 'BRB' }] };
      case 'GetSceneItemList':
        return { sceneItems: [
          { sceneItemId: 1, sourceName: 'Game', inputKind: 'game_capture', sceneItemEnabled: true },
          { sceneItemId: 2, sourceName: 'Mic', inputKind: 'wasapi_input_capture', sceneItemEnabled: true }
        ] };
      case 'GetStreamStatus':
        return { outputActive: true, outputReconnecting: false, outputCongestion: 0.05, outputBytes: 0, outputDuration: 0, outputTimecode: '00:00:00.000', outputSkippedFrames: 0, outputTotalFrames: 1 };
      case 'GetRecordStatus':
        return { outputActive: false, outputBytes: 0, outputDuration: 0, outputTimecode: '00:00:00.000' };
      case 'GetReplayBufferStatus':
        return { outputActive: false };
      case 'GetStats':
        return { cpuUsage: 3.5, memoryUsage: 184, availableDiskSpace: 50 * 1_048_576 * 1024, activeFps: 60, outputSkippedFrames: 2, outputTotalFrames: 1000, renderSkippedFrames: 1, renderTotalFrames: 1200 };
      case 'GetInputList':
        return { inputs: [
          { inputName: 'Desktop Audio', inputKind: 'wasapi_output_capture' },
          { inputName: 'Mic/Aux', inputKind: 'wasapi_input_capture' },
          { inputName: 'Game', inputKind: 'game_capture' }
        ] };
      case 'GetSpecialInputs':
        return { desktop1: 'Desktop Audio', desktop2: null, mic1: 'Mic/Aux', mic2: null, mic3: null, mic4: null };
      case 'GetInputMute':
        return { inputMuted: false };
      case 'GetInputVolume':
        return { inputVolumeMul: 1, inputVolumeDb: 0 };
      default:
        return {};
    }
  });
}

let fake: FakeObs;
let service: ObsService;
const makeService = () => new ObsService({ client: fake as unknown as OBSWebSocket });

beforeEach(() => {
  fake = new FakeObs();
  service = makeService();
});

describe('ObsService', () => {
  it('constructs against the real obs-websocket-js client when none is injected', () => {
    // Guards the ESM-default interop fix: `new ObsService()` must resolve the
    // real OBSWebSocket constructor (regression for "OBSWebSocket is not a constructor").
    expect(() => new ObsService()).not.toThrow();
  });

  it('emits connecting then connected on connect()', async () => {
    const states: string[] = [];
    service.on('status', (s) => states.push(s.state));
    await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
    expect(fake.connect).toHaveBeenCalledWith('ws://localhost:4455', 'pw', expect.anything());
    expect(states).toEqual(['connecting', 'connected']);
  });

  it('emits error state when connect rejects', async () => {
    fake.connect.mockRejectedValueOnce(new Error('refused'));
    const states: string[] = [];
    service.on('status', (s) => states.push(s.state));
    await service.connect({ host: 'localhost', port: 4455, password: 'x' });
    expect(states).toEqual(['connecting', 'error']);
  });

  it('builds a scenes→sources map with classified source types', async () => {
    const scenes = vi.fn();
    service.on('scenes', scenes);
    await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
    await service.refreshScenes();
    const payload = scenes.mock.calls.at(-1)![0];
    expect(payload.current).toBe('Gameplay');
    expect(payload.sources['Gameplay'][0]).toMatchObject({ id: 1, name: 'Game', enabled: true, type: 'video' });
    expect(payload.sources['Gameplay'][1].type).toBe('audio');
  });

  it('maps requests to obs calls', async () => {
    await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
    await service.setScene('BRB');
    expect(fake.call).toHaveBeenCalledWith('SetCurrentProgramScene', { sceneName: 'BRB' });
    await service.setSourceEnabled('Gameplay', 2, false);
    expect(fake.call).toHaveBeenCalledWith('SetSceneItemEnabled', { sceneName: 'Gameplay', sceneItemId: 2, sceneItemEnabled: false });
    await service.startStream();
    expect(fake.call).toHaveBeenCalledWith('StartStream');
  });

  it('lists audio inputs (incl. special) with mute + volume, excluding video', async () => {
    const audio = vi.fn();
    service.on('audio', audio);
    await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
    await service.refreshAudio();
    const list = audio.mock.calls.at(-1)![0] as Array<{ name: string; muted: boolean; volumeDb: number }>;
    const names = list.map((a) => a.name);
    expect(names).toContain('Desktop Audio');
    expect(names).toContain('Mic/Aux');
    expect(names).not.toContain('Game');
    expect(list.find((a) => a.name === 'Mic/Aux')).toMatchObject({ muted: false, volumeDb: 0 });
  });

  it('maps the audio mute control to a SetInputMute call', async () => {
    await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
    await service.setInputMute('Mic/Aux', true);
    expect(fake.call).toHaveBeenCalledWith('SetInputMute', { inputName: 'Mic/Aux', inputMuted: true });
  });

  it('maps replay buffer controls to obs calls', async () => {
    await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
    await service.startReplayBuffer();
    expect(fake.call).toHaveBeenCalledWith('StartReplayBuffer');
    await service.stopReplayBuffer();
    expect(fake.call).toHaveBeenCalledWith('StopReplayBuffer');
    await service.saveReplay();
    expect(fake.call).toHaveBeenCalledWith('SaveReplayBuffer');
  });

  it('forwards normalized OBS events and counts them', async () => {
    const events: unknown[] = [];
    service.on('event', (e) => events.push(e));
    let status = { eventsForwarded: 0 };
    service.on('status', (s) => { status = s; });
    await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
    fake.emit('CurrentProgramSceneChanged', { sceneName: 'BRB' });
    expect(events.at(-1)).toMatchObject({ type: 'CurrentProgramSceneChanged', message: 'Scene changed → BRB' });
    expect(status.eventsForwarded).toBeGreaterThan(0);
  });

  it('emits outputs+stats from a poll tick (including expanded health fields)', async () => {
    await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
    const outputs = vi.fn();
    const stats = vi.fn();
    service.on('outputs', outputs);
    service.on('stats', stats);
    await service.pollOnce();
    expect(outputs.mock.calls.at(-1)![0]).toMatchObject({
      streaming: true, recording: false, streamReconnecting: false, streamCongestion: 0.05
    });
    expect(stats.mock.calls.at(-1)![0]).toMatchObject({
      cpuUsage: 3.5, memoryMb: 184,
      // 50 GB → 51200 MB
      availableDiskSpaceMb: 51200,
      droppedFrames: 2, outputTotalFrames: 1000,
      renderSkippedFrames: 1, renderTotalFrames: 1200
    });
  });

  it('throttles InputVolumeMeters into ~30 Hz audioMeters pushes with peak-dB-converted samples', async () => {
    await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
    const seen: Array<Array<{ name: string; peakDb: number }>> = [];
    service.on('audioMeters', (m: Array<{ name: string; peakDb: number }>) => seen.push(m));

    // First sample → emitted immediately (lastMetersEmittedAt = 0 → delta > 33ms).
    fake.emit('InputVolumeMeters', {
      inputs: [
        { inputName: 'Mic/Aux', inputLevelsMul: [[0.5, 1.0, 1.0]] },
        { inputName: 'Desktop Audio', inputLevelsMul: [[0.05, 0.1, 0.1]] }
      ]
    });
    // Immediate burst → throttled out.
    fake.emit('InputVolumeMeters', { inputs: [{ inputName: 'Mic/Aux', inputLevelsMul: [[0.5, 1.0, 1.0]] }] });

    expect(seen.length).toBe(1);
    expect(seen[0].find((m) => m.name === 'Mic/Aux')).toMatchObject({ peakDb: 0 });
    expect(seen[0].find((m) => m.name === 'Desktop Audio')!.peakDb).toBeCloseTo(-20, 0);
  });

  it('exposes a full snapshot of the latest state', async () => {
    await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
    await service.pollOnce();
    const snap = service.getSnapshot();
    expect(snap.status.state).toBe('connected');
    expect(snap.scenes?.current).toBe('Gameplay');
    expect(snap.outputs?.streaming).toBe(true);
    expect(snap.stats?.cpuUsage).toBe(3.5);
    expect(snap.audioMeters).toEqual([]);
  });

  // Helper to stub OBS calls deterministically inside a test.
  const stubObs = (stream: Record<string, unknown>, record: Record<string, unknown> = { outputActive: false, outputBytes: 0, outputDuration: 0, outputTimecode: '00:00:00.000' }) => {
    fake.call = vi.fn(async (type: string) => {
      if (type === 'GetSceneList')     return { currentProgramSceneName: 'X', scenes: [{ sceneName: 'X' }] };
      if (type === 'GetSceneItemList') return { sceneItems: [] };
      if (type === 'GetInputList')     return { inputs: [] };
      if (type === 'GetSpecialInputs') return { desktop1: null, desktop2: null, mic1: null, mic2: null, mic3: null, mic4: null };
      if (type === 'GetStreamStatus')  return stream;
      if (type === 'GetRecordStatus')  return record;
      if (type === 'GetReplayBufferStatus') return { outputActive: false };
      if (type === 'GetStats')         return { cpuUsage: 0, memoryUsage: 0, activeFps: 60, outputSkippedFrames: 0 };
      return {};
    });
  };

  it('fresh stream (outputDuration ≈ 0 at first observation): anchors immediately at wall-clock, counts up from there', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-29T00:00:00Z'));
      await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
      stubObs({ outputActive: true, outputBytes: 0, outputDuration: 0, outputTimecode: '00:00:00.000' });
      await service.pollOnce();
      expect(service.getSnapshot().outputs?.streamTimecode).toBe('00:00:00');

      // 90 wall-clock seconds later, regardless of what OBS reports, we just count wall-clock.
      vi.setSystemTime(new Date('2026-05-29T00:01:30Z'));
      stubObs({ outputActive: true, outputBytes: 0, outputDuration: 999_999_999, outputTimecode: 'lies' });
      await service.pollOnce();
      expect(service.getSnapshot().outputs?.streamTimecode).toBe('00:01:30');
    } finally {
      vi.useRealTimers();
    }
  });

  it('mid-stream app start: takes 3 samples to derive a stable ratio, then anchors to wall-clock', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-29T00:00:00Z'));
      // First poll — OBS reports a heavily-drifted outputDuration; we don't know the ratio yet.
      stubObs({ outputActive: true, outputBytes: 0, outputDuration: 35_454_965, outputTimecode: '09:50:54.965' });
      await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
      await service.pollOnce();
      expect(service.getSnapshot().outputs?.streamTimecode).toBe('00:00:00'); // waiting for samples

      // Poll 2 — first ratio sample (still not enough).
      vi.setSystemTime(new Date('2026-05-29T00:00:01Z'));
      stubObs({ outputActive: true, outputBytes: 0, outputDuration: 35_457_465, outputTimecode: 'noisy' });
      await service.pollOnce();
      expect(service.getSnapshot().outputs?.streamTimecode).toBe('00:00:00');

      // Poll 3 — second sample.
      vi.setSystemTime(new Date('2026-05-29T00:00:02Z'));
      stubObs({ outputActive: true, outputBytes: 0, outputDuration: 35_459_965, outputTimecode: 'noisy' });
      await service.pollOnce();
      expect(service.getSnapshot().outputs?.streamTimecode).toBe('00:00:00');

      // Poll 4 — third sample reached, median ratio = 2.5, anchor set.
      // outputDuration 35,462,465 / 2.5 = 14,184,986ms = 03:56:24.
      vi.setSystemTime(new Date('2026-05-29T00:00:03Z'));
      stubObs({ outputActive: true, outputBytes: 0, outputDuration: 35_462_465, outputTimecode: 'noisy' });
      await service.pollOnce();
      expect(service.getSnapshot().outputs?.streamTimecode).toBe('03:56:24');
    } finally {
      vi.useRealTimers();
    }
  });

  it('once anchored, ignores OBS outputDuration completely — multi-output config changes mid-stream do not perturb the counter', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-29T00:00:00Z'));
      // Fresh stream: anchored immediately at 00:00:00.
      stubObs({ outputActive: true, outputBytes: 0, outputDuration: 0, outputTimecode: '00:00:00.000' });
      await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
      await service.pollOnce();

      // 10 minutes later — OBS reports a wildly different outputDuration (user removed
      // a multi-output destination at some point), but our counter only cares about
      // wall-clock. Display = 00:10:00 regardless.
      vi.setSystemTime(new Date('2026-05-29T00:10:00Z'));
      stubObs({ outputActive: true, outputBytes: 0, outputDuration: 42, outputTimecode: 'whatever' });
      await service.pollOnce();
      expect(service.getSnapshot().outputs?.streamTimecode).toBe('00:10:00');

      // 5 more minutes — still wall-clock, regardless of OBS.
      vi.setSystemTime(new Date('2026-05-29T00:15:00Z'));
      stubObs({ outputActive: true, outputBytes: 0, outputDuration: 99_999_999, outputTimecode: 'still lying' });
      await service.pollOnce();
      expect(service.getSnapshot().outputs?.streamTimecode).toBe('00:15:00');
    } finally {
      vi.useRealTimers();
    }
  });

  it('stream stop/restart in the same session: counter resets to 00:00:00 and re-anchors on the new start', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-29T00:00:00Z'));
      stubObs({ outputActive: true, outputBytes: 0, outputDuration: 0, outputTimecode: '00:00:00.000' });
      await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
      await service.pollOnce();

      vi.setSystemTime(new Date('2026-05-29T00:02:00Z'));
      await service.pollOnce();
      expect(service.getSnapshot().outputs?.streamTimecode).toBe('00:02:00');

      // Stream stops.
      vi.setSystemTime(new Date('2026-05-29T00:02:30Z'));
      stubObs({ outputActive: false, outputBytes: 0, outputDuration: 0, outputTimecode: '00:00:00.000' });
      await service.pollOnce();
      expect(service.getSnapshot().outputs?.streamTimecode).toBe('00:00:00');

      // Stream starts again.
      vi.setSystemTime(new Date('2026-05-29T00:03:00Z'));
      stubObs({ outputActive: true, outputBytes: 0, outputDuration: 0, outputTimecode: '00:00:00.000' });
      await service.pollOnce();
      expect(service.getSnapshot().outputs?.streamTimecode).toBe('00:00:00');

      vi.setSystemTime(new Date('2026-05-29T00:04:00Z'));
      await service.pollOnce();
      expect(service.getSnapshot().outputs?.streamTimecode).toBe('00:01:00');
    } finally {
      vi.useRealTimers();
    }
  });

  it('with configured streamOutputCount=1, anchors immediately on first poll with no ratio sampling', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-29T00:00:00Z'));
      const svcWithCount = new ObsService({ client: fake as unknown as OBSWebSocket, getStreamOutputCount: () => 1 });
      // Pretend the app launched mid-stream — OBS reports 2 hours already on the clock.
      fake.call = vi.fn(async (type: string) => {
        if (type === 'GetSceneList')     return { currentProgramSceneName: 'X', scenes: [{ sceneName: 'X' }] };
        if (type === 'GetSceneItemList') return { sceneItems: [] };
        if (type === 'GetInputList')     return { inputs: [] };
        if (type === 'GetSpecialInputs') return { desktop1: null, desktop2: null, mic1: null, mic2: null, mic3: null, mic4: null };
        if (type === 'GetStreamStatus')  return { outputActive: true, outputBytes: 0, outputDuration: 7_200_000, outputTimecode: '02:00:00.000', outputSkippedFrames: 0 };
        if (type === 'GetRecordStatus')  return { outputActive: false, outputBytes: 0, outputDuration: 0, outputTimecode: '00:00:00.000' };
        if (type === 'GetReplayBufferStatus') return { outputActive: false };
        if (type === 'GetStats')         return { cpuUsage: 0, memoryUsage: 0, activeFps: 60, outputSkippedFrames: 0 };
        return {};
      });
      await svcWithCount.connect({ host: 'localhost', port: 4455, password: 'pw' });
      await svcWithCount.pollOnce();
      // Single stream → ratio 1.0 → instant correct display, no waiting.
      expect(svcWithCount.getSnapshot().outputs?.streamTimecode).toBe('02:00:00');
    } finally {
      vi.useRealTimers();
    }
  });

  it('with configured streamOutputCount=3, anchors immediately at outputDuration ÷ 2.5', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-29T00:00:00Z'));
      const svcWithCount = new ObsService({ client: fake as unknown as OBSWebSocket, getStreamOutputCount: () => 3 });
      // Mid-stream join with a 2.5×-drifted outputDuration. Real elapsed = 35,454,965 ÷ 2.5 = 14,181,986ms = 03:56:21.
      fake.call = vi.fn(async (type: string) => {
        if (type === 'GetSceneList')     return { currentProgramSceneName: 'X', scenes: [{ sceneName: 'X' }] };
        if (type === 'GetSceneItemList') return { sceneItems: [] };
        if (type === 'GetInputList')     return { inputs: [] };
        if (type === 'GetSpecialInputs') return { desktop1: null, desktop2: null, mic1: null, mic2: null, mic3: null, mic4: null };
        if (type === 'GetStreamStatus')  return { outputActive: true, outputBytes: 0, outputDuration: 35_454_965, outputTimecode: '09:50:54.965', outputSkippedFrames: 0 };
        if (type === 'GetRecordStatus')  return { outputActive: false, outputBytes: 0, outputDuration: 0, outputTimecode: '00:00:00.000' };
        if (type === 'GetReplayBufferStatus') return { outputActive: false };
        if (type === 'GetStats')         return { cpuUsage: 0, memoryUsage: 0, activeFps: 60, outputSkippedFrames: 0 };
        return {};
      });
      await svcWithCount.connect({ host: 'localhost', port: 4455, password: 'pw' });
      await svcWithCount.pollOnce();
      expect(svcWithCount.getSnapshot().outputs?.streamTimecode).toBe('03:56:21');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Auto mode: when recording is also active, anchors stream timecode from recording outputDuration in one poll (no sampling)', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-29T00:00:00Z'));
      // App launches mid-stream. Recording was started at the same time as streaming and
      // is the reliable ground-truth elapsed clock. Stream's outputDuration is 2.5× drifted.
      fake.call = vi.fn(async (type: string) => {
        if (type === 'GetSceneList')     return { currentProgramSceneName: 'X', scenes: [{ sceneName: 'X' }] };
        if (type === 'GetSceneItemList') return { sceneItems: [] };
        if (type === 'GetInputList')     return { inputs: [] };
        if (type === 'GetSpecialInputs') return { desktop1: null, desktop2: null, mic1: null, mic2: null, mic3: null, mic4: null };
        if (type === 'GetStreamStatus')  return { outputActive: true, outputBytes: 0, outputDuration: 35_454_965, outputTimecode: '09:50:54.965', outputSkippedFrames: 0 };
        if (type === 'GetRecordStatus')  return { outputActive: true, outputBytes: 0, outputDuration: 14_181_986, outputTimecode: '03:56:21.986' };
        if (type === 'GetReplayBufferStatus') return { outputActive: false };
        if (type === 'GetStats')         return { cpuUsage: 0, memoryUsage: 0, activeFps: 60, outputSkippedFrames: 0 };
        return {};
      });
      await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
      await service.pollOnce();
      // Recording-derived anchor: streamTimecode = recordTimecode in this case.
      expect(service.getSnapshot().outputs?.streamTimecode).toBe('03:56:21');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Auto mode: when recording was started much later, ignores it and falls back to sampling', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-29T00:00:00Z'));
      // Stream has been live for ages with multi-output drift. Recording just started ~10s ago.
      // The implied ratio (35454965 / 10000 = ~3500) is wildly out of range → reject.
      fake.call = vi.fn(async (type: string) => {
        if (type === 'GetSceneList')     return { currentProgramSceneName: 'X', scenes: [{ sceneName: 'X' }] };
        if (type === 'GetSceneItemList') return { sceneItems: [] };
        if (type === 'GetInputList')     return { inputs: [] };
        if (type === 'GetSpecialInputs') return { desktop1: null, desktop2: null, mic1: null, mic2: null, mic3: null, mic4: null };
        if (type === 'GetStreamStatus')  return { outputActive: true, outputBytes: 0, outputDuration: 35_454_965, outputTimecode: 'noisy', outputSkippedFrames: 0 };
        if (type === 'GetRecordStatus')  return { outputActive: true, outputBytes: 0, outputDuration: 10_000, outputTimecode: '00:00:10.000' };
        if (type === 'GetReplayBufferStatus') return { outputActive: false };
        if (type === 'GetStats')         return { cpuUsage: 0, memoryUsage: 0, activeFps: 60, outputSkippedFrames: 0 };
        return {};
      });
      await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
      await service.pollOnce();
      // Recording-derived ratio rejected → no anchor yet → sampling path waits.
      expect(service.getSnapshot().outputs?.streamTimecode).toBe('00:00:00');
    } finally {
      vi.useRealTimers();
    }
  });

  it('with an unknown streamOutputCount (e.g. 7), falls back to the sampling path', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-29T00:00:00Z'));
      const svcWithCount = new ObsService({ client: fake as unknown as OBSWebSocket, getStreamOutputCount: () => 7 });
      // First poll mid-stream — without a known ratio for 7 outputs, we sample.
      fake.call = vi.fn(async (type: string) => {
        if (type === 'GetSceneList')     return { currentProgramSceneName: 'X', scenes: [{ sceneName: 'X' }] };
        if (type === 'GetSceneItemList') return { sceneItems: [] };
        if (type === 'GetInputList')     return { inputs: [] };
        if (type === 'GetSpecialInputs') return { desktop1: null, desktop2: null, mic1: null, mic2: null, mic3: null, mic4: null };
        if (type === 'GetStreamStatus')  return { outputActive: true, outputBytes: 0, outputDuration: 35_454_965, outputTimecode: 'noisy', outputSkippedFrames: 0 };
        if (type === 'GetRecordStatus')  return { outputActive: false, outputBytes: 0, outputDuration: 0, outputTimecode: '00:00:00.000' };
        if (type === 'GetReplayBufferStatus') return { outputActive: false };
        if (type === 'GetStats')         return { cpuUsage: 0, memoryUsage: 0, activeFps: 60, outputSkippedFrames: 0 };
        return {};
      });
      await svcWithCount.connect({ host: 'localhost', port: 4455, password: 'pw' });
      await svcWithCount.pollOnce();
      // No anchor yet — sampling path requires 3 polls.
      expect(svcWithCount.getSnapshot().outputs?.streamTimecode).toBe('00:00:00');
    } finally {
      vi.useRealTimers();
    }
  });

  it('recordTimecode is taken straight from outputDuration — recording is not affected by the multi-output bug', async () => {
    await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
    stubObs(
      { outputActive: false, outputBytes: 0, outputDuration: 0, outputTimecode: '00:00:00.000' },
      { outputActive: true,  outputBytes: 0, outputDuration: 14_177_049, outputTimecode: '03:56:17.049' }
    );
    await service.pollOnce();
    expect(service.getSnapshot().outputs?.recordTimecode).toBe('03:56:17');
  });

  it('computes bitrate from wall-clock delta, not OBS outputDuration delta', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-29T00:00:00Z'));
      await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
      await service.pollOnce(); // first poll: outputBytes = 0, lastPollAt = now

      // 1 wall-clock second later, 5000 kbps actual = 625,000 bytes. OBS's outputDuration
      // drifted (claims 5000ms elapsed instead of 1000ms) — bitrate must still read 5000.
      vi.setSystemTime(new Date('2026-05-29T00:00:01Z'));
      fake.call = vi.fn(async (type: string) => {
        if (type === 'GetStreamStatus')  return { outputActive: true,  outputBytes: 625_000, outputDuration: 5000, outputTimecode: 'whatever', outputSkippedFrames: 0 };
        if (type === 'GetRecordStatus')  return { outputActive: false, outputBytes: 0, outputDuration: 0, outputTimecode: '00:00:00.000' };
        if (type === 'GetReplayBufferStatus') return { outputActive: false };
        if (type === 'GetStats')         return { cpuUsage: 0, memoryUsage: 0, activeFps: 60, outputSkippedFrames: 0 };
        return {};
      });
      const stats = vi.fn();
      service.on('stats', stats);
      await service.pollOnce();

      expect(stats.mock.calls.at(-1)![0]).toMatchObject({ streamBitrateKbps: 5000 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('lists source filters via GetSourceFilterList and maps the response to ObsSourceFilter[]', async () => {
    fake.call = vi.fn(async (type: string) => {
      if (type === 'GetSourceFilterList') return { filters: [
        { filterName: 'Color Correction', filterKind: 'color_correction_filter_v2', filterEnabled: true, filterIndex: 0 },
        { filterName: 'Sharpen',          filterKind: 'sharpness_filter_v2',        filterEnabled: false, filterIndex: 1 }
      ] };
      return {};
    });
    await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
    const filters = await service.listSourceFilters('Game');
    expect(fake.call).toHaveBeenCalledWith('GetSourceFilterList', { sourceName: 'Game' });
    expect(filters).toEqual([
      { name: 'Color Correction', kind: 'color_correction_filter_v2', enabled: true,  index: 0 },
      { name: 'Sharpen',          kind: 'sharpness_filter_v2',        enabled: false, index: 1 }
    ]);
  });

  it('toggles a filter via SetSourceFilterEnabled', async () => {
    await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
    await service.setSourceFilterEnabled('Game', 'Sharpen', true);
    expect(fake.call).toHaveBeenCalledWith('SetSourceFilterEnabled', { sourceName: 'Game', filterName: 'Sharpen', filterEnabled: true });
  });

  it('returns an empty list when GetSourceFilterList responds without a filters array', async () => {
    fake.call = vi.fn(async () => ({}));
    await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
    expect(await service.listSourceFilters('NoSource')).toEqual([]);
  });

  it('clears cached outputs/stats/scenes on disconnect', async () => {
    await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
    await service.pollOnce();
    await service.disconnect();
    const snap = service.getSnapshot();
    expect(snap.status.state).toBe('disconnected');
    expect(snap.outputs).toBeNull();
    expect(snap.stats).toBeNull();
    expect(snap.scenes).toBeNull();
  });

  it('reconnecting after an unexpected drop re-anchors a freshly-restarted stream at 00:00:00 (no carried-over timecode jump)', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-29T00:00:00Z'));
      // Session 1: a fresh stream anchors immediately at 00:00:00.
      stubObs({ outputActive: true, outputBytes: 0, outputDuration: 0, outputTimecode: '00:00:00.000' });
      await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
      await service.pollOnce();
      vi.setSystemTime(new Date('2026-05-29T00:02:00Z'));
      await service.pollOnce();
      expect(service.getSnapshot().outputs?.streamTimecode).toBe('00:02:00');

      // The OBS websocket drops unexpectedly — no disconnect() is called, so the
      // stream anchor from session 1 would survive without an explicit reset.
      fake.emit('ConnectionClosed');
      expect(service.getSnapshot().status.state).toBe('disconnected');

      // 10 minutes later OBS is back and a brand-new stream is live (outputDuration ≈ 0).
      vi.setSystemTime(new Date('2026-05-29T00:12:00Z'));
      stubObs({ outputActive: true, outputBytes: 0, outputDuration: 0, outputTimecode: '00:00:00.000' });
      await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
      await service.pollOnce();

      // The new stream just started, so the LIVE clock must read 00:00:00 — not
      // 00:12:00, which is what a stale carried-over anchor would display.
      expect(service.getSnapshot().outputs?.streamTimecode).toBe('00:00:00');
    } finally {
      vi.useRealTimers();
    }
  });

  it('an unexpected ConnectionClosed resets cached session state so the snapshot stops reporting a live stream', async () => {
    await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
    await service.pollOnce();
    expect(service.getSnapshot().outputs?.streaming).toBe(true);

    fake.emit('ConnectionClosed');

    const snap = service.getSnapshot();
    expect(snap.status.state).toBe('disconnected');
    expect(snap.outputs).toBeNull();
    expect(snap.stats).toBeNull();
  });

  it('does not carry a stale bitrate across a reconnect (first post-reconnect poll reads 0 until a fresh delta)', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-05-29T00:00:00Z'));
      await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
      stubObs({ outputActive: true, outputBytes: 0, outputDuration: 0, outputTimecode: '00:00:00.000' });
      await service.pollOnce();
      // 1s later, +625,000 bytes → 5000 kbps.
      vi.setSystemTime(new Date('2026-05-29T00:00:01Z'));
      stubObs({ outputActive: true, outputBytes: 625_000, outputDuration: 0, outputTimecode: '00:00:01.000' });
      await service.pollOnce();
      expect(service.getSnapshot().stats?.streamBitrateKbps).toBe(5000);

      // Drop, then reconnect a minute later.
      fake.emit('ConnectionClosed');
      vi.setSystemTime(new Date('2026-05-29T00:01:00Z'));
      await service.connect({ host: 'localhost', port: 4455, password: 'pw' });
      // OBS reports a large byte counter, but with no prior in-session sample the
      // first poll must report 0, not a stale value derived from session 1.
      stubObs({ outputActive: true, outputBytes: 5_000_000, outputDuration: 0, outputTimecode: '00:00:00.000' });
      await service.pollOnce();
      expect(service.getSnapshot().stats?.streamBitrateKbps).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
