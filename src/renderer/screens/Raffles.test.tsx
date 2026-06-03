import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ScreenRaffles } from './Raffles';
import type { Raffle, RafflesSnapshot } from '@shared/ipc';

let listeners: Record<string, (...a: unknown[]) => void>;

const raffleObj = (over: Partial<Raffle> = {}): Raffle => ({
  id: 1, name: 'Big Giveaway', prize: 'A Shirt', numberOfWinners: 1, status: 'scheduled',
  isWeighted: false, weightSubT1: 2, weightSubT2: 3, weightSubT3: 4, weightVip: 1.5,
  excludeMods: false, subscribersOnly: false, followersOnly: false,
  followersMinEnabled: false, followersMinValue: 0, followersMinUnit: 'days',
  createdAt: null, entryCount: 0, winnerCount: 0, winners: [], ...over
});

const setSnapshot = (snap: RafflesSnapshot) => {
  window.api.raffles = {
    snapshot: vi.fn().mockResolvedValue(snap),
    refresh: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(true),
    update: vi.fn().mockResolvedValue(true),
    start: vi.fn().mockResolvedValue(true),
    stop: vi.fn().mockResolvedValue(true),
    draw: vi.fn().mockResolvedValue(['owl']),
    delete: vi.fn().mockResolvedValue(true),
    entries: vi.fn().mockResolvedValue([]),
    winners: vi.fn().mockResolvedValue([])
  };
};

beforeEach(() => {
  listeners = {};
  window.api.on = vi.fn((c: string, cb: (...a: unknown[]) => void) => { listeners[c] = cb; return () => delete listeners[c]; });
  setSnapshot({ raffles: [], state: 'idle' });
});

describe('ScreenRaffles', () => {
  it('prompts for an API key when idle', async () => {
    render(<ScreenRaffles />);
    expect(await screen.findByText(/No API key yet/i)).toBeInTheDocument();
  });

  it('renders raffle cards with name, status and entry count', async () => {
    setSnapshot({ state: 'ok', raffles: [raffleObj({ name: 'Hydrate Giveaway', status: 'running', entryCount: 42 })] });
    render(<ScreenRaffles />);
    expect(await screen.findByText('Hydrate Giveaway')).toBeInTheDocument();
    expect(screen.getByText(/running/i)).toBeInTheDocument();
    expect(screen.getByText(/42/)).toBeInTheDocument();
  });

  it('creates a raffle via the New giveaway modal', async () => {
    setSnapshot({ state: 'ok', raffles: [] });
    render(<ScreenRaffles />);
    await screen.findByRole('button', { name: /new giveaway/i });
    fireEvent.click(screen.getByRole('button', { name: /new giveaway/i }));
    fireEvent.change(screen.getByPlaceholderText(/giveaway name/i), { target: { value: 'Cool Raffle' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^create$/i })); });
    expect(window.api.raffles.create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Cool Raffle', numberOfWinners: 1 }));
  });

  it('edits a scheduled raffle via the modal', async () => {
    setSnapshot({ state: 'ok', raffles: [raffleObj({ id: 7, name: 'Editable', status: 'scheduled' })] });
    render(<ScreenRaffles />);
    await screen.findByText('Editable');
    fireEvent.click(screen.getByRole('button', { name: /edit/i }));
    fireEvent.change(screen.getByPlaceholderText(/giveaway name/i), { target: { value: 'Renamed' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^save$/i })); });
    expect(window.api.raffles.update).toHaveBeenCalledWith(7, expect.objectContaining({ name: 'Renamed' }));
  });

  it('starts a scheduled raffle', async () => {
    setSnapshot({ state: 'ok', raffles: [raffleObj({ id: 3, status: 'scheduled' })] });
    render(<ScreenRaffles />);
    await screen.findByText('Big Giveaway');
    fireEvent.click(screen.getByRole('button', { name: /^start$/i }));
    expect(window.api.raffles.start).toHaveBeenCalledWith(3);
  });

  it('draws a running raffle after a confirm click', async () => {
    setSnapshot({ state: 'ok', raffles: [raffleObj({ id: 4, status: 'running', entryCount: 3 })] });
    render(<ScreenRaffles />);
    await screen.findByText('Big Giveaway');
    fireEvent.click(screen.getByRole('button', { name: /^draw/i }));     // arm
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm/i })); });
    expect(window.api.raffles.draw).toHaveBeenCalledWith(4);
  });

  it('deletes a raffle after a confirm click', async () => {
    setSnapshot({ state: 'ok', raffles: [raffleObj({ id: 9, status: 'ended' })] });
    render(<ScreenRaffles />);
    await screen.findByText('Big Giveaway');
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));    // arm
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm/i })); });
    expect(window.api.raffles.delete).toHaveBeenCalledWith(9);
  });

  it('shows entries when the entrants view is opened', async () => {
    setSnapshot({ state: 'ok', raffles: [raffleObj({ id: 5, status: 'running', entryCount: 1 })] });
    window.api.raffles.entries = vi.fn().mockResolvedValue([
      { id: 1, raffleId: 5, userId: '900', username: 'owl', weight: 100, source: 'Twitch', enteredAt: null }
    ]);
    render(<ScreenRaffles />);
    await screen.findByText('Big Giveaway');
    fireEvent.click(screen.getByRole('button', { name: /entries/i }));
    expect(await screen.findByText('owl')).toBeInTheDocument();
    expect(window.api.raffles.entries).toHaveBeenCalledWith(5);
  });

  it('updates live from a raffles:changed push', async () => {
    render(<ScreenRaffles />);
    await screen.findByText(/No API key yet/i);
    act(() => listeners['raffles:changed']({ state: 'ok', raffles: [raffleObj({ name: 'Pushed' })] } as RafflesSnapshot));
    expect(await screen.findByText('Pushed')).toBeInTheDocument();
  });
});
