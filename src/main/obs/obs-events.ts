import type { ObsLogEntry } from '@shared/ipc';

type Data = Record<string, unknown>;

/** Map an obs-websocket event to a human log line. Mirrors the legacy on_event switch. */
export function normalizeObsEvent(type: string, data: Data): Omit<ObsLogEntry, 't'> {
  const message = describe(type, data);
  return { type, message, direction: 'in' };
}

function describe(type: string, d: Data): string {
  switch (type) {
    case 'CurrentProgramSceneChanged':
      return `Scene changed → ${d.sceneName ?? 'Unknown'}`;
    case 'CurrentPreviewSceneChanged':
      return `Preview scene → ${d.sceneName ?? 'Unknown'}`;
    case 'SceneItemEnableStateChanged':
      return `Source #${d.sceneItemId ?? '?'} in ${d.sceneName ?? 'Unknown'} ${d.sceneItemEnabled ? 'shown' : 'hidden'}`;
    case 'SceneCreated':
      return `Scene created: ${d.sceneName ?? 'Unknown'}`;
    case 'SceneRemoved':
      return `Scene removed: ${d.sceneName ?? 'Unknown'}`;
    case 'StreamStateChanged':
      return d.outputActive ? 'Streaming started' : 'Streaming stopped';
    case 'RecordStateChanged':
      return d.outputActive ? 'Recording started' : 'Recording stopped';
    case 'ReplayBufferStateChanged':
      return d.outputActive ? 'Replay buffer started' : 'Replay buffer stopped';
    case 'VirtualcamStateChanged':
      return d.outputActive ? 'Virtual camera on' : 'Virtual camera off';
    case 'InputMuteStateChanged':
      return `${d.inputName ?? 'Input'} ${d.inputMuted ? 'muted' : 'unmuted'}`;
    default:
      return type;
  }
}
