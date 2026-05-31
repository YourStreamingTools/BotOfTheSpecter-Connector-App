import React from 'react';
import { IPC, type RelayStatus } from '@shared/ipc';

export function useRelay() {
  const [status, setStatus] = React.useState<RelayStatus>({ state: 'disconnected', registered: false, locked: false, hasApiKey: false });
  React.useEffect(() => {
    let alive = true;
    // Seed from the current status so a connect that happened before this hook
    // mounted (e.g. auto-connect during bootstrap) is reflected, not just future pushes.
    void window.api.relay.snapshot().then((s) => { if (alive) setStatus(s); });
    const off = window.api.on(IPC.relayStatus, (s) => setStatus(s as RelayStatus));
    return () => { alive = false; off(); };
  }, []);
  const actions = React.useMemo(() => ({
    setLock: (v: boolean) => window.api.relay.setLock(v),
    setApiKey: (k: string) => window.api.relay.setApiKey(k),
    connect: () => window.api.relay.connect(),
    disconnect: () => window.api.relay.disconnect()
  }), []);
  return { status, actions };
}
