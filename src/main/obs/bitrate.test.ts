// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { deltaBitrateKbps } from './bitrate';

describe('deltaBitrateKbps', () => {
  it('computes kbps from byte/ms deltas: (Δbytes*8)/Δms', () => {
    // 100000 bytes over 1000ms = 800000 bits / 1s = 800 kbps
    expect(deltaBitrateKbps(0, 0, 100_000, 1000)).toBe(800);
  });

  it('uses only the delta since the previous sample', () => {
    expect(deltaBitrateKbps(50_000, 1000, 150_000, 2000)).toBe(800);
  });

  it('returns null when time has not advanced', () => {
    expect(deltaBitrateKbps(0, 1000, 100_000, 1000)).toBeNull();
  });

  it('returns null when bytes go backwards (output reset)', () => {
    expect(deltaBitrateKbps(200_000, 1000, 100_000, 2000)).toBeNull();
  });

  it('rounds to the nearest kbps', () => {
    expect(deltaBitrateKbps(0, 0, 12_345, 1000)).toBe(99); // 98.76 → 99
  });
});
