import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ScreenAlerts } from './Alerts';
import type { Alert, AlertsSnapshot } from '@shared/ipc';

let listeners: Record<string, (...a: unknown[]) => void>;

const mk = (over: Partial<Alert>): Alert => ({
  id: `alt_${Math.random()}`, kind: 'follow', platform: 'twitch', receivedAt: Date.parse('2026-06-01T10:00:00Z'),
  detail: 'someone followed', ...over
});

const setSnapshot = (snap: AlertsSnapshot) => {
  window.api.alerts = { snapshot: vi.fn().mockResolvedValue(snap) };
};

beforeEach(() => {
  listeners = {};
  window.api.on = vi.fn((c: string, cb: (...a: unknown[]) => void) => { listeners[c] = cb; return () => delete listeners[c]; });
  setSnapshot({ alerts: [] });
});

describe('ScreenAlerts', () => {
  it('shows a waiting state when empty', async () => {
    render(<ScreenAlerts />);
    expect(await screen.findByText(/Waiting for alerts/i)).toBeInTheDocument();
  });

  it('seeds the feed from the snapshot', async () => {
    setSnapshot({ alerts: [mk({ detail: 'owl followed' })] });
    render(<ScreenAlerts />);
    expect(await screen.findByText('owl followed')).toBeInTheDocument();
  });

  it('prepends a pushed alert newest-first', async () => {
    setSnapshot({ alerts: [mk({ id: 'a', detail: 'older' })] });
    render(<ScreenAlerts />);
    await screen.findByText('older');
    act(() => listeners['alerts:alert'](mk({ id: 'b', kind: 'cheer', detail: 'newer cheer' })));
    const rows = screen.getAllByText(/older|newer cheer/);
    expect(rows[0].textContent).toBe('newer cheer');
  });

  it('filters by kind', async () => {
    setSnapshot({ alerts: [
      mk({ id: 'f', kind: 'follow', detail: 'a followed' }),
      mk({ id: 'c', kind: 'cheer', detail: 'b cheered' })
    ] });
    render(<ScreenAlerts />);
    await screen.findByText('a followed');
    fireEvent.click(screen.getByRole('button', { name: /^Cheers/ }));
    expect(screen.queryByText('a followed')).not.toBeInTheDocument();
    expect(screen.getByText('b cheered')).toBeInTheDocument();
  });

  it('renders a donation message line', async () => {
    setSnapshot({ alerts: [mk({ kind: 'donation', platform: 'kofi', detail: 'gen donated 10 AUD via Ko-fi', message: 'cheers!' })] });
    render(<ScreenAlerts />);
    expect(await screen.findByText('gen donated 10 AUD via Ko-fi')).toBeInTheDocument();
    expect(screen.getByText(/cheers!/)).toBeInTheDocument();
  });
});
