import type { PredictionInput } from './ipc';

/** Validate against Twitch Helix Create Prediction rules (title 1–45 chars, 2–10 outcomes each ≤25 chars, window 30–1800s); returns error string or null; in @shared so main service and renderer form share identical rules. */
export function validatePredictionInput(input: PredictionInput): string | null {
  const title = (input?.title ?? '').trim();
  if (!title) return 'Title is required';
  if (title.length > 45) return 'Title must be 45 characters or fewer';

  const outcomes = (input?.outcomes ?? []).map((o) => (o ?? '').trim()).filter((o) => o.length > 0);
  if (outcomes.length < 2) return 'Add at least 2 outcomes';
  if (outcomes.length > 10) return 'A prediction can have at most 10 outcomes';
  if (outcomes.some((o) => o.length > 25)) return 'Each outcome must be 25 characters or fewer';

  const w = input.predictionWindow;
  if (typeof w !== 'number' || !Number.isInteger(w) || w < 30 || w > 1800) {
    return 'Prediction window must be between 30 and 1800 seconds';
  }

  return null;
}
