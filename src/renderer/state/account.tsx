import React from 'react';
import type { AccountInfo } from '@shared/ipc';

interface AccountContextValue {
  account: AccountInfo | null;
  /** Fetch the account for a key and store it. Returns the account (or null). */
  refresh: (key: string) => Promise<AccountInfo | null>;
  /** Forget the current account (e.g. after an invalid key). */
  clear: () => void;
}

const AccountContext = React.createContext<AccountContextValue>({
  account: null,
  refresh: async () => null,
  clear: () => {}
});

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = React.useState<AccountInfo | null>(null);

  const refresh = React.useCallback(async (key: string) => {
    const a = key ? await window.api.auth.account(key) : null;
    setAccount(a);
    return a;
  }, []);

  const clear = React.useCallback(() => setAccount(null), []);

  // Load the account for a previously-saved key on startup.
  React.useEffect(() => {
    void window.api.config.get('api_key').then((k) => { if (k) void refresh(k); });
  }, [refresh]);

  const value = React.useMemo(() => ({ account, refresh, clear }), [account, refresh, clear]);
  return <AccountContext.Provider value={value}>{children}</AccountContext.Provider>;
}

export function useAccount() {
  return React.useContext(AccountContext);
}
