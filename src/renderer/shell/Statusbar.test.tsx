import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { Statusbar } from './Statusbar';

afterEach(() => vi.useRealTimers());

describe('Statusbar', () => {
  it('updates the clock as time passes instead of freezing at first render', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 30, 10, 0, 0));
    render(<Statusbar obsState="disconnected" streamLive={false} />);
    const before = screen.getByTestId('sb-clock').textContent;
    vi.setSystemTime(new Date(2026, 4, 30, 11, 45, 0));
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(screen.getByTestId('sb-clock').textContent).not.toBe(before);
  });
});
