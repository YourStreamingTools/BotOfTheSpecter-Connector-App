import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { App } from './App';
import { ObsProvider } from './state/useObs';

const renderApp = () => render(<ObsProvider><App initialConfig={{}} /></ObsProvider>);

let listeners: Record<string, (...args: unknown[]) => void>;

beforeEach(() => {
  listeners = {};
  window.api.on = vi.fn((channel: string, cb: (...args: unknown[]) => void) => {
    listeners[channel] = cb;
    return () => delete listeners[channel];
  });
});

describe('App shell', () => {
  it('reflects OBS connection state from pushes in the status bar', () => {
    renderApp();
    expect(screen.getAllByText(/not connected/i).length).toBeGreaterThan(0);
    act(() => listeners['obs:status']?.({ state: 'connected', url: 'ws://localhost:4455', eventsForwarded: 0 }));
    expect(screen.getAllByText(/ws:\/\/localhost:4455/i).length).toBeGreaterThan(0);
  });

  it('shows the bot relay as connected when relay:status reports connected', () => {
    renderApp();
    act(() => listeners['relay:status']?.({ state: 'connected', registered: true, locked: false, hasApiKey: true }));
    expect(screen.getAllByText(/wss:\/\/websocket\.botofthespecter\.com/i).length).toBeGreaterThan(0);
  });
});
