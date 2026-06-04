/** Bitrate from OBS output byte+duration counters: kbps = (Δbytes * 8) / Δms; null when unusable (no time elapsed or counters reset). */
export function deltaBitrateKbps(prevBytes: number, prevMs: number, curBytes: number, curMs: number): number | null {
  const dBytes = curBytes - prevBytes;
  const dMs = curMs - prevMs;
  if (dMs <= 0 || dBytes < 0) return null;
  return Math.round((dBytes * 8) / dMs);
}
