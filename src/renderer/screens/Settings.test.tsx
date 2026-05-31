import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ScreenSettings } from './Settings';
import { AccountProvider } from '../state/account';

const renderSettings = () => render(<AccountProvider><ScreenSettings /></AccountProvider>);

beforeEach(() => {
  window.api.on = vi.fn(() => () => {});
  window.api.config = { ...window.api.config, get: vi.fn().mockResolvedValue(undefined) };
  window.api.relay = {
    setLock: vi.fn().mockResolvedValue(undefined),
    setApiKey: vi.fn().mockResolvedValue(undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
    snapshot: vi.fn().mockResolvedValue({ state: 'disconnected', registered: false, locked: false, hasApiKey: false })
  };
  window.api.auth = {
    validateKey: vi.fn().mockResolvedValue({ valid: true, username: 'teststreamer', message: 'Valid API Key' }),
    account: vi.fn().mockResolvedValue(null)
  };
});

const typeKey = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText(/paste your botofthespecter api key/i), { target: { value } });
const clickSave = () => fireEvent.click(screen.getByRole('button', { name: /save & connect/i }));

describe('ScreenSettings API key validation', () => {
  it('validates, then saves/connects only when the key is valid', async () => {
    renderSettings();
    typeKey('GOODKEY');
    clickSave();
    await screen.findByText(/connected as teststreamer/i);
    expect(window.api.auth.validateKey).toHaveBeenCalledWith('GOODKEY');
    expect(window.api.relay.setApiKey).toHaveBeenCalledWith('GOODKEY');
  });

  it('rejects an invalid key without saving or connecting', async () => {
    window.api.auth.validateKey = vi.fn().mockResolvedValue({ valid: false, username: undefined, message: 'Invalid API Key' });
    renderSettings();
    typeKey('BADKEY');
    clickSave();
    await screen.findByText(/invalid api key/i);
    expect(window.api.auth.validateKey).toHaveBeenCalledWith('BADKEY');
    expect(window.api.relay.setApiKey).not.toHaveBeenCalled();
  });

  it('surfaces an error (and re-enables the button) when validation throws, instead of hanging on "Validating…"', async () => {
    window.api.auth.validateKey = vi.fn().mockRejectedValue(new Error('network down'));
    renderSettings();
    typeKey('GOODKEY');
    clickSave();
    await screen.findByText(/network down/i);
    expect(screen.getByRole('button', { name: /save & connect/i })).not.toBeDisabled();
  });

  it('does not call the API for an empty key', async () => {
    renderSettings();
    clickSave();
    await screen.findByText(/enter your api key first/i);
    expect(window.api.auth.validateKey).not.toHaveBeenCalled();
  });

  it('fetches and renders the account card after a valid key', async () => {
    window.api.auth.account = vi.fn().mockResolvedValue({
      id: 2, username: 'teststreamer', displayName: 'TestStreamer', twitchUserId: '1234567',
      profileImage: 'https://example/avatar.png', isAdmin: true, betaAccess: true, isTechnical: true
    });
    renderSettings();
    typeKey('GOODKEY');
    clickSave();
    expect(await screen.findByText('TestStreamer')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.getByText('@teststreamer')).toBeInTheDocument();
    expect(window.api.auth.account).toHaveBeenCalledWith('GOODKEY');
  });
});
