// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { CameraService, type CameraStore } from './camera-service';
import type { FirewallOptions } from './firewall';

function memoryStore(init: Record<string, unknown>): { store: CameraStore; data: Record<string, unknown> } {
  const data: Record<string, unknown> = { ...init };
  return { data, store: { get: (k) => data[k] as never, set: async (k, v) => { data[k] = v; } } };
}

function service(platform: NodeJS.Platform, init: Record<string, unknown>, seen: FirewallOptions[]) {
  const { store, data } = memoryStore(init);
  const svc = new CameraService({
    store,
    dataDir: '/tmp/unused',
    binaryPath: null,
    addBrowserSource: async () => ({ sceneName: 'Scene' }),
    obsHost: () => '127.0.0.1',
    log: () => {},
    registerSecret: () => {},
    qrDataUrl: async () => '',
    firewallTargets: [{ label: 'app', path: '/opt/app' }],
    platform,
    checkFirewall: async (_p, opts) => { seen.push(opts); return { state: 'ok' }; },
    allowFirewall: async (_p, opts) => { seen.push(opts); }
  });
  return { svc, data };
}

describe('CameraService firewall options', () => {
  it('passes the camera ports, including custom RTMP/web ports', async () => {
    const seen: FirewallOptions[] = [];
    const { svc } = service('win32', { camera_rtmp_port: 1936, camera_web_port: 47831 }, seen);
    await svc.refreshFirewall();
    expect(seen[0].ports).toEqual({ tcp: [1936, 47831, 8889], udp: [8189, 8890] });
    expect(seen[0].targets).toEqual([{ label: 'app', path: '/opt/app' }]);
  });

  it('remembers the opened ports on Linux only', async () => {
    const seen: FirewallOptions[] = [];
    const linux = service('linux', {}, seen);
    await linux.svc.allowFirewall();
    expect(linux.data.camera_fw_applied).toBe('1935/tcp,47830/tcp,8189/udp,8889/tcp,8890/udp');
    // The re-check after the fix sees what was stored.
    expect(seen.at(-1)?.linuxApplied).toBe('1935/tcp,47830/tcp,8189/udp,8889/tcp,8890/udp');

    const mac = service('darwin', {}, []);
    await mac.svc.allowFirewall();
    expect(mac.data.camera_fw_applied).toBeUndefined();
  });
});
