import React from 'react';
import { IPC, type ChannelPointsSnapshot } from '@shared/ipc';

export function useChannelPoints(): ChannelPointsSnapshot {
  const [snap, setSnap] = React.useState<ChannelPointsSnapshot>({ rewards: [], state: 'idle' });
  React.useEffect(() => {
    let alive = true;
    // Subscribe before the snapshot so a 'changed' push during the round-trip isn't lost.
    const off = window.api.on(IPC.channelPointsChanged, (s) => setSnap(s as ChannelPointsSnapshot));
    void window.api.channelPoints.snapshot().then((s) => { if (alive) setSnap(s); });
    return () => { alive = false; off(); };
  }, []);
  return snap;
}
