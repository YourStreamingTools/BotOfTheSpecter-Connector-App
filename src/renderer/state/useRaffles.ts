import React from 'react';
import { IPC, type RafflesSnapshot } from '@shared/ipc';

export function useRaffles() {
  const [snap, setSnap] = React.useState<RafflesSnapshot>({ raffles: [], state: 'idle' });
  React.useEffect(() => {
    let alive = true;
    // Subscribe before the snapshot so a 'changed' push during the round-trip isn't lost.
    const off = window.api.on(IPC.rafflesChanged, (s) => setSnap(s as RafflesSnapshot));
    void window.api.raffles.snapshot().then((s) => { if (alive) setSnap(s); });
    return () => { alive = false; off(); };
  }, []);
  return snap;
}
