/** Decide if stream is LIVE: trust Twitch /helix/streams online flag if reachable (data:[] means offline), else fall back to OBS streaming flag; ignores persisted values.stream_status since STREAM_OFFLINE may never arrive. */
export function computeStreamLive(args: {
  twitchReachable: boolean;
  twitchOnline: boolean;
  obsStreaming: boolean;
}): boolean {
  if (args.twitchReachable) return args.twitchOnline;
  return args.obsStreaming;
}
