import type { ObsSourceType } from '@shared/ipc';

/** Best-effort source-type from an obs-websocket inputKind string. */
export function classifySource(inputKind?: string): ObsSourceType {
  const k = (inputKind ?? '').toLowerCase();
  if (!k) return 'other';
  if (k.includes('browser')) return 'browser';
  if (k.includes('image')) return 'image';
  if (k.includes('audio') || k.includes('wasapi') || k.includes('coreaudio') || k.includes('pulse') || k.includes('alsa')) {
    return 'audio';
  }
  if (k.includes('capture') || k.includes('dshow') || k.includes('v4l2') || k.includes('av_capture') ||
      k.includes('monitor') || k.includes('window') || k.includes('game') || k.includes('camera')) {
    return 'video';
  }
  return 'other';
}
