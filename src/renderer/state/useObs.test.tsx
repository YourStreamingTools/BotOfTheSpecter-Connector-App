import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { ObsProvider, useObs } from './useObs';
import type { ObsStatus } from '@shared/ipc';

// Capture push-channel listeners so the test can fire main→renderer events.
let listeners: Record<string, (...args: unknown[]) => void>;

beforeEach(() => {
  listeners = {};
  window.api.on = vi.fn((channel: string, cb: (...args: unknown[]) => void) => {
    listeners[channel] = cb;
    return () => delete listeners[channel];
  });
  window.api.obs = {
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    setScene: vi.fn().mockResolvedValue(undefined),
    setSourceEnabled: vi.fn().mockResolvedValue(undefined),
    startStream: vi.fn().mockResolvedValue(undefined),
    stopStream: vi.fn().mockResolvedValue(undefined),
    startRecord: vi.fn().mockResolvedValue(undefined),
    stopRecord: vi.fn().mockResolvedValue(undefined),
    saveReplay: vi.fn().mockResolvedValue(undefined),
    startReplayBuffer: vi.fn().mockResolvedValue(undefined),
    stopReplayBuffer: vi.fn().mockResolvedValue(undefined),
    toggleVcam: vi.fn().mockResolvedValue(undefined),
    refreshScenes: vi.fn().mockResolvedValue(undefined),
    refreshAudio: vi.fn().mockResolvedValue(undefined),
    setInputMute: vi.fn().mockResolvedValue(undefined),
    listSourceFilters: vi.fn().mockResolvedValue([]),
    setSourceFilterEnabled: vi.fn().mockResolvedValue(undefined),
    snapshot: vi.fn().mockResolvedValue({ status: { state: 'disconnected', eventsForwarded: 0 }, outputs: null, stats: null, scenes: null, audio: null })
  };
});

function Probe() {
  const { status } = useObs();
  return <div data-testid="state">{status.state}</div>;
}

describe('ObsProvider / useObs', () => {
  it('starts disconnected and updates from obs:status pushes', async () => {
    render(<ObsProvider><Probe /></ObsProvider>);
    await act(async () => {}); // let the initial snapshot settle
    expect(screen.getByTestId('state').textContent).toBe('disconnected');
    act(() => listeners['obs:status']({ state: 'connected', eventsForwarded: 0 } as ObsStatus));
    expect(screen.getByTestId('state').textContent).toBe('connected');
  });

  it('seeds from the obs snapshot on mount (so navigating mid-session shows connected immediately)', async () => {
    window.api.obs.snapshot = vi.fn().mockResolvedValue({
      status: { state: 'connected', eventsForwarded: 5 }, outputs: null, stats: null, scenes: null
    });
    render(<ObsProvider><Probe /></ObsProvider>);
    expect(await screen.findByText('connected')).toBeInTheDocument();
  });

  it('clears transient outputs/stats/meters when the connection drops (no frozen LIVE state)', async () => {
    function OutProbe() {
      const { status, outputs } = useObs();
      return <div data-testid="out">{status.state}:{outputs ? String(outputs.streaming) : 'null'}</div>;
    }
    render(<ObsProvider><OutProbe /></ObsProvider>);
    await act(async () => {});
    act(() => listeners['obs:status']({ state: 'connected', eventsForwarded: 0 } as ObsStatus));
    act(() => listeners['obs:outputs']({
      streaming: true, recording: false, recordingPaused: false, replayBuffer: false,
      streamTimecode: '00:05:00', recordTimecode: '00:00:00', streamReconnecting: false, streamCongestion: 0
    }));
    expect(screen.getByTestId('out').textContent).toBe('connected:true');

    // Connection drops — the renderer must stop reporting a live stream.
    act(() => listeners['obs:status']({ state: 'disconnected', eventsForwarded: 0 } as ObsStatus));
    expect(screen.getByTestId('out').textContent).toBe('disconnected:null');
  });
});
