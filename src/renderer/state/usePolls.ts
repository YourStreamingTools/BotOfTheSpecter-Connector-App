import React from 'react';
import { IPC, type PollsSnapshot } from '@shared/ipc';

export function usePolls() {
  const [snap, setSnap] = React.useState<PollsSnapshot>({ polls: [], state: 'idle' });
  React.useEffect(() => {
    let alive = true;
    // Subscribe before the snapshot so a 'changed' push during the round-trip isn't lost.
    const off = window.api.on(IPC.pollsChanged, (s) => setSnap(s as PollsSnapshot));
    void window.api.polls.snapshot().then((s) => { if (alive) setSnap(s); });
    return () => { alive = false; off(); };
  }, []);
  return snap;
}
