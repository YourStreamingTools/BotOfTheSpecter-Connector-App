import { timingSafeEqual } from 'crypto';
import { isLocalNetworkIp, isLoopbackIp, isValidCameraSlug, slugFromPath, type CameraCheckResult } from '@shared/cameras';

/** Body MediaMTX POSTs to authHTTPAddress (v1.21). */
export interface MediamtxAuthRequest {
  ip?: string;
  user?: string;
  password?: string;
  token?: string;
  action?: string;
  path?: string;
  protocol?: string;
  id?: string | null;
  query?: string;
  userAgent?: string;
}

export interface LivePublisher {
  device: string;
}

export interface AuthContext {
  localKey: string;
  lanView: boolean;
  /** The publisher currently live on camera/<slug>, if any. */
  existing: LivePublisher | null;
}

export type AuthDecision = { allow: true } | { allow: false; reason: string };

export function keysMatch(given: string, expected: string): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function parsePublishQuery(query: string | undefined): { key: string; device: string; name: string } {
  const q = new URLSearchParams(query ?? '');
  return {
    key: q.get('key') ?? '',
    device: (q.get('device') ?? '').slice(0, 128),
    name: (q.get('name') ?? '').slice(0, 64)
  };
}

/**
 * Shared by the MediaMTX publish hook and the phone's GET /camera/check preflight so both
 * give the same answer. A second phone on a live slug is refused; the same device may reconnect.
 */
export function checkPublish(slug: string, key: string, device: string, ctx: AuthContext): CameraCheckResult {
  if (!isValidCameraSlug(slug)) return { ok: false, status: 400, error: 'invalid_cam' };
  if (!keysMatch(key, ctx.localKey)) return { ok: false, status: 401, error: 'bad_key' };
  if (ctx.existing && (!device || ctx.existing.device !== device)) {
    return { ok: false, status: 409, error: 'in_use' };
  }
  return { ok: true };
}

export function decideAuth(req: MediamtxAuthRequest, ctx: AuthContext): AuthDecision {
  const ip = req.ip ?? '';
  const slug = slugFromPath(req.path ?? '');
  if (req.action === 'publish') {
    if (!isLocalNetworkIp(ip)) return { allow: false, reason: 'publisher is not on the local network' };
    if (req.protocol !== 'rtmp') return { allow: false, reason: 'only RTMP publishing is enabled' };
    if (!slug) return { allow: false, reason: 'invalid camera path' };
    const q = parsePublishQuery(req.query);
    const res = checkPublish(slug, q.key, q.device, ctx);
    return res.ok ? { allow: true } : { allow: false, reason: res.error };
  }
  if (req.action === 'read') {
    if (req.protocol !== 'webrtc') return { allow: false, reason: 'only WebRTC playback is enabled' };
    if (!slug) return { allow: false, reason: 'invalid camera path' };
    if (isLoopbackIp(ip)) return { allow: true };
    if (ctx.lanView && isLocalNetworkIp(ip)) return { allow: true };
    return { allow: false, reason: 'viewer is not allowed' };
  }
  return { allow: false, reason: `action ${String(req.action)} is not allowed` };
}
