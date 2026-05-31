import { describe, it, expect } from 'vitest';
import { computeStreamLive } from './streamLive';

// Twitch is the source of truth whenever it's reachable. When it isn't, OBS's
// in-memory streaming flag is the fallback — it's a live signal, unlike the
// persisted `values.stream_status` variable which can be stale across sessions
// (the bot's STREAM_ONLINE event sets it but no STREAM_OFFLINE arrives if the
// app isn't running at end-of-stream). The variable is intentionally NOT
// consulted by this function.

describe('computeStreamLive', () => {
  it('returns Twitch.online verbatim when Twitch is reachable — Twitch is the source of truth', () => {
    expect(computeStreamLive({ twitchReachable: true, twitchOnline: true,  obsStreaming: false })).toBe(true);
    expect(computeStreamLive({ twitchReachable: true, twitchOnline: false, obsStreaming: false })).toBe(false);
  });

  it('ignores OBS streaming when Twitch says the stream is offline', () => {
    // Twitch hasn't picked up the stream yet OR OBS is in a stale state. Either
    // way, Twitch is authoritative — don't override.
    expect(computeStreamLive({ twitchReachable: true, twitchOnline: false, obsStreaming: true })).toBe(false);
  });

  it('falls back to OBS streaming when Twitch is unreachable', () => {
    expect(computeStreamLive({ twitchReachable: false, twitchOnline: false, obsStreaming: true  })).toBe(true);
    expect(computeStreamLive({ twitchReachable: false, twitchOnline: false, obsStreaming: false })).toBe(false);
  });

  it('reports offline when Twitch is unreachable and OBS is not streaming', () => {
    expect(computeStreamLive({ twitchReachable: false, twitchOnline: false, obsStreaming: false })).toBe(false);
  });
});
