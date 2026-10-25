// @vitest-environment node
import { describe, it, expect, afterEach, vi } from 'vitest';
import { startCameraServer, type CameraServer, type CameraServerHandlers } from './camera-server';

let server: CameraServer | undefined;
afterEach(async () => { await server?.close(); server = undefined; });

function handlers(over: Partial<CameraServerHandlers> = {}): CameraServerHandlers {
  return {
    check: vi.fn().mockResolvedValue({ ok: true }),
    auth: vi.fn().mockResolvedValue({ allow: true }),
    list: () => [{ id: 'main', name: 'Desk', viewUrl: 'http://192.168.1.20:47830/view/main' }],
    webrtcPort: () => 8889,
    lanView: () => true,
    ...over
  };
}

const base = () => `http://127.0.0.1:${server!.port}`;

describe('camera web server', () => {
  it('serves the view page for a valid camera id only', async () => {
    server = await startCameraServer(0, handlers(), '127.0.0.1');
    const ok = await fetch(`${base()}/view/main`);
    expect(ok.status).toBe(200);
    const html = await ok.text();
    expect(html).toContain('"slug":"main"');
    expect(html).toContain('"webrtcPort":8889');
    expect(html).toContain('/whep');
    expect((await fetch(`${base()}/view/Bad%20Id`)).status).toBe(404);
    expect((await fetch(`${base()}/view/%3Cscript%3E`)).status).toBe(404);
  });

  it('lists cameras as JSON', async () => {
    server = await startCameraServer(0, handlers(), '127.0.0.1');
    const res = await fetch(`${base()}/cameras`);
    expect(await res.json()).toEqual({ cameras: [{ id: 'main', name: 'Desk', viewUrl: 'http://192.168.1.20:47830/view/main' }] });
  });

  it('answers the phone preflight with the check result status', async () => {
    const check = vi.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, status: 401, error: 'bad_key' })
      .mockResolvedValueOnce({ ok: false, status: 409, error: 'in_use' });
    server = await startCameraServer(0, handlers({ check }), '127.0.0.1');
    const ok = await fetch(`${base()}/camera/check?cam=main&key=k&device=d1`);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true });
    expect(check).toHaveBeenCalledWith('main', 'k', 'd1');
    const bad = await fetch(`${base()}/camera/check?cam=main&key=x`);
    expect(bad.status).toBe(401);
    expect(await bad.json()).toEqual({ error: 'bad_key' });
    expect((await fetch(`${base()}/camera/check?cam=main&key=k&device=d2`)).status).toBe(409);
  });

  it('relays MediaMTX auth decisions as 200 / 401', async () => {
    const auth = vi.fn()
      .mockResolvedValueOnce({ allow: true })
      .mockResolvedValueOnce({ allow: false, reason: 'bad_key' });
    server = await startCameraServer(0, handlers({ auth }), '127.0.0.1');
    const body = JSON.stringify({ action: 'publish', path: 'camera/main', ip: '192.168.1.4', protocol: 'rtmp', query: 'key=k' });
    const post = () => fetch(`${base()}/internal/mediamtx/auth`, { method: 'POST', body, headers: { 'Content-Type': 'application/json' } });
    expect((await post()).status).toBe(200);
    expect(auth).toHaveBeenCalledWith(expect.objectContaining({ action: 'publish', path: 'camera/main' }));
    expect((await post()).status).toBe(401);
  });

  it('rejects other methods', async () => {
    server = await startCameraServer(0, handlers(), '127.0.0.1');
    expect((await fetch(`${base()}/view/main`, { method: 'POST' })).status).toBe(405);
    expect((await fetch(`${base()}/nope`)).status).toBe(404);
  });
});
