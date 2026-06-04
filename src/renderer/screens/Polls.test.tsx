import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ScreenPolls } from './Polls';
import type { Poll, PollsSnapshot } from '@shared/ipc';

let listeners: Record<string, (...a: unknown[]) => void>;

const activePoll = (over: Partial<Poll> = {}): Poll => ({
  id: 'p1', title: 'Best game?', status: 'ACTIVE', duration: 120,
  channelPointsVotingEnabled: false, channelPointsPerVote: 0,
  startedAt: '2026-06-04T00:00:00Z', endedAt: null,
  choices: [
    { id: 'c1', title: 'Apex', votes: 3, channelPointsVotes: 1 },
    { id: 'c2', title: 'Valorant', votes: 5, channelPointsVotes: 0 }
  ], ...over
});

const setSnapshot = (snap: PollsSnapshot) => {
  window.api.polls = {
    snapshot: vi.fn().mockResolvedValue(snap),
    refresh: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(true),
    end: vi.fn().mockResolvedValue(true)
  };
};

beforeEach(() => {
  listeners = {};
  window.api.on = vi.fn((c: string, cb: (...a: unknown[]) => void) => { listeners[c] = cb; return () => delete listeners[c]; });
  setSnapshot({ polls: [], state: 'idle' });
});

describe('ScreenPolls', () => {
  it('prompts for an API key when idle', async () => {
    render(<ScreenPolls />);
    expect(await screen.findByText(/No API key yet/i)).toBeInTheDocument();
  });

  it('renders an active poll with choices, vote counts and status', async () => {
    setSnapshot({ state: 'ok', polls: [activePoll()] });
    render(<ScreenPolls />);
    expect(await screen.findByText('Apex')).toBeInTheDocument();
    expect(screen.getByText('Valorant')).toBeInTheDocument();
    expect(screen.getByText(/active/i)).toBeInTheDocument();
    expect(screen.getByText(/5 votes/)).toBeInTheDocument();
    expect(screen.getByText(/3 votes/)).toBeInTheDocument();
  });

  it('disables New poll while a poll is active (one at a time)', async () => {
    setSnapshot({ state: 'ok', polls: [activePoll()] });
    render(<ScreenPolls />);
    await screen.findByText('Best game?');
    expect(screen.getByRole('button', { name: /new poll/i })).toBeDisabled();
  });

  it('creates a poll via the New poll modal', async () => {
    setSnapshot({ state: 'ok', polls: [] });
    render(<ScreenPolls />);
    await screen.findByRole('button', { name: /new poll/i });
    fireEvent.click(screen.getByRole('button', { name: /new poll/i }));
    fireEvent.change(screen.getByPlaceholderText(/poll question/i), { target: { value: 'Best map?' } });
    fireEvent.change(screen.getByPlaceholderText(/choice 1/i), { target: { value: 'One' } });
    fireEvent.change(screen.getByPlaceholderText(/choice 2/i), { target: { value: 'Two' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^create$/i })); });
    expect(window.api.polls.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Best map?', choices: ['One', 'Two'], duration: 120 })
    );
  });

  it('ends (terminates) the active poll after a confirm click', async () => {
    setSnapshot({ state: 'ok', polls: [activePoll({ id: 'p9' })] });
    render(<ScreenPolls />);
    await screen.findByText('Best game?');
    fireEvent.click(screen.getByRole('button', { name: /^end poll/i }));   // arm
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm/i })); });
    expect(window.api.polls.end).toHaveBeenCalledWith('p9', 'TERMINATED');
  });

  it('updates live from a polls:changed push', async () => {
    render(<ScreenPolls />);
    await screen.findByText(/No API key yet/i);
    act(() => listeners['polls:changed']({ state: 'ok', polls: [activePoll({ title: 'Pushed?' })] } as PollsSnapshot));
    expect(await screen.findByText('Pushed?')).toBeInTheDocument();
  });
});
