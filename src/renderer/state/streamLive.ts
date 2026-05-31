/**
 * Decide whether the stream should be displayed as LIVE.
 *
 * Source-of-truth chain:
 *   1. If Twitch is reachable, trust its `online` flag exclusively — `data: []`
 *      from /helix/streams means offline, period.
 *   2. Otherwise fall back to OBS's in-memory streaming flag. OBS is a live
 *      signal: if it's currently broadcasting an RTMP feed we can reasonably
 *      assume the stream is up even though we can't confirm with Twitch.
 *   3. Otherwise offline.
 *
 * Note we deliberately do NOT consult the persisted `values.stream_status`
 * variable — it's set by the bot's STREAM_ONLINE event but the matching
 * STREAM_OFFLINE may never arrive (if the app isn't open at end-of-stream),
 * so the variable can stay "online" across restarts long after the stream ends.
 */
export function computeStreamLive(args: {
  twitchReachable: boolean;
  twitchOnline: boolean;
  obsStreaming: boolean;
}): boolean {
  if (args.twitchReachable) return args.twitchOnline;
  return args.obsStreaming;
}
