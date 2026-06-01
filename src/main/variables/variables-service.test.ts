// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigStore } from '../config-store';
import { VariablesService } from './variables-service';

let dir: string;
const store = () => {
  dir = mkdtempSync(join(tmpdir(), 'bots-vars-'));
  return new ConfigStore(join(dir, 'config.json'));
};
afterEach(() => { if (dir && existsSync(dir)) rmSync(dir, { recursive: true, force: true }); });

describe('VariablesService', () => {
  it('maps a follow event into last_follower + session/total counters', () => {
    const vs = new VariablesService(store());
    vs.handleEvent('TWITCH_FOLLOW', { username: 'starlight_owl' });
    const snap = vs.all();
    expect(snap.values.last_follower).toBe('starlight_owl');
    expect(snap.counters.session_followers).toBe(1);
    expect(snap.counters.total_followers).toBe(1);
  });

  it('accumulates bits as integers', () => {
    const vs = new VariablesService(store());
    vs.handleEvent('TWITCH_CHEER', { username: 'a', bits: '500' });
    vs.handleEvent('TWITCH_CHEER', { username: 'b', bits: 100 });
    expect(vs.all().counters.session_bits).toBe(600);
    expect(vs.all().values.last_cheer_amount).toBe(100);
  });

  // The real relay wire shapes (verified in beta.py / notify_event.php): hyphenated
  // keys, string-encoded numbers, redemptions as a `rewards` JSON string, donations
  // as a `data` JSON string. These previously silently no-op'd.
  describe('real relay wire shapes', () => {
    it('reads the hyphenated follow key', () => {
      const vs = new VariablesService(store());
      vs.handleEvent('TWITCH_FOLLOW', { 'twitch-username': 'owl' });
      expect(vs.all().values.last_follower).toBe('owl');
      expect(vs.all().counters.session_followers).toBe(1);
    });
    it('reads cheer bits from twitch-cheer-amount (string)', () => {
      const vs = new VariablesService(store());
      vs.handleEvent('TWITCH_CHEER', { 'twitch-username': 'owl', 'twitch-cheer-amount': '250' });
      expect(vs.all().values.last_cheer_amount).toBe(250);
      expect(vs.all().counters.session_bits).toBe(250);
    });
    it('reads sub tier/months from hyphenated keys', () => {
      const vs = new VariablesService(store());
      vs.handleEvent('TWITCH_SUB', { 'twitch-username': 'owl', 'twitch-tier': 'Tier 2', 'twitch-sub-months': '6' });
      expect(vs.all().values.last_subscriber).toBe('owl');
      expect(vs.all().values.last_sub_tier).toBe('Tier 2');
      expect(vs.all().values.last_sub_months).toBe(6);
    });
    it('reads raid viewers from twitch-raid (string)', () => {
      const vs = new VariablesService(store());
      vs.handleEvent('TWITCH_RAID', { 'twitch-username': 'owl', 'twitch-raid': '42' });
      expect(vs.all().values.last_raider).toBe('owl');
      expect(vs.all().values.raid_viewer_count).toBe(42);
    });
    it('parses the channel-points rewards JSON string', () => {
      const rewards = JSON.stringify({ user_name: 'owl', user_input: 'hi', reward: { title: 'Hydrate', cost: 100 } });
      const vs = new VariablesService(store());
      vs.handleEvent('TWITCH_CHANNELPOINTS', { rewards });
      expect(vs.all().values.last_redemption_user).toBe('owl');
      expect(vs.all().values.last_redemption_title).toBe('Hydrate');
      expect(vs.all().values.last_redemption_cost).toBe(100);
      expect(vs.all().counters.session_redemptions).toBe(1);
    });
    it('parses a Ko-fi donation from the data JSON string', () => {
      const data = JSON.stringify({ type: 'Donation', from_name: 'gen', amount: '10.00', currency: 'AUD' });
      const vs = new VariablesService(store());
      vs.handleEvent('KOFI', { data });
      expect(vs.all().values.last_donor).toBe('gen');
      expect(vs.all().values.last_donation_amount).toBe(10);
      expect(vs.all().values.session_donations).toBe(10);
    });
  });

  it('resets session counters on STREAM_ONLINE but keeps totals', () => {
    const vs = new VariablesService(store());
    vs.handleEvent('TWITCH_SUB', { username: 'x' });
    vs.handleEvent('STREAM_ONLINE', {});
    expect(vs.all().counters.session_subs).toBe(0);
    expect(vs.all().counters.total_subs).toBe(1);
    expect(vs.all().values.stream_status).toBe('online');
  });

  it('persists to the store and reloads', () => {
    const s = store();
    const vs = new VariablesService(s);
    vs.handleEvent('DEATHS', { game: 'Silksong' });
    const vs2 = new VariablesService(s);
    expect(vs2.all().counters.deaths_Silksong).toBe(1);
    expect(vs2.all().counters.session_deaths).toBe(1);
  });

  it('resetSession() zeroes session counters manually but keeps totals', () => {
    const vs = new VariablesService(store());
    vs.handleEvent('TWITCH_FOLLOW', { username: 'a' });
    vs.handleEvent('TWITCH_SUB', { username: 'b' });
    vs.resetSession();
    expect(vs.all().counters.session_followers).toBe(0);
    expect(vs.all().counters.session_subs).toBe(0);
    expect(vs.all().counters.total_followers).toBe(1);
    expect(vs.all().counters.total_subs).toBe(1);
  });

  it('exposes display defaults for unset values', () => {
    const vs = new VariablesService(store());
    expect(vs.all().values.last_follower).toBe('—');
  });

  it('redacts secrets from the stored payload (never exposes the API key)', () => {
    const vs = new VariablesService(store());
    vs.handleEvent('TWITCH_FOLLOW', { username: 'owl', code: 'super-secret-key' });
    const payload = String(vs.all().values.last_specter_payload);
    expect(payload).not.toContain('super-secret-key');
    expect(payload).toContain('***REDACTED***');
    expect(payload).toContain('owl');
  });

  it('re-redacts a payload persisted by an older build on load', () => {
    const s = store();
    const vs = new VariablesService(s);
    vs.set('last_specter_payload', JSON.stringify({ code: 'leaked-key-123', user: 'owl' }));
    const payload = String(new VariablesService(s).all().values.last_specter_payload);
    expect(payload).not.toContain('leaked-key-123');
    expect(payload).toContain('***REDACTED***');
  });

  it('stores an over-long specter payload as valid JSON that survives a reload (not dropped to —)', () => {
    const s = store();
    const vs = new VariablesService(s);
    vs.handleEvent('CUSTOM', { note: 'x'.repeat(1000) });
    const stored = String(vs.all().values.last_specter_payload);
    expect(() => JSON.parse(stored)).not.toThrow();
    // Reload: sanitizeStoredPayload re-parses; a truncated (invalid-JSON) string would be dropped to '—'.
    expect(String(new VariablesService(s).all().values.last_specter_payload)).not.toBe('—');
  });

  it('resets session counters when reconcile flips the stream offline → online', () => {
    const vs = new VariablesService(store());
    vs.handleEvent('STREAM_OFFLINE', {});
    vs.handleEvent('TWITCH_FOLLOW', { username: 'a' });
    expect(vs.all().counters.session_followers).toBe(1);
    vs.reconcileStreamStatus(true);
    expect(vs.all().values.stream_status).toBe('online');
    expect(vs.all().counters.session_followers).toBe(0);
  });

  it('emits a changed event', () => {
    const vs = new VariablesService(store());
    const seen: string[] = [];
    vs.on('changed', (c: { name: string }) => seen.push(c.name));
    vs.set('foo', 'bar');
    expect(seen).toContain('foo');
  });

  describe('reconcileStreamStatus (Twitch is the source of truth)', () => {
    it('flips a stale "online" to "offline" when Twitch reports the stream offline', () => {
      // The classic stale case: bot fired STREAM_ONLINE, app missed STREAM_OFFLINE.
      const vs = new VariablesService(store());
      vs.handleEvent('STREAM_ONLINE', {});
      expect(vs.all().values.stream_status).toBe('online');
      vs.reconcileStreamStatus(false);
      expect(vs.all().values.stream_status).toBe('offline');
    });

    it('flips "offline" to "online" when Twitch reports the stream online', () => {
      const vs = new VariablesService(store());
      vs.handleEvent('STREAM_OFFLINE', {});
      vs.reconcileStreamStatus(true);
      expect(vs.all().values.stream_status).toBe('online');
    });

    it('sets stream_status from an unset initial state', () => {
      const vs = new VariablesService(store());
      expect(vs.all().values.stream_status).toBeUndefined();
      vs.reconcileStreamStatus(false);
      expect(vs.all().values.stream_status).toBe('offline');
    });

    it('is a no-op (no changed event, no persist churn) when the status already matches', () => {
      const vs = new VariablesService(store());
      vs.handleEvent('STREAM_ONLINE', {});
      const seen: string[] = [];
      vs.on('changed', (c: { name: string }) => seen.push(c.name));
      vs.reconcileStreamStatus(true); // already 'online'
      expect(seen).not.toContain('stream_status');
    });

    it('persists the reconciled status across a reload', () => {
      const s = store();
      const vs = new VariablesService(s);
      vs.handleEvent('STREAM_ONLINE', {});
      vs.reconcileStreamStatus(false);
      expect(new VariablesService(s).all().values.stream_status).toBe('offline');
    });
  });
});
