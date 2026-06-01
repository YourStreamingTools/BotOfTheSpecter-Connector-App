import { describe, it, expect } from 'vitest';
import { normalizeAlert, ALERT_EVENTS } from './alert-events';

// receivedAt is Date.now()-stamped; assert the rest and that it's a finite number.
const norm = (event: string, data: Record<string, unknown>) => {
  const a = normalizeAlert(event, data);
  if (a) expect(typeof a.receivedAt).toBe('number');
  return a;
};

describe('ALERT_EVENTS', () => {
  it('lists the events the feed consumes', () => {
    for (const e of ['TWITCH_FOLLOW', 'TWITCH_CHEER', 'TWITCH_SUB', 'TWITCH_RAID', 'TWITCH_CHANNELPOINTS', 'FOURTHWALL', 'KOFI', 'PATREON', 'STREAM_ONLINE', 'STREAM_OFFLINE']) {
      expect(ALERT_EVENTS.has(e)).toBe(true);
    }
  });
  it('ignores non-alert events', () => {
    expect(normalizeAlert('CHAT_MESSAGE', {})).toBeNull();
    expect(normalizeAlert('OBS_EVENT', {})).toBeNull();
  });
});

describe('normalizeAlert — Twitch (hyphenated keys, string numbers)', () => {
  it('follow', () => {
    expect(norm('TWITCH_FOLLOW', { 'twitch-username': 'owl' })).toMatchObject({ kind: 'follow', platform: 'twitch', who: 'owl' });
  });
  it('cheer — coerces the string bits amount', () => {
    expect(norm('TWITCH_CHEER', { 'twitch-username': 'owl', 'twitch-cheer-amount': '500' }))
      .toMatchObject({ kind: 'cheer', who: 'owl', amount: 500, unit: 'bits' });
  });
  it('sub — new sub (1 month)', () => {
    expect(norm('TWITCH_SUB', { 'twitch-username': 'owl', 'twitch-tier': 'Tier 1', 'twitch-sub-months': '1' }))
      .toMatchObject({ kind: 'sub', who: 'owl', tier: 'Tier 1', amount: 1, unit: 'months' });
  });
  it('raid — coerces viewer count', () => {
    expect(norm('TWITCH_RAID', { 'twitch-username': 'owl', 'twitch-raid': '42' }))
      .toMatchObject({ kind: 'raid', who: 'owl', amount: 42, unit: 'viewers' });
  });
  it('channel points — parses the rewards JSON string', () => {
    const rewards = JSON.stringify({ user_name: 'owl', user_input: 'hi there', redeemed_at: '2026-06-01T00:00:00Z', reward: { title: 'Hydrate', cost: 100 } });
    const a = norm('TWITCH_CHANNELPOINTS', { rewards });
    expect(a).toMatchObject({ kind: 'redemption', who: 'owl', rewardTitle: 'Hydrate', message: 'hi there' });
    // redeemed_at is the only server timestamp — used for receivedAt.
    expect(a!.receivedAt).toBe(Date.parse('2026-06-01T00:00:00Z'));
  });
  it('channel points — tolerates malformed rewards JSON', () => {
    expect(norm('TWITCH_CHANNELPOINTS', { rewards: 'not json' })).toMatchObject({ kind: 'redemption' });
  });
});

describe('normalizeAlert — donations (data JSON string, per-platform shapes)', () => {
  it('Fourthwall donation (nested data.data, with message)', () => {
    const data = JSON.stringify({ type: 'DONATION', data: { username: 'gen', amounts: { total: { value: 5, currency: 'USD' } }, message: 'love it' } });
    expect(norm('FOURTHWALL', { data })).toMatchObject({ kind: 'donation', platform: 'fourthwall', who: 'gen', amount: 5, unit: 'USD', message: 'love it' });
  });
  it('Ko-fi donation (flat under data)', () => {
    const data = JSON.stringify({ type: 'Donation', from_name: 'gen', amount: '10.00', currency: 'AUD', message: 'cheers' });
    expect(norm('KOFI', { data })).toMatchObject({ kind: 'donation', platform: 'kofi', who: 'gen', amount: 10, unit: 'AUD', message: 'cheers' });
  });
  it('Patreon (JSON:API, cents → dollars)', () => {
    const data = JSON.stringify({ data: { type: 'member', attributes: { full_name: 'gen', patron_status: 'active_patron', currency_code: 'USD', currently_entitled_amount_cents: 500 } } });
    expect(norm('PATREON', { data })).toMatchObject({ kind: 'donation', platform: 'patreon', who: 'gen', amount: 5, unit: 'USD' });
  });
  it('tolerates malformed donation JSON (still a donation row)', () => {
    expect(norm('KOFI', { data: 'broken' })).toMatchObject({ kind: 'donation', platform: 'kofi' });
  });
});

describe('normalizeAlert — stream on/off', () => {
  it('online', () => {
    expect(norm('STREAM_ONLINE', {})).toMatchObject({ kind: 'stream', online: true });
  });
  it('offline', () => {
    expect(norm('STREAM_OFFLINE', {})).toMatchObject({ kind: 'stream', online: false });
  });
});
