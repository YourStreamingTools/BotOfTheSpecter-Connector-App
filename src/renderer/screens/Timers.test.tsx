import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ScreenTimers } from './Timers';
import type { Timer, TimersSnapshot } from '@shared/ipc';

let listeners: Record<string, (...a: unknown[]) => void>;

const setSnapshot = (snap: TimersSnapshot) => {
  window.api.timers = {
    snapshot: vi.fn().mockResolvedValue(snap),
    refresh: vi.fn().mockResolvedValue(undefined),
    create: vi.fn().mockResolvedValue(true),
    update: vi.fn().mockResolvedValue(true),
    toggle: vi.fn().mockResolvedValue(true),
    delete: vi.fn().mockResolvedValue(true)
  };
};

const mk = (over: Partial<Timer> = {}): Timer => ({
  id: 1, triggerType: 'timer', intervalCount: 30, chatLineTrigger: null, message: 'Follow!', enabled: true, ...over
});

beforeEach(() => {
  listeners = {};
  window.api.on = vi.fn((c: string, cb: (...a: unknown[]) => void) => { listeners[c] = cb; return () => delete listeners[c]; });
  setSnapshot({ timers: [], state: 'idle' });
});

describe('ScreenTimers', () => {
  it('prompts for an API key when idle', async () => {
    render(<ScreenTimers />);
    expect(await screen.findByText(/No API key yet/i)).toBeInTheDocument();
  });

  it('lists message timers and chat-line timers in their sections', async () => {
    setSnapshot({ state: 'ok', timers: [
      mk({ id: 1, triggerType: 'timer', intervalCount: 30, message: 'Msg timer' }),
      mk({ id: 2, triggerType: 'chat_lines', intervalCount: null, chatLineTrigger: 10, message: 'Chat timer' })
    ] });
    render(<ScreenTimers />);
    expect(await screen.findByText('Msg timer')).toBeInTheDocument();
    expect(screen.getByText('Chat timer')).toBeInTheDocument();
    expect(screen.getByText('every 30 min')).toBeInTheDocument();
    expect(screen.getByText('every 10 lines')).toBeInTheDocument();
  });

  it('toggles a timer', async () => {
    setSnapshot({ state: 'ok', timers: [mk({ id: 5, enabled: true })] });
    render(<ScreenTimers />);
    await screen.findByText('Follow!');
    fireEvent.click(screen.getByTitle('Disable'));
    expect(window.api.timers.toggle).toHaveBeenCalledWith(5, false);
  });

  it('deletes a timer on the second (confirm) click', async () => {
    setSnapshot({ state: 'ok', timers: [mk({ id: 9 })] });
    render(<ScreenTimers />);
    await screen.findByText('Follow!');
    fireEvent.click(screen.getByTitle('Delete'));
    expect(window.api.timers.delete).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTitle('Click again to confirm'));
    expect(window.api.timers.delete).toHaveBeenCalledWith(9);
  });

  it('creates a new timer through the editor', async () => {
    render(<ScreenTimers />);
    await screen.findByText(/No API key yet/i);
    fireEvent.click(screen.getByRole('button', { name: /new timer/i }));
    fireEvent.change(screen.getByPlaceholderText(/what the bot will post/i), { target: { value: 'New msg' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /^create$/i })); });
    expect(window.api.timers.create).toHaveBeenCalledWith(
      expect.objectContaining({ triggerType: 'timer', intervalCount: 30, message: 'New msg' })
    );
  });

  it('blocks save with an invalid interval and shows the rule', async () => {
    render(<ScreenTimers />);
    await screen.findByText(/No API key yet/i);
    fireEvent.click(screen.getByRole('button', { name: /new timer/i }));
    fireEvent.change(screen.getByPlaceholderText(/what the bot will post/i), { target: { value: 'X' } });
    fireEvent.change(screen.getByDisplayValue('30'), { target: { value: '2' } });
    expect(screen.getByText(/between 5 and 480/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^create$/i })).toBeDisabled();
  });

  it('updates live from a timers:changed push', async () => {
    render(<ScreenTimers />);
    await screen.findByText(/No API key yet/i);
    act(() => listeners['timers:changed']({ state: 'ok', timers: [mk({ message: 'Pushed' })] } as TimersSnapshot));
    expect(await screen.findByText('Pushed')).toBeInTheDocument();
  });
});
