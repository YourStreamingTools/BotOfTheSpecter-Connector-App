// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildMediamtxConfig } from './mediamtx-config';

describe('buildMediamtxConfig', () => {
  it('enables only RTMP ingest, WebRTC playback and the loopback API, with auth on the Connector', () => {
    const yml = buildMediamtxConfig({ rtmpPort: 1935, webPort: 47830, lanView: true });
    expect(yml).toContain('authMethod: http');
    expect(yml).toContain('authHTTPAddress: http://127.0.0.1:47830/internal/mediamtx/auth');
    expect(yml).toContain('rtmpAddress: :1935');
    expect(yml).toContain('apiAddress: 127.0.0.1:9997');
    expect(yml).toContain('webrtcAddress: :8889');
    for (const off of ['rtsp: false', 'hls: false', 'srt: false', 'moq: false', 'record: false']) expect(yml).toContain(off);
    expect(yml).toContain('"~^camera/[a-z0-9_-]{1,32}$":');
  });

  it('binds WebRTC to loopback when LAN viewing is off', () => {
    const yml = buildMediamtxConfig({ rtmpPort: 2000, webPort: 3000, lanView: false });
    expect(yml).toContain('webrtcAddress: 127.0.0.1:8889');
    expect(yml).toContain('webrtcLocalUDPAddress: 127.0.0.1:8189');
    expect(yml).toContain('webrtcIPsFromInterfaces: false');
    expect(yml).toContain('webrtcAdditionalHosts: [127.0.0.1]');
    expect(yml).toContain('rtmpAddress: :2000');
  });
});
