// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { peakDbFromLevels, SILENCE_DB } from './audio-meters';

describe('peakDbFromLevels', () => {
  it('returns silence floor for empty / missing levels', () => {
    expect(peakDbFromLevels(undefined)).toBe(SILENCE_DB);
    expect(peakDbFromLevels(null)).toBe(SILENCE_DB);
    expect(peakDbFromLevels([])).toBe(SILENCE_DB);
    expect(peakDbFromLevels('not-an-array')).toBe(SILENCE_DB);
  });

  it('returns silence floor when every channel reports zero', () => {
    expect(peakDbFromLevels([[0, 0, 0], [0, 0, 0]])).toBe(SILENCE_DB);
  });

  it('returns 0 dB when peak is 1.0 (full scale)', () => {
    expect(peakDbFromLevels([[0.5, 1.0, 1.0]])).toBe(0);
  });

  it('converts a half-amplitude peak to roughly -6 dB', () => {
    expect(peakDbFromLevels([[0.3, 0.5, 0.6]])).toBeCloseTo(-6.02, 1);
  });

  it('takes the maximum peak across channels', () => {
    // ch1 quieter, ch2 louder → loudest peak wins.
    const db = peakDbFromLevels([[0.05, 0.1, 0.1], [0.4, 0.8, 0.8]]);
    expect(db).toBeCloseTo(-1.94, 1); // 20·log10(0.8)
  });

  it('floors values below the silence threshold at -100', () => {
    // 0.000001 → -120 dB → floored to -100.
    expect(peakDbFromLevels([[0, 0.000_001, 0]])).toBe(SILENCE_DB);
  });

  it('ignores non-array channel entries defensively', () => {
    expect(peakDbFromLevels([null, undefined, [0.4, 0.5, 0.5]])).toBeCloseTo(-6.02, 1);
  });
});
