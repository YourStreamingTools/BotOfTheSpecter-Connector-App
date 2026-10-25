// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { checkPublish, decideAuth, keysMatch, parsePublishQuery } from './camera-auth';

const KEY = 'k'.repeat(32);
const ctx = (over: Partial<Parameters<typeof decideAuth>[1]> = {}) => ({ localKey: KEY, lanView: true, existing: null, ...over });

describe('keysMatch', () => {
  it('needs an exact, non-empty match', () => {
    expect(keysMatch(KEY, KEY)).toBe(true);
    expect(keysMatch(KEY.slice(1), KEY)).toBe(false);
    expect(keysMatch('', '')).toBe(false);
  });
});

describe('parsePublishQuery', () => {
  it('reads key, device and name', () => {
    expect(parsePublishQuery('key=abc&device=d1&name=Desk%20Cam')).toEqual({ key: 'abc', device: 'd1', name: 'Desk Cam' });
    expect(parsePublishQuery(undefined)).toEqual({ key: '', device: '', name: '' });
  });
});

describe('checkPublish', () => {
  it('maps every refusal to the status the phone expects', () => {
    expect(checkPublish('Bad', KEY, 'd1', ctx())).toEqual({ ok: false, status: 400, error: 'invalid_cam' });
    expect(checkPublish('main', 'nope', 'd1', ctx())).toEqual({ ok: false, status: 401, error: 'bad_key' });
    expect(checkPublish('main', KEY, 'd2', ctx({ existing: { device: 'd1' } }))).toEqual({ ok: false, status: 409, error: 'in_use' });
    expect(checkPublish('main', KEY, '', ctx({ existing: { device: '' } }))).toEqual({ ok: false, status: 409, error: 'in_use' });
  });

  it('lets the same phone reconnect over its stale session', () => {
    expect(checkPublish('main', KEY, 'd1', ctx({ existing: { device: 'd1' } }))).toEqual({ ok: true });
    expect(checkPublish('main', KEY, 'd1', ctx())).toEqual({ ok: true });
  });
});

describe('decideAuth', () => {
  const publish = { action: 'publish', protocol: 'rtmp', path: 'camera/main', ip: '192.168.1.40', query: `key=${KEY}&device=d1` };

  it('allows a LAN phone with the right key over RTMP', () => {
    expect(decideAuth(publish, ctx())).toEqual({ allow: true });
  });

  it('refuses public IPs, other protocols, other paths and bad keys', () => {
    expect(decideAuth({ ...publish, ip: '8.8.8.8' }, ctx()).allow).toBe(false);
    expect(decideAuth({ ...publish, protocol: 'rtsp' }, ctx()).allow).toBe(false);
    expect(decideAuth({ ...publish, path: 'live/main' }, ctx()).allow).toBe(false);
    expect(decideAuth({ ...publish, query: 'key=wrong' }, ctx())).toEqual({ allow: false, reason: 'bad_key' });
  });

  it('takes SRT credentials from the stream ID user/pass', () => {
    const srt = { action: 'publish', protocol: 'srt', path: 'camera/main', ip: '192.168.1.41', user: 'd9', password: KEY, query: 'name=Pixel' };
    expect(decideAuth(srt, ctx())).toEqual({ allow: true });
    expect(decideAuth({ ...srt, password: 'wrong' }, ctx())).toEqual({ allow: false, reason: 'bad_key' });
    expect(decideAuth(srt, ctx({ existing: { device: 'd1' } }))).toEqual({ allow: false, reason: 'in_use' });
    expect(decideAuth(srt, ctx({ existing: { device: 'd9' } }))).toEqual({ allow: true });
  });

  it('allows WebRTC reads from this PC always and from the LAN only when enabled', () => {
    const read = { action: 'read', protocol: 'webrtc', path: 'camera/main' };
    expect(decideAuth({ ...read, ip: '127.0.0.1' }, ctx({ lanView: false })).allow).toBe(true);
    expect(decideAuth({ ...read, ip: '192.168.1.9' }, ctx({ lanView: true })).allow).toBe(true);
    expect(decideAuth({ ...read, ip: '192.168.1.9' }, ctx({ lanView: false })).allow).toBe(false);
    expect(decideAuth({ ...read, ip: '8.8.8.8' }, ctx()).allow).toBe(false);
    expect(decideAuth({ ...read, ip: '127.0.0.1', protocol: 'rtsp' }, ctx()).allow).toBe(false);
  });

  it('refuses other actions', () => {
    expect(decideAuth({ action: 'playback', ip: '127.0.0.1', path: 'camera/main' }, ctx()).allow).toBe(false);
  });
});
