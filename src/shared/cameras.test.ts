import { describe, it, expect } from 'vitest';
import {
  buildPairUri, cameraViewUrl, isLocalNetworkIp, isLoopbackIp, isValidCameraSlug, slugFromPath, slugifyCameraName
} from './cameras';

describe('camera slugs', () => {
  it('matches the cloud rule', () => {
    expect(isValidCameraSlug('main')).toBe(true);
    expect(isValidCameraSlug('desk_cam-2')).toBe(true);
    expect(isValidCameraSlug('Desk')).toBe(false);
    expect(isValidCameraSlug('a'.repeat(33))).toBe(false);
    expect(isValidCameraSlug('')).toBe(false);
    expect(isValidCameraSlug('../x')).toBe(false);
  });

  it('slugifies names and falls back to main', () => {
    expect(slugifyCameraName('Moto G Pure')).toBe('moto-g-pure');
    expect(slugifyCameraName('  ')).toBe('main');
    expect(slugifyCameraName(undefined)).toBe('main');
    expect(slugifyCameraName('x'.repeat(40))).toHaveLength(32);
  });

  it('reads the slug from a MediaMTX path', () => {
    expect(slugFromPath('camera/main')).toBe('main');
    expect(slugFromPath('camera/a/b')).toBeNull();
    expect(slugFromPath('live/main')).toBeNull();
  });
});

describe('pairing URI', () => {
  it('carries host, ports and key, plus an optional valid name', () => {
    const uri = buildPairUri({ host: '192.168.1.20', rtmpPort: 1935, webPort: 47830, key: 'abc_DEF-123', name: 'desk' });
    expect(uri).toBe('specter-cam://local?v=1&host=192.168.1.20&port=1935&web=47830&key=abc_DEF-123&name=desk');
    expect(buildPairUri({ host: '10.0.0.2', rtmpPort: 1, webPort: 2, key: 'k', name: 'Bad Name' })).not.toContain('name=');
    expect(buildPairUri({ host: '10.0.0.2', rtmpPort: 1935, webPort: 47830, srtPort: 8890, key: 'k' }))
      .toBe('specter-cam://local?v=1&host=10.0.0.2&port=1935&web=47830&srt=8890&key=k');
  });

  it('builds view URLs', () => {
    expect(cameraViewUrl('192.168.1.20', 47830, 'main')).toBe('http://192.168.1.20:47830/view/main');
  });
});

describe('network ranges', () => {
  it('treats loopback and private ranges as local and public as not', () => {
    expect(isLoopbackIp('127.0.0.1')).toBe(true);
    expect(isLoopbackIp('::ffff:127.0.0.1')).toBe(true);
    expect(isLoopbackIp('::1')).toBe(true);
    for (const ip of ['192.168.0.5', '10.1.2.3', '172.16.0.1', '172.31.255.1', '::ffff:192.168.1.9', 'fe80::1', 'fd12:3456::1']) {
      expect(isLocalNetworkIp(ip)).toBe(true);
    }
    for (const ip of ['8.8.8.8', '172.32.0.1', '::ffff:1.1.1.1', '2001:db8::1']) {
      expect(isLocalNetworkIp(ip)).toBe(false);
    }
  });
});
