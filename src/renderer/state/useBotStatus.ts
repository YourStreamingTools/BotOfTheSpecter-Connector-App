import React from 'react';
import { IPC, type BotStatus } from '@shared/ipc';

export function useBotStatus() {
  const [status, setStatus] = React.useState<BotStatus>({ running: false, reachable: false });
  React.useEffect(() => {
    let alive = true;
    void window.api.bot.snapshot().then((s) => { if (alive) setStatus(s); });
    const off = window.api.on(IPC.botStatus, (s) => setStatus(s as BotStatus));
    return () => { alive = false; off(); };
  }, []);
  return status;
}
