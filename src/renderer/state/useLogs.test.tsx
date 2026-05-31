import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useLogs } from './useLogs';
import type { LogEntry } from '@shared/ipc';

let listeners: Record<string, (...a: unknown[]) => void>;
beforeEach(() => {
  listeners = {};
  window.api.on = vi.fn((c: string, cb: (...a: unknown[]) => void) => { listeners[c] = cb; return () => delete listeners[c]; });
  window.api.logs = { snapshot: vi.fn().mockResolvedValue([]) };
});

const line = (message: string): LogEntry => ({ t: '00:00:00', src: 'APP', level: 'info', message });

function Probe() {
  const lines = useLogs();
  return <div data-testid="logs">{lines.map((l) => l.message).join('|')}</div>;
}

describe('useLogs', () => {
  it('does not lose a log line that arrives before the snapshot resolves', async () => {
    let resolveSnap: (v: LogEntry[]) => void = () => undefined;
    window.api.logs = { snapshot: vi.fn((): Promise<LogEntry[]> => new Promise((r) => { resolveSnap = r; })) };
    render(<Probe />);
    act(() => listeners['log:line'](line('live')));
    await act(async () => { resolveSnap([line('history')]); });
    // Newest-first: the live line (arrived during the round-trip) stays in front of the history.
    expect(screen.getByTestId('logs').textContent).toBe('live|history');
  });
});
