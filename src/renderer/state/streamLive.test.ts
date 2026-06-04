import { describe, it, expect } from 'vitest';
import { computeStreamLive } from './streamLive';

// Twitch is the source of truth when reachable; otherwise fall back to OBS's in-memory streaming flag (not the persisted `values.stream_status`, which can be stale).

describe('computeStreamLive', () => {
  it('returns Twitch.online verbatim when Twitch is reachable — Twitch is the source of truth', () => {
    expect(computeStreamLive({ twitchReachable: true, twitchOnline: true,  obsStreaming: false })).toBe(true);
    expect(computeStreamLive({ twitchReachable: true, twitchOnline: false, obsStreaming: false })).toBe(false);
  });

  it('ignores OBS streaming when Twitch says the stream is offline', () => {
    // Twitch is authoritative even if OBS is streaming — don't override.
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
