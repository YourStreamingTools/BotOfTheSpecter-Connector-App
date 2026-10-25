// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { buildCameraList, type MtxPath } from './camera-list';

const path = (over: Partial<MtxPath> = {}): MtxPath => ({
  name: 'camera/main',
  online: true,
  onlineTime: '2026-10-25T10:00:00Z',
  source: { id: 'c1', type: 'rtmpConn' },
  inboundBytes: 2_000_000,
  readers: [{}],
  tracks2: [
    { codec: 'H264', codecProps: { width: 1280, height: 720 } },
    { codec: 'MPEG-4 Audio', codecProps: null }
  ],
  ...over
});

describe('buildCameraList', () => {
  it('turns online camera paths into camera rows', () => {
    const prev = new Map([['main', { bytes: 1_000_000, at: 1000 }]]);
    const list = buildCameraList(
      [path(), path({ name: 'live/other' }), path({ name: 'camera/off', online: false })],
      [{ id: 'c1', query: 'key=secret&device=d1&name=Desk%20Cam', remoteAddr: '192.168.1.40:51234' }],
      { host: '192.168.1.20', webPort: 47830, prevBytes: prev, now: 3000 }
    );
    expect(list).toHaveLength(1);
    expect(list[0].device).toBe('d1');
    expect(list[0].connId).toBe('c1');
    expect(list[0].info).toMatchObject({
      id: 'main',
      name: 'Desk Cam',
      remoteAddr: '192.168.1.40',
      video: { codec: 'H264', width: 1280, height: 720 },
      audio: { codec: 'MPEG-4 Audio' },
      audioPlayable: false,
      bitrateKbps: 4000,
      viewers: 1,
      viewUrl: 'http://192.168.1.20:47830/view/main',
      localViewUrl: 'http://127.0.0.1:47830/view/main'
    });
    expect(JSON.stringify(list[0].info)).not.toContain('secret');
  });

  it('marks Opus audio as playable and copes with a missing LAN host', () => {
    const [cam] = buildCameraList(
      [path({ tracks2: [{ codec: 'H264' }, { codec: 'Opus' }] })], [],
      { host: null, webPort: 47830, prevBytes: new Map(), now: 0 }
    );
    expect(cam.info.audioPlayable).toBe(true);
    expect(cam.info.name).toBe('main');
    expect(cam.info.viewUrl).toBeNull();
    expect(cam.info.bitrateKbps).toBeNull();
  });
});
