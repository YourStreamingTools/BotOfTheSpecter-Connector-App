import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useRelay } from './useRelay';

let listeners: Record<string, (...a: unknown[]) => void>;
beforeEach(() => {
  listeners = {};
  window.api.on = vi.fn((c: string, cb: (...a: unknown[]) => void) => { listeners[c] = cb; return () => delete listeners[c]; });
  window.api.relay = {
    setLock: vi.fn().mockResolvedValue(undefined),
    setApiKey: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    snapshot: vi.fn().mockResolvedValue({ state: 'disconnected', registered: false, locked: false, hasApiKey: false })
  };
});

function Probe() {
  const { status } = useRelay();
  return <div data-testid="s">{status.state}</div>;
}

describe('useRelay', () => {
  it('initializes from the relay snapshot on mount (recovers a connect push fired before mount)', async () => {
    window.api.relay.snapshot = vi.fn().mockResolvedValue({ state: 'connected', registered: true, locked: false, hasApiKey: true });
    render(<Probe />);
    expect(await screen.findByText('connected')).toBeInTheDocument();
  });

  it('updates from relay:status pushes', async () => {
    render(<Probe />);
    await act(async () => {}); // let the initial snapshot settle
    expect(screen.getByTestId('s').textContent).toBe('disconnected');
    act(() => listeners['relay:status']({ state: 'connected', registered: true, locked: false, hasApiKey: true }));
    expect(screen.getByTestId('s').textContent).toBe('connected');
  });
});
