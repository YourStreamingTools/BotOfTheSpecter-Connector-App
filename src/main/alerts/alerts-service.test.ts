// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { AlertsService } from './alerts-service';

describe('AlertsService', () => {
  it('normalizes an alert event, buffers it, and emits it', () => {
    const svc = new AlertsService();
    const seen: Array<{ kind: string }> = [];
    svc.on('alert', (a: { kind: string }) => seen.push(a));
    svc.handleEvent('TWITCH_FOLLOW', { 'twitch-username': 'owl' });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind: 'follow', who: 'owl' });
    expect(svc.snapshot().alerts).toHaveLength(1);
  });

  it('ignores non-alert events (no emit, no buffer growth)', () => {
    const svc = new AlertsService();
    const seen: unknown[] = [];
    svc.on('alert', (a) => seen.push(a));
    svc.handleEvent('CHAT_MESSAGE', { message: 'hi' });
    expect(seen).toHaveLength(0);
    expect(svc.snapshot().alerts).toHaveLength(0);
  });

  it('keeps the snapshot newest-first', () => {
    const svc = new AlertsService();
    svc.handleEvent('TWITCH_FOLLOW', { 'twitch-username': 'first' });
    svc.handleEvent('TWITCH_FOLLOW', { 'twitch-username': 'second' });
    expect(svc.snapshot().alerts.map((a) => a.who)).toEqual(['second', 'first']);
  });

  it('caps the buffer at its limit, dropping the oldest', () => {
    const svc = new AlertsService(3);
    for (const who of ['a', 'b', 'c', 'd']) svc.handleEvent('TWITCH_FOLLOW', { 'twitch-username': who });
    const alerts = svc.snapshot().alerts;
    expect(alerts).toHaveLength(3);
    expect(alerts.map((a) => a.who)).toEqual(['d', 'c', 'b']); // 'a' evicted
  });

  it('returns a copied snapshot array (caller cannot mutate internal state)', () => {
    const svc = new AlertsService();
    svc.handleEvent('TWITCH_FOLLOW', { 'twitch-username': 'owl' });
    svc.snapshot().alerts.push({} as never);
    expect(svc.snapshot().alerts).toHaveLength(1);
  });
});
