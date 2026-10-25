// @vitest-environment node
// Real end-to-end run: bundled MediaMTX + ffmpeg as a fake phone. Skipped unless both are available:
//   SPECTER_MEDIAMTX_PATH=/path/to/mediamtx npx vitest run src/main/camera/camera-service.e2e.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { spawn, spawnSync, type ChildProcess } from 'child_process';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { CameraService, type CameraStore } from './camera-service';

const binary = process.env.SPECTER_MEDIAMTX_PATH;
const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;
const RTMP_PORT = 19350;
const WEB_PORT = 47890;

function memoryStore(init: Record<string, unknown>): CameraStore {
  const data: Record<string, unknown> = { ...init };
  return {
    get: (k) => data[k] as never,
    set: async (k, v) => { data[k] = v; }
  };
}

function publish(query: string): ChildProcess {
  return spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-re',
    '-f', 'lavfi', '-i', 'testsrc=size=1280x720:rate=30',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-g', '60',
    '-c:a', 'aac', '-t', '30', '-f', 'flv',
    `rtmp://127.0.0.1:${RTMP_PORT}/camera/main?${query}`
  ], { stdio: 'ignore' });
}

async function waitFor<T>(fn: () => T | Promise<T>, ms = 15000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 200));
  }
}

const children: ChildProcess[] = [];
let svc: CameraService | undefined;
afterAll(async () => {
  for (const c of children) c.kill('SIGKILL');
  await svc?.dispose();
});

describe.skipIf(!binary || !hasFfmpeg)('local camera route end to end', () => {
  it('pairs, refuses bad keys and second phones, lists the camera and serves its view', async () => {
    const store = memoryStore({ camera_enabled: false, camera_rtmp_port: RTMP_PORT, camera_web_port: WEB_PORT });
    svc = new CameraService({
      store,
      dataDir: mkdtempSync(join(tmpdir(), 'specter-mtx-')),
      binaryPath: binary!,
      addBrowserSource: async () => ({ sceneName: 'Scene' }),
      obsHost: () => '127.0.0.1',
      log: () => undefined,
      registerSecret: () => undefined,
      qrDataUrl: async () => 'data:image/png;base64,AA==',
      networkInterfaces: () => ({ eth0: [{ address: '192.168.50.10', family: 'IPv4', internal: false, netmask: '255.255.255.0', mac: '', cidr: null }] }),
      pollMs: 300
    });
    await svc.setEnabled(true);
    await waitFor(() => svc!.snapshot().state === 'running');
    const key = store.get('camera_local_key')!;
    expect(key.length).toBeGreaterThanOrEqual(16);
    expect(svc.snapshot().pairUri).toBe(`specter-cam://local?v=1&host=192.168.50.10&port=${RTMP_PORT}&web=${WEB_PORT}&key=${key}`);

    const check = (q: string) => fetch(`http://127.0.0.1:${WEB_PORT}/camera/check?${q}`).then((r) => r.status);
    expect(await check(`cam=main&key=wrong&device=d1`)).toBe(401);
    expect(await check(`cam=main&key=${key}&device=d1`)).toBe(200);

    // Wrong key: MediaMTX asks the Connector, which refuses, so ffmpeg exits with an error.
    const bad = publish('key=wrong&device=d1');
    children.push(bad);
    const badCode = await new Promise<number | null>((r) => bad.on('exit', (c) => r(c)));
    expect(badCode).not.toBe(0);

    children.push(publish(`key=${key}&device=d1&name=Desk%20Cam`));
    const cam = await waitFor(() => svc!.snapshot().cameras.find((c) => c.id === 'main' && c.video));
    expect(cam).toMatchObject({
      id: 'main', name: 'Desk Cam',
      video: { codec: 'H264', width: 1280, height: 720 },
      audio: { codec: 'MPEG-4 Audio' }, audioPlayable: false,
      viewUrl: `http://192.168.50.10:${WEB_PORT}/view/main`
    });

    expect(await check(`cam=main&key=${key}&device=d2`)).toBe(409);
    expect(await check(`cam=main&key=${key}&device=d1`)).toBe(200);

    const list = await fetch(`http://127.0.0.1:${WEB_PORT}/cameras`).then((r) => r.json() as Promise<{ cameras: unknown[] }>);
    expect(list.cameras).toEqual([{ id: 'main', name: 'Desk Cam', viewUrl: `http://192.168.50.10:${WEB_PORT}/view/main` }]);
    const view = await fetch(`http://127.0.0.1:${WEB_PORT}/view/main`);
    expect(view.status).toBe(200);

    // WHEP endpoint is up and reachable for the view page (an empty offer is a 400, not a connection error).
    const whep = await fetch('http://127.0.0.1:8889/camera/main/whep', { method: 'POST', headers: { 'Content-Type': 'application/sdp' }, body: '' });
    expect(whep.status).toBeGreaterThanOrEqual(400);
    expect(whep.status).toBeLessThan(500);

    expect(await svc.addToObs('main')).toEqual({ ok: true, sourceName: 'Specter Cam - main', sceneName: 'Scene' });
  }, 60000);
});
