// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { LogService } from './log-service';

describe('LogService', () => {
  it('stores entries newest-first and timestamps them', () => {
    const log = new LogService();
    log.add('OBS', 'evt', 'Scene changed');
    log.add('WS', 'ok', 'forwarded');
    const snap = log.snapshot();
    expect(snap[0].message).toBe('forwarded');
    expect(snap[1].message).toBe('Scene changed');
    expect(snap[0].t).toMatch(/^\d{2}:\d{2}:\d{2}\.\d{3}$/);
  });

  it('caps the buffer', () => {
    const log = new LogService(3);
    for (let i = 0; i < 5; i++) log.add('BOT', 'info', `m${i}`);
    expect(log.snapshot()).toHaveLength(3);
    expect(log.snapshot()[0].message).toBe('m4');
  });

  it('emits a line event for each entry', () => {
    const log = new LogService();
    const seen: string[] = [];
    log.on('line', (e: { message: string }) => seen.push(e.message));
    log.add('TWITCH', 'evt', 'cheer');
    expect(seen).toEqual(['cheer']);
  });

  it('scrubs registered secrets from log messages (API key never logged)', () => {
    const log = new LogService();
    log.registerSecret('super-secret-key');
    log.add('WS', 'info', 'connecting with code super-secret-key now');
    expect(log.snapshot()[0].message).toBe('connecting with code ***REDACTED*** now');
  });

  it('exports as plain text', () => {
    const log = new LogService();
    log.add('OBS', 'evt', 'hi');
    expect(log.export()).toMatch(/OBS\s+EVT\s+hi/);
  });
});
