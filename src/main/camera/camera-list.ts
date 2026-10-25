import type { CameraInfo } from '@shared/ipc';
import { cameraViewUrl, slugFromPath } from '@shared/cameras';
import { parsePublishQuery } from './camera-auth';

/** Subset of MediaMTX v1.21 GET /v3/paths/list items we read. */
export interface MtxPath {
  name: string;
  online?: boolean;
  ready?: boolean;
  onlineTime?: string | null;
  readyTime?: string | null;
  source?: { id?: string; type?: string } | null;
  inboundBytes?: number;
  bytesReceived?: number;
  readers?: unknown[];
  tracks2?: Array<{ codec?: string; codecProps?: { width?: number; height?: number } | null }>;
  tracks?: string[];
}

/** Subset of GET /v3/rtmp/conns/list and /v3/srt/conns/list items (same fields). */
export interface MtxConn {
  id: string;
  path?: string;
  query?: string;
  remoteAddr?: string;
  state?: string;
  /** SRT stream ID user = device id. */
  user?: string;
}

export interface LiveCamera {
  info: CameraInfo;
  /** Publisher connection id + kind, used to kick it. */
  connId: string | null;
  connKind: 'rtmp' | 'srt' | null;
  device: string;
  bytes: number;
}

const VIDEO_CODECS = new Set(['AV1', 'VP9', 'VP8', 'H265', 'H264', 'MPEG-4 Video', 'MPEG-1/2 Video', 'M-JPEG']);
const WEBRTC_AUDIO = new Set(['Opus', 'G722', 'G711']);

export function buildCameraList(
  paths: MtxPath[],
  conns: MtxConn[],
  opts: { host: string | null; webPort: number; prevBytes: Map<string, { bytes: number; at: number }>; now: number }
): LiveCamera[] {
  const byId = new Map(conns.map((c) => [c.id, c]));
  const out: LiveCamera[] = [];
  for (const p of paths) {
    const id = slugFromPath(p.name);
    if (!id) continue;
    if (!(p.online ?? p.ready) || !p.source) continue;
    const conn = p.source.id ? byId.get(p.source.id) : undefined;
    const connKind = p.source.type === 'srtConn' ? 'srt' : p.source.type === 'rtmpConn' ? 'rtmp' : null;
    const q = parsePublishQuery(conn?.query);
    const tracks = p.tracks2 ?? (p.tracks ?? []).map((codec) => ({ codec, codecProps: null }));
    const v = tracks.find((t) => t.codec && VIDEO_CODECS.has(t.codec));
    const a = tracks.find((t) => t.codec && !VIDEO_CODECS.has(t.codec));
    const bytes = p.inboundBytes ?? p.bytesReceived ?? 0;
    const prev = opts.prevBytes.get(id);
    const bitrateKbps = prev && opts.now > prev.at && bytes >= prev.bytes
      ? Math.round(((bytes - prev.bytes) * 8) / (opts.now - prev.at))
      : null;
    out.push({
      connId: conn?.id ?? null,
      connKind,
      device: q.device || conn?.user || '',
      bytes,
      info: {
        id,
        name: q.name.trim() || id,
        remoteAddr: conn?.remoteAddr ? conn.remoteAddr.replace(/:\d+$/, '') : null,
        since: p.onlineTime ?? p.readyTime ?? null,
        video: v ? { codec: v.codec ?? '', width: v.codecProps?.width ?? null, height: v.codecProps?.height ?? null } : null,
        audio: a ? { codec: a.codec ?? '' } : null,
        audioPlayable: !!a?.codec && WEBRTC_AUDIO.has(a.codec),
        bitrateKbps,
        viewers: Array.isArray(p.readers) ? p.readers.length : 0,
        viewUrl: opts.host ? cameraViewUrl(opts.host, opts.webPort, id) : null,
        localViewUrl: cameraViewUrl('127.0.0.1', opts.webPort, id)
      }
    });
  }
  return out.sort((x, y) => x.info.id.localeCompare(y.info.id));
}
