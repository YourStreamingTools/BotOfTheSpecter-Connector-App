import { describe, it, expect } from 'vitest';
import { validate, numOrKeep } from './Actions';
import type { ActionBody } from '@shared/ipc';

const poll = (over: Partial<Extract<ActionBody, { type: 'start_end_poll' }>['config']>): ActionBody => ({
  type: 'start_end_poll',
  config: {
    mode: 'start',
    title: 'My poll',
    choices: ['yes', 'no'],
    durationSeconds: 60,
    channelPointsVotingEnabled: false,
    channelPointsPerVote: 100,
    ...over
  }
});

describe('numOrKeep', () => {
  it('keeps the fallback when the field is empty or non-numeric (never returns NaN)', () => {
    expect(numOrKeep('', 60)).toBe(60);
    expect(numOrKeep('abc', 5)).toBe(5);
    expect(Number.isNaN(numOrKeep('', 60))).toBe(false);
  });
  it('parses a valid number', () => {
    expect(numOrKeep('90', 60)).toBe(90);
  });
});

describe('validate() — start_end_poll channelPointsPerVote', () => {
  it('passes when voting is disabled regardless of channelPointsPerVote', () => {
    expect(validate('My poll', poll({ channelPointsVotingEnabled: false, channelPointsPerVote: NaN }))).toBe(true);
  });
  it('fails when voting is enabled and channelPointsPerVote is NaN', () => {
    expect(validate('My poll', poll({ channelPointsVotingEnabled: true, channelPointsPerVote: NaN }))).toBe(false);
  });
  it('passes when voting is enabled and channelPointsPerVote is in range', () => {
    expect(validate('My poll', poll({ channelPointsVotingEnabled: true, channelPointsPerVote: 100 }))).toBe(true);
  });
  it('fails when channelPointsPerVote is out of range', () => {
    expect(validate('My poll', poll({ channelPointsVotingEnabled: true, channelPointsPerVote: 0 }))).toBe(false);
    expect(validate('My poll', poll({ channelPointsVotingEnabled: true, channelPointsPerVote: 2_000_000 }))).toBe(false);
  });
});
