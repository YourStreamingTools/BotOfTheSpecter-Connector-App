import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { AccountProvider, useAccount } from './account';

const acct = {
  id: 2, username: 'teststreamer', displayName: 'TestStreamer', twitchUserId: '1234567',
  isAdmin: false, betaAccess: false, isTechnical: false
};

beforeEach(() => {
  window.api.config = { ...window.api.config, get: vi.fn().mockResolvedValue(undefined) };
  window.api.auth = { validateKey: vi.fn(), account: vi.fn().mockResolvedValue(acct) };
});

function Probe() {
  const { account, refresh, clear } = useAccount();
  return (
    <div>
      <span data-testid="u">{account?.username ?? 'none'}</span>
      <button onClick={() => void refresh('K')}>refresh</button>
      <button onClick={() => clear()}>clear</button>
    </div>
  );
}

describe('AccountProvider', () => {
  it('loads the account on mount when a key is saved', async () => {
    window.api.config.get = vi.fn().mockResolvedValue('SAVED');
    render(<AccountProvider><Probe /></AccountProvider>);
    expect(await screen.findByText('teststreamer')).toBeInTheDocument();
    expect(window.api.auth.account).toHaveBeenCalledWith('SAVED');
  });

  it('does not load when no key is saved', async () => {
    render(<AccountProvider><Probe /></AccountProvider>);
    await act(async () => {});
    expect(screen.getByTestId('u').textContent).toBe('none');
    expect(window.api.auth.account).not.toHaveBeenCalled();
  });

  it('refresh populates the account and clear resets it', async () => {
    render(<AccountProvider><Probe /></AccountProvider>);
    await act(async () => { screen.getByText('refresh').click(); });
    expect(screen.getByTestId('u').textContent).toBe('teststreamer');
    await act(async () => { screen.getByText('clear').click(); });
    expect(screen.getByTestId('u').textContent).toBe('none');
  });
});
