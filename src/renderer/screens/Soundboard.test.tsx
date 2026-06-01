import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ScreenSoundboard } from './Soundboard';
import type { SoundboardSnapshot } from '@shared/ipc';

let listeners: Record<string, (...a: unknown[]) => void>;

const setSnapshot = (snap: SoundboardSnapshot) => {
  window.api.soundboard = {
    snapshot: vi.fn().mockResolvedValue(snap),
    refresh: vi.fn().mockResolvedValue(undefined),
    play: vi.fn().mockResolvedValue(true)
  };
};

beforeEach(() => {
  listeners = {};
  window.api.on = vi.fn((c: string, cb: (...a: unknown[]) => void) => { listeners[c] = cb; return () => delete listeners[c]; });
  setSnapshot({ sounds: [], state: 'idle' });
});

describe('ScreenSoundboard', () => {
  it('prompts for an API key when idle', async () => {
    render(<ScreenSoundboard />);
    expect(await screen.findByText(/No API key yet/i)).toBeInTheDocument();
  });

  it('renders a button per sound and plays it on click', async () => {
    setSnapshot({ sounds: ['airhorn.mp3', 'yay.wav'], state: 'ok' });
    render(<ScreenSoundboard />);
    expect(await screen.findByText('airhorn')).toBeInTheDocument();
    expect(screen.getByText('yay')).toBeInTheDocument();
    fireEvent.click(screen.getByText('airhorn'));
    expect(window.api.soundboard.play).toHaveBeenCalledWith('airhorn.mp3');
  });

  it('shows a failure flash when play returns false', async () => {
    setSnapshot({ sounds: ['airhorn.mp3'], state: 'ok' });
    window.api.soundboard.play = vi.fn().mockResolvedValue(false);
    render(<ScreenSoundboard />);
    await screen.findByText('airhorn');
    await act(async () => { fireEvent.click(screen.getByText('airhorn')); });
    expect(await screen.findByText('Failed')).toBeInTheDocument();
  });

  it('updates live from a soundboard:changed push', async () => {
    render(<ScreenSoundboard />);
    await screen.findByText(/No API key yet/i);
    act(() => listeners['soundboard:changed']({ sounds: ['boom.mp3'], state: 'ok' } as SoundboardSnapshot));
    expect(await screen.findByText('boom')).toBeInTheDocument();
  });

  it('refreshes on demand', async () => {
    setSnapshot({ sounds: ['a.mp3'], state: 'ok' });
    render(<ScreenSoundboard />);
    await screen.findByText('a');
    fireEvent.click(screen.getByRole('button', { name: /refresh/i }));
    await waitFor(() => expect(window.api.soundboard.refresh).toHaveBeenCalled());
  });
});
