import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { ThemeProvider, useTheme } from './theme';

function setMatchMedia(prefersLight: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: prefersLight, media: query,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), onchange: null, dispatchEvent: vi.fn()
  }));
}

function Probe() {
  const { theme, setTheme } = useTheme();
  return <button onClick={() => setTheme('light')}>{theme}</button>;
}

beforeEach(() => {
  document.documentElement.removeAttribute('data-theme');
  setMatchMedia(false);
  window.api.config.set = vi.fn().mockResolvedValue(undefined);
});

describe('ThemeProvider', () => {
  it('follows the system: dark when the OS prefers dark', () => {
    render(<ThemeProvider initial="system"><Probe /></ThemeProvider>);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('follows the system: light when the OS prefers light', () => {
    setMatchMedia(true);
    render(<ThemeProvider initial="system"><Probe /></ThemeProvider>);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('locks to the chosen theme regardless of the OS, and persists the choice', () => {
    setMatchMedia(true); // OS prefers light…
    const { getByRole } = render(<ThemeProvider initial="dark"><Probe /></ThemeProvider>);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark'); // …but we forced dark
    act(() => getByRole('button').click()); // switch to light
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(window.api.config.set).toHaveBeenCalledWith('theme', 'light');
  });
});
