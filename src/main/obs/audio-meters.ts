/**
 * Convert one input's `inputLevelsMul` (per-channel `[magnitude, peak, input_peak]`
 * triples from OBS's `InputVolumeMeters` event) to a single peak value in dBFS.
 * Returns the loudest channel's peak. Floored at -100 dB to represent silence —
 * JSON can't carry -Infinity, and -100 is well below what's audible.
 */
export const SILENCE_DB = -100;

export function peakDbFromLevels(levels: unknown): number {
  if (!Array.isArray(levels) || levels.length === 0) return SILENCE_DB;
  let maxMul = 0;
  for (const ch of levels) {
    if (!Array.isArray(ch)) continue;
    // OBS WS v5 channel layout: [magnitude, peak, input_peak]. We take peak.
    const peak = Number(ch[1] ?? 0);
    if (Number.isFinite(peak) && peak > maxMul) maxMul = peak;
  }
  if (maxMul <= 0) return SILENCE_DB;
  const db = 20 * Math.log10(maxMul);
  return db < SILENCE_DB ? SILENCE_DB : db;
}
