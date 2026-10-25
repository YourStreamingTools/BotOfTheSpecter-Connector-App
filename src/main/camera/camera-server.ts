import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http';
import { isLocalNetworkIp, isLoopbackIp, isValidCameraSlug, type CameraCheckResult } from '@shared/cameras';
import type { AuthDecision, MediamtxAuthRequest } from './camera-auth';
import { renderViewPage } from './view-page';

export interface PublicCamera {
  id: string;
  name: string;
  viewUrl: string;
}

export interface CameraServerHandlers {
  check(slug: string, key: string, device: string): Promise<CameraCheckResult>;
  auth(req: MediamtxAuthRequest): Promise<AuthDecision>;
  list(): PublicCamera[];
  webrtcPort(): number;
  /** When false only this PC may load /view and /cameras; the phone preflight stays reachable on the LAN. */
  lanView(): boolean;
}

export interface CameraServer {
  port: number;
  close(): Promise<void>;
}

const MAX_AUTH_BODY = 16 * 1024;

/**
 * The Connector's camera web server. Bound on all interfaces so phones can reach /camera/check
 * and other PCs can load /view/{id}; public (non-LAN) addresses are always refused.
 */
export function startCameraServer(port: number, h: CameraServerHandlers, host = '0.0.0.0'): Promise<CameraServer> {
  const server = createServer((req, res) => {
    handle(req, res, h).catch(() => {
      if (!res.headersSent) send(res, 500, { error: 'internal' });
      else res.end();
    });
  });
  return new Promise((resolve, reject) => {
    const onErr = (err: Error) => { server.off('listening', onListen); reject(err); };
    const onListen = () => {
      server.off('error', onErr);
      const addr = server.address();
      resolve({ port: typeof addr === 'object' && addr ? addr.port : port, close: () => closeServer(server) });
    };
    server.once('error', onErr);
    server.once('listening', onListen);
    server.listen(port, host);
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve) => {
    server.close(() => resolve());
    server.closeAllConnections?.();
  });
}

async function handle(req: IncomingMessage, res: ServerResponse, h: CameraServerHandlers): Promise<void> {
  const remote = req.socket.remoteAddress ?? '';
  if (!isLocalNetworkIp(remote)) {
    send(res, 403, { error: 'forbidden' });
    return;
  }
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname;

  if (req.method === 'POST' && path === '/internal/mediamtx/auth') {
    if (!isLoopbackIp(remote)) {
      send(res, 403, { error: 'forbidden' });
      return;
    }
    const body = await readJson(req);
    const decision = await h.auth((body ?? {}) as MediamtxAuthRequest);
    if (decision.allow) send(res, 200, { ok: true });
    else send(res, 401, { error: decision.reason });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    send(res, 405, { error: 'method_not_allowed' });
    return;
  }

  if (path === '/camera/check') {
    const cam = url.searchParams.get('cam') ?? '';
    const result = await h.check(cam, url.searchParams.get('key') ?? '', url.searchParams.get('device') ?? '');
    if (result.ok) send(res, 200, { ok: true });
    else send(res, result.status, { error: result.error });
    return;
  }

  const viewerAllowed = isLoopbackIp(remote) || h.lanView();
  if (!viewerAllowed) {
    send(res, 403, { error: 'lan_view_disabled' });
    return;
  }

  const view = /^\/view\/([^/]+)\/?$/.exec(path);
  if (view) {
    const slug = decodeURIComponent(view[1]);
    if (!isValidCameraSlug(slug)) {
      send(res, 404, { error: 'not_found' });
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(renderViewPage(slug, h.webrtcPort()));
    return;
  }

  if (path === '/cameras' || path === '/') {
    send(res, 200, { cameras: h.list() });
    return;
  }

  send(res, 404, { error: 'not_found' });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readJson(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_AUTH_BODY) {
        req.destroy();
        resolve(null);
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf-8'))); } catch { resolve(null); }
    });
    req.on('error', () => resolve(null));
  });
}
