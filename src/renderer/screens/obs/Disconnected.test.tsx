import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ObsDisconnected } from './Disconnected';

const defaults = (host: string, password = '') => ({ host, port: 4455, password, autoConnect: false });

describe('ObsDisconnected', () => {
  it('re-seeds the form when the saved settings finish loading after mount', () => {
    const { rerender } = render(<ObsDisconnected state="error" defaults={defaults('localhost')} onConnect={vi.fn()} />);
    expect(screen.getByDisplayValue('localhost')).toBeInTheDocument();

    // The saved config arrives async and updates the prop — the form must follow.
    rerender(<ObsDisconnected state="error" defaults={defaults('192.168.1.99', 'secretpw')} onConnect={vi.fn()} />);
    expect(screen.getByDisplayValue('192.168.1.99')).toBeInTheDocument();
    expect(screen.getByDisplayValue('secretpw')).toBeInTheDocument();
  });

  it('connects with the saved settings shown in the form', () => {
    const onConnect = vi.fn();
    render(<ObsDisconnected state="error" defaults={defaults('192.168.1.99')} onConnect={onConnect} />);
    screen.getByRole('button', { name: /connect/i }).click();
    expect(onConnect).toHaveBeenCalledWith(expect.objectContaining({ host: '192.168.1.99', port: 4455 }));
  });

  it('does not connect with an invalid (non-numeric) port — no silent coercion to 4455', () => {
    const onConnect = vi.fn();
    render(<ObsDisconnected state="disconnected" defaults={defaults('localhost')} onConnect={onConnect} />);
    fireEvent.change(screen.getByDisplayValue('4455'), { target: { value: 'abc' } });
    screen.getByRole('button', { name: /^connect$/i }).click();
    expect(onConnect).not.toHaveBeenCalled();
  });
});
