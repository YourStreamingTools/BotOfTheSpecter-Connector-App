import type { PollInput } from './ipc';

/** Validate a poll input against Twitch Helix Create Poll rules (title 1–60 chars, 2–5 choices each ≤25 chars, duration 15–1800s, points-per-vote 1–1,000,000 when channel-points voting enabled); returns an error string or null; lives in @shared so main-process service and renderer form share identical rules. */
export function validatePollInput(input: PollInput): string | null {
  const title = (input?.title ?? '').trim();
  if (!title) return 'Title is required';
  if (title.length > 60) return 'Title must be 60 characters or fewer';

  const choices = (input?.choices ?? []).map((c) => (c ?? '').trim()).filter((c) => c.length > 0);
  if (choices.length < 2) return 'Add at least 2 choices';
  if (choices.length > 5) return 'A poll can have at most 5 choices';
  if (choices.some((c) => c.length > 25)) return 'Each choice must be 25 characters or fewer';

  const d = input.duration;
  if (typeof d !== 'number' || !Number.isInteger(d) || d < 15 || d > 1800) {
    return 'Duration must be between 15 and 1800 seconds';
  }

  if (input.channelPointsVotingEnabled) {
    const p = input.channelPointsPerVote;
    if (typeof p !== 'number' || !Number.isInteger(p) || p < 1 || p > 1_000_000) {
      return 'Channel points per vote must be between 1 and 1,000,000';
    }
  }

  return null;
}
