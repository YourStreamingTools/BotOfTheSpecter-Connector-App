import type { RaffleInput } from './ipc';

/**
 * Validate a raffle input against the same rules the API enforces
 * (api.py _raffle_config_params): name required, number_of_winners a whole number
 * >= 1, and every weight multiplier within [1.00, 999.99]. Returns an error string,
 * or null when valid.
 *
 * Lives in @shared so the main-process service and the renderer form gate Save with
 * the identical rules (and the renderer doesn't import main-process code).
 */
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
