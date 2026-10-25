// Local phone-camera route: Specter Camera app → RTMP or SRT on the LAN → bundled MediaMTX → /view/{id} for OBS.

/** Same slug rule as the cloud multi-camera paths (camera/<user>/<slug>). */
export const CAMERA_SLUG_RE = /^[a-z0-9_-]{1,32}$/;
export const DEFAULT_CAMERA_SLUG = 'main';

export const CAMERA_RTMP_PORT = 1935;
/** SRT ingest (UDP) for phones that can only send Opus over SRT (Android/RootEncoder). */
export const CAMERA_SRT_PORT = 8890;
export const CAMERA_WEB_PORT = 47830;
export const CAMERA_WEBRTC_PORT = 8889;
export const CAMERA_WEBRTC_UDP_PORT = 8189;
export const CAMERA_API_PORT = 9997;

/**
 * Path prefix phones publish into. RTMP: rtmp://<host>:<port>/camera/<slug>?key=<local key>&device=<id>&name=<name>.
 * SRT: srt://<host>:<srt> with streamid publish:camera/<slug>:<device id>:<local key>[:name=<name>].
 */
export const CAMERA_RTMP_APP = 'camera';
export const PAIR_URI_VERSION = 1;
export const LOCAL_KEY_MIN_LENGTH = 16;

export function isValidCameraSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && CAMERA_SLUG_RE.test(slug);
}

/** Lowercase, collapse anything outside [a-z0-9_-] to '-', trim dashes, cap at 32. Empty → 'main'. */
export function slugifyCameraName(name: string | undefined | null): string {
  const slug = String(name ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32)
    .replace(/-+$/g, '');
  return slug || DEFAULT_CAMERA_SLUG;
}

export function isValidPort(port: unknown): port is number {
  return typeof port === 'number' && Number.isInteger(port) && port >= 1 && port <= 65535;
}

export interface PairUriParams {
  host: string;
  rtmpPort: number;
  webPort: number;
  srtPort?: number;
  key: string;
  name?: string;
}

/** QR payload the phone scans: specter-cam://local?v=1&host=<ipv4>&port=<rtmp>&web=<http>&srt=<srt>&key=<local key>[&name=<slug>]. */
export function buildPairUri(p: PairUriParams): string {
  const q = new URLSearchParams({
    v: String(PAIR_URI_VERSION),
    host: p.host,
    port: String(p.rtmpPort),
    web: String(p.webPort),
    ...(p.srtPort ? { srt: String(p.srtPort) } : {}),
    key: p.key
  });
  if (p.name && isValidCameraSlug(p.name)) q.set('name', p.name);
  return `specter-cam://local?${q.toString()}`;
}

export function cameraViewUrl(host: string, webPort: number, slug: string): string {
  return `http://${host}:${webPort}/view/${slug}`;
}

export function cameraRtmpUrl(host: string, rtmpPort: number): string {
  return `rtmp://${host}:${rtmpPort}/${CAMERA_RTMP_APP}`;
}

export function cameraSrtUrl(host: string, srtPort: number): string {
  return `srt://${host}:${srtPort}`;
}

/** Path `camera/<slug>` → slug, or null for anything else. */
export function slugFromPath(path: string): string | null {
  const m = /^camera\/([a-z0-9_-]{1,32})$/.exec(path);
  return m ? m[1] : null;
}

const PRIVATE_V4 = [
  /^10\./,
  /^192\.168\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^169\.254\./
];

export function isLoopbackIp(ip: string): boolean {
  const v = ip.replace(/^::ffff:/, '');
  return v === '::1' || /^127\./.test(v);
}

/** Loopback or RFC1918 / link-local IPv4 (IPv4-mapped IPv6 included). Public addresses are never "local". */
export function isLocalNetworkIp(ip: string): boolean {
  if (isLoopbackIp(ip)) return true;
  const v = ip.replace(/^::ffff:/, '');
  if (PRIVATE_V4.some((re) => re.test(v))) return true;
  // IPv6 unique-local (fc00::/7) and link-local (fe80::/10).
  return /^f[cd][0-9a-f]{2}:/i.test(v) || /^fe[89ab][0-9a-f]:/i.test(v);
}

export type CameraCheckResult =
  | { ok: true }
  | { ok: false; status: 400 | 401 | 409 | 503; error: 'invalid_cam' | 'bad_key' | 'in_use' | 'not_running' };
