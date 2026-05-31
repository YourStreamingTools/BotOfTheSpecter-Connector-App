import React from 'react';
import { IPC, type TwitchStatus } from '@shared/ipc';

export function useTwitch() {
  const [status, setStatus] = React.useState<TwitchStatus>({ reachable: false, online: false });
  React.useEffect(() => {
    let alive = true;
    void window.api.twitch.snapshot().then((s) => { if (alive) setStatus(s); });
    const off = window.api.on(IPC.twitchStatus, (s) => setStatus(s as TwitchStatus));
    return () => { alive = false; off(); };
  }, []);
  return status;
}
