import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScreenDashboard } from './Dashboard';

beforeEach(() => {
  window.api.on = vi.fn(() => () => {});
  window.api.logs = {
    snapshot: vi.fn().mockResolvedValue([
      { t: '00:00:01', src: 'OBS', level: 'info', message: 'obs line' },
      { t: '00:00:02', src: 'TWITCH', level: 'evt', message: 'twitch line' }
    ])
  };
  window.api.variables = {
    all: vi.fn().mockResolvedValue({ values: {}, counters: {} }),
    resetSession: vi.fn().mockResolvedValue(undefined)
  };
});

describe('Dashboard Live Activity filter', () => {
  it('filters the activity log by source when a source is toggled off', async () => {
    render(<ScreenDashboard />);
    // Both lines visible before filtering.
    expect(await screen.findByText('obs line')).toBeInTheDocument();
    expect(screen.getByText('twitch line')).toBeInTheDocument();

    // Open the filter panel and deselect TWITCH (the chip is a button; the log src label is a span).
    fireEvent.click(screen.getByRole('button', { name: /^filter/i }));
    fireEvent.click(screen.getByRole('button', { name: 'TWITCH' }));

    expect(screen.queryByText('twitch line')).not.toBeInTheDocument();
    expect(screen.getByText('obs line')).toBeInTheDocument();
  });

  it('manually resets session counters only after a confirm click', () => {
    render(<ScreenDashboard />);
    fireEvent.click(screen.getByRole('button', { name: /reset session counters/i }));
    expect(window.api.variables.resetSession).not.toHaveBeenCalled(); // armed, not fired
    fireEvent.click(screen.getByRole('button', { name: /click again to reset/i }));
    expect(window.api.variables.resetSession).toHaveBeenCalledTimes(1);
  });
});
