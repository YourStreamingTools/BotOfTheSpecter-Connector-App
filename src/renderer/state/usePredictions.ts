import React from 'react';
import { IPC, type PredictionsSnapshot } from '@shared/ipc';

export function usePredictions() {
  const [snap, setSnap] = React.useState<PredictionsSnapshot>({ predictions: [], state: 'idle' });
  React.useEffect(() => {
    let alive = true;
    // Subscribe before the snapshot so a 'changed' push during the round-trip isn't lost.
    const off = window.api.on(IPC.predictionsChanged, (s) => setSnap(s as PredictionsSnapshot));
    void window.api.predictions.snapshot().then((s) => { if (alive) setSnap(s); });
    return () => { alive = false; off(); };
  }, []);
  return snap;
}
