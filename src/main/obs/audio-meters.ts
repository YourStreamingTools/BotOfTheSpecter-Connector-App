/** Convert OBS InputVolumeMeters `inputLevelsMul` triples to the loudest channel's peak in dBFS, floored at -100 dB for silence (JSON can't carry -Infinity). */
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
