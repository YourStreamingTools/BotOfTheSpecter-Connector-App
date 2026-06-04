import type { RaffleInput } from './ipc';

/** Validate a raffle input per api.py _raffle_config_params (name required, number_of_winners whole int >= 1, each weight in [1.00, 999.99]); returns error string or null when valid; in @shared so main-process and renderer gate Save identically. */
export function validateRaffleInput(input: RaffleInput): string | null {
  const name = (input?.name ?? '').trim();
  if (!name) return 'Name is required';

  const n = input.numberOfWinners;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) {
    return 'Number of winners must be a whole number of at least 1';
  }

  const weights = [input.weightSubT1, input.weightSubT2, input.weightSubT3, input.weightVip];
  for (const w of weights) {
    if (typeof w !== 'number' || Number.isNaN(w) || w < 1 || w > 999.99) {
      return 'Weight multipliers must be between 1 and 999.99';
    }
  }

  return null;
}
