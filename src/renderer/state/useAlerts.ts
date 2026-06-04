import React from 'react';
import { IPC, type Alert } from '@shared/ipc';

const CAP = 200;

/** Live alert feed (newest-first); subscribes before the main-process snapshot so an alert arriving during the round-trip isn't lost, then merges by id (capped at 200). */
export function useAlerts(): Alert[] {
  const [alerts, setAlerts] = React.useState<Alert[]>([]);
  React.useEffect(() => {
    let alive = true;
    const off = window.api.on(IPC.alert, (a) =>
      setAlerts((prev) => [a as Alert, ...prev].slice(0, CAP))
    );
    void window.api.alerts.snapshot().then((snap) => {
      if (!alive) return;
      setAlerts((live) => {
        const seen = new Set(live.map((a) => a.id));
        // snapshot is newest-first; keep any live items that arrived first and aren't in it.
        return [...live, ...snap.alerts.filter((a) => !seen.has(a.id))].slice(0, CAP);
      });
    });
    return () => { alive = false; off(); };
  }, []);
  return alerts;
}
