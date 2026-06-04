import React from 'react';
import { IPC, type SoundboardSnapshot } from '@shared/ipc';

export function useSoundboard() {
  const [snap, setSnap] = React.useState<SoundboardSnapshot>({ sounds: [], state: 'idle' });
  React.useEffect(() => {
    let alive = true;
    // Subscribe before requesting the snapshot so a 'changed' push during the round-trip isn't lost.
    const off = window.api.on(IPC.soundboardChanged, (s) => setSnap(s as SoundboardSnapshot));
    void window.api.soundboard.snapshot().then((s) => { if (alive) setSnap(s); });
    return () => { alive = false; off(); };
  }, []);
  return snap;
}
