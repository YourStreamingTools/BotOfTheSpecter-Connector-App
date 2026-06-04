import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ScreenPredictions } from './Predictions';
import type { Prediction, PredictionsSnapshot } from '@shared/ipc';

let listeners: Record<string, (...a: unknown[]) => void>;

const activePrediction = (over: Partial<Prediction> = {}): Prediction => ({
  id: 'pr1', title: 'Win the game?', status: 'ACTIVE', predictionWindow: 120,
  winningOutcomeId: null, createdAt: '2026-06-04T00:00:00Z', endedAt: null, lockedAt: null,
  outcomes: [
    { id: 'o1', title: 'Yes', users: 4, channelPoints: 400, color: 'BLUE' },
    { id: 'o2', title: 'No', users: 2, channelPoints: 150, color: 'PINK' }
  ], ...over
});

const setSnapshot = (snap: PredictionsSnapshot) => {
  window.api.predictions = {
    snapshot: vi.fn().mockResolvedValue(snap),
    refresh: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(true),
    end: vi.fn().mockResolvedValue(true)
  };
};

beforeEach(() => {
  listeners = {};
  window.api.on = vi.fn((c: string, cb: (...a: unknown[]) => void) => { listeners[c] = cb; return () => delete listeners[c]; });
  setSnapshot({ predictions: [], state: 'idle' });
});

describe('ScreenPredictions', () => {
  it('prompts for an API key when idle', async () => {
    render(<ScreenPredictions />);
    expect(await screen.findByText(/No API key yet/i)).toBeInTheDocument();
  });

  it('renders an active prediction with outcomes, channel points and status', async () => {
    setSnapshot({ state: 'ok', predictions: [activePrediction()] });
    render(<ScreenPredictions />);
    expect(await screen.findByText('Win the game?')).toBeInTheDocument();
    expect(screen.getByText(/active/i)).toBeInTheDocument();
    // Assert on unique per-outcome channel points since titles also appear in the resolve dropdown.
    expect(screen.getByText(/400 pts/)).toBeInTheDocument();
    expect(screen.getByText(/150 pts/)).toBeInTheDocument();
    // Both outcome titles are present (in the row + the winner <select>).
    expect(screen.getAllByText('Yes').length).toBeGreaterThan(0);
  });

  it('shows a re-authorize notice when the scope is missing (error state)', async () => {
    setSnapshot({ state: 'error', predictions: [], error: 'Re-authorize Specter to enable predictions (missing channel:manage:predictions scope)' });
    render(<ScreenPredictions />);
    expect(await screen.findByText(/re-authorize/i)).toBeInTheDocument();
  });

  it('disables New prediction while one is open', async () => {
    setSnapshot({ state: 'ok', predictions: [activePrediction()] });
    render(<ScreenPredictions />);
    await screen.findByText('Win the game?');
    expect(screen.getByRole('button', { name: /new prediction/i })).toBeDisabled();
  });

  it('creates a prediction via the New prediction modal', async () => {
    setSnapshot({ state: 'ok', predictions: [] });
    render(<ScreenPredictions />);
    await screen.findByRole('button', { name: /new prediction/i });
    fireEvent.click(screen.getByRole('button', { name: /new prediction/i }));
    fireEvent.change(screen.getByPlaceholderText(/prediction question/i), { target: { value: 'Pizza?' } });
    fireEvent.change(screen.getByPlaceholderText(/outcome 1/i), { target: { value: 'Yes' } });
    fireEvent.change(screen.getByPlaceholderText(/outcome 2/i), { target: { value: 'No' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^create$/i })); });
    expect(window.api.predictions.create).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Pizza?', outcomes: ['Yes', 'No'], predictionWindow: 120 })
    );
  });

  it('locks an active prediction after a confirm click', async () => {
    setSnapshot({ state: 'ok', predictions: [activePrediction({ id: 'p9' })] });
    render(<ScreenPredictions />);
    await screen.findByText('Win the game?');
    fireEvent.click(screen.getByRole('button', { name: /^lock$/i }));    // arm
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm/i })); });
    expect(window.api.predictions.end).toHaveBeenCalledWith('p9', 'LOCKED');
  });

  it('resolves a prediction to the chosen winning outcome', async () => {
    setSnapshot({ state: 'ok', predictions: [activePrediction({ id: 'pr1' })] });
    render(<ScreenPredictions />);
    await screen.findByText('Win the game?');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'o1' } });
    fireEvent.click(screen.getByRole('button', { name: /^resolve/i }));   // arm
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm/i })); });
    expect(window.api.predictions.end).toHaveBeenCalledWith('pr1', 'RESOLVED', 'o1');
  });

  it('cancels a prediction after a confirm click', async () => {
    setSnapshot({ state: 'ok', predictions: [activePrediction({ id: 'p7' })] });
    render(<ScreenPredictions />);
    await screen.findByText('Win the game?');
    fireEvent.click(screen.getByRole('button', { name: /^cancel$/i }));   // arm
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /confirm/i })); });
    expect(window.api.predictions.end).toHaveBeenCalledWith('p7', 'CANCELED');
  });

  it('updates live from a predictions:changed push', async () => {
    render(<ScreenPredictions />);
    await screen.findByText(/No API key yet/i);
    act(() => listeners['predictions:changed']({ state: 'ok', predictions: [activePrediction({ title: 'Pushed?' })] } as PredictionsSnapshot));
    expect(await screen.findByText('Pushed?')).toBeInTheDocument();
  });
});
