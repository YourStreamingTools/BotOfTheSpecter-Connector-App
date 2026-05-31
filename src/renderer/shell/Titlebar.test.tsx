import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Titlebar } from './Titlebar';

describe('Titlebar', () => {
  beforeEach(() => {
    window.api.window.close = vi.fn();
    window.api.window.minimize = vi.fn();
    window.api.window.maximize = vi.fn();
  });

  it('shows the current screen title', () => {
    render(<Titlebar screen="obs" />);
    expect(screen.getByText('OBS Control')).toBeInTheDocument();
  });

  it('wires the traffic-light buttons to window controls', () => {
    render(<Titlebar screen="dashboard" />);
    screen.getByLabelText('Close').click();
    screen.getByLabelText('Minimize').click();
    expect(window.api.window.close).toHaveBeenCalledOnce();
    expect(window.api.window.minimize).toHaveBeenCalledOnce();
  });
});
