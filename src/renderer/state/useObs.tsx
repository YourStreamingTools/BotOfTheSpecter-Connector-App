import React from 'react';
import { IPC, type ObsAudioMeter, type ObsAudioSource, type ObsConnectParams, type ObsLogEntry, type ObsOutputs, type ObsScenes, type ObsStats, type ObsStatus } from '@shared/ipc';

const LOG_CAP = 200;

interface ObsActions {
  connect: (p: ObsConnectParams) => Promise<void>;
  disconnect: () => Promise<void>;
  setScene: (name: string) => Promise<void>;
  toggleSource: (scene: string, id: number, enabled: boolean) => Promise<void>;
  startStream: () => Promise<void>;
  stopStream: () => Promise<void>;
  startRecord: () => Promise<void>;
  stopRecord: () => Promise<void>;
  saveReplay: () => Promise<void>;
  startReplayBuffer: () => Promise<void>;
  stopReplayBuffer: () => Promise<void>;
  toggleVcam: () => Promise<void>;
  refreshScenes: () => Promise<void>;
  refreshAudio: () => Promise<void>;
  setInputMute: (name: string, muted: boolean) => Promise<void>;
}

interface ObsContextValue {
  status: ObsStatus;
  outputs: ObsOutputs | null;
  stats: ObsStats | null;
  scenes: ObsScenes | null;
  audio: ObsAudioSource[] | null;
  audioMeters: ObsAudioMeter[];
  log: ObsLogEntry[];
  actions: ObsActions;
}

// Actions are stateless passthroughs to the bridge, so a single stable object is shared.
const obsActions: ObsActions = {
  connect: (p) => window.api.obs.connect(p),
  disconnect: () => window.api.obs.disconnect(),
  setScene: (name) => window.api.obs.setScene(name),
  toggleSource: (scene, id, enabled) => window.api.obs.setSourceEnabled(scene, id, enabled),
  startStream: () => window.api.obs.startStream(),
  stopStream: () => window.api.obs.stopStream(),
  startRecord: () => window.api.obs.startRecord(),
  stopRecord: () => window.api.obs.stopRecord(),
  saveReplay: () => window.api.obs.saveReplay(),
  startReplayBuffer: () => window.api.obs.startReplayBuffer(),
  stopReplayBuffer: () => window.api.obs.stopReplayBuffer(),
  toggleVcam: () => window.api.obs.toggleVcam(),
  refreshScenes: () => window.api.obs.refreshScenes(),
  refreshAudio: () => window.api.obs.refreshAudio(),
  setInputMute: (name, muted) => window.api.obs.setInputMute(name, muted)
};

const DEFAULT: ObsContextValue = {
  status: { state: 'disconnected', eventsForwarded: 0 },
  outputs: null, stats: null, scenes: null, audio: null, audioMeters: [], log: [], actions: obsActions
};

const ObsContext = React.createContext<ObsContextValue>(DEFAULT);

// Single OBS state store mounted once at the root so connection state, scenes, outputs and event log persist across screen navigation.
export function ObsProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = React.useState<ObsStatus>(DEFAULT.status);
  const [outputs, setOutputs] = React.useState<ObsOutputs | null>(null);
  const [stats, setStats] = React.useState<ObsStats | null>(null);
  const [scenes, setScenes] = React.useState<ObsScenes | null>(null);
  const [audio, setAudio] = React.useState<ObsAudioSource[] | null>(null);
  const [audioMeters, setAudioMeters] = React.useState<ObsAudioMeter[]>([]);
  const [log, setLog] = React.useState<ObsLogEntry[]>([]);

  React.useEffect(() => {
    let alive = true;
    // Seed from current state so a connect that happened before mount (auto-connect during bootstrap) is reflected without waiting for a push.
    void window.api.obs.snapshot().then((snap) => {
      if (!alive || !snap) return;
      setStatus(snap.status);
      if (snap.outputs) setOutputs(snap.outputs);
      if (snap.stats) setStats(snap.stats);
      if (snap.scenes) setScenes(snap.scenes);
      if (snap.audio) setAudio(snap.audio);
      if (snap.audioMeters?.length) setAudioMeters(snap.audioMeters);
    });
    const offs = [
      window.api.on(IPC.obsStatus, (s) => {
        const st = s as ObsStatus;
        setStatus(st);
        // When OBS is no longer connected (explicit disconnect or unexpected drop), clear live data so the UI doesn't show a frozen LIVE state with stale timecode, bitrate and meters.
        if (st.state !== 'connected') {
          setOutputs(null);
          setStats(null);
          setAudio(null);
          setAudioMeters([]);
        }
      }),
      window.api.on(IPC.obsOutputs, (o) => setOutputs(o as ObsOutputs)),
      window.api.on(IPC.obsStats, (s) => setStats(s as ObsStats)),
      window.api.on(IPC.obsScenes, (s) => setScenes(s as ObsScenes)),
      window.api.on(IPC.obsAudio, (a) => setAudio(a as ObsAudioSource[])),
      window.api.on(IPC.obsAudioMeters, (m) => setAudioMeters(m as ObsAudioMeter[])),
      window.api.on(IPC.obsEvent, (e) => setLog((prev) => [e as ObsLogEntry, ...prev].slice(0, LOG_CAP)))
    ];
    return () => { alive = false; offs.forEach((off) => off()); };
  }, []);

  const value = React.useMemo<ObsContextValue>(
    () => ({ status, outputs, stats, scenes, audio, audioMeters, log, actions: obsActions }),
    [status, outputs, stats, scenes, audio, audioMeters, log]
  );
  return <ObsContext.Provider value={value}>{children}</ObsContext.Provider>;
}

export function useObs() {
  return React.useContext(ObsContext);
}
