import React from 'react';
import { IPC, type TimersSnapshot } from '@shared/ipc';

export function useTimers() {
  const [snap, setSnap] = React.useState<TimersSnapshot>({ timers: [], state: 'idle' });
  React.useEffect(() => {
    let alive = true;
    // Subscribe before the snapshot so a 'changed' push during the round-trip isn't lost.
    const off = window.api.on(IPC.timersChanged, (s) => setSnap(s as TimersSnapshot));
    void window.api.timers.snapshot().then((s) => { if (alive) setSnap(s); });
    return () => { alive = false; off(); };
  }, []);
  return snap;
}
