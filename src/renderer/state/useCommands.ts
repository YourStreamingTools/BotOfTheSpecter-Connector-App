import React from 'react';
import { IPC, type CommandsSnapshot } from '@shared/ipc';

const EMPTY: CommandsSnapshot = { builtin: [], custom: [], user: [], state: 'idle' };

/**
 * Subscribe to the CommandsService snapshot. Seeds from the current snapshot on mount
 * (so the screen renders even if the boot-time refresh already finished) and updates
 * on the 'changed' push when refresh completes.
 */
export function useCommands(): { snap: CommandsSnapshot; refresh: () => Promise<void> } {
  const [snap, setSnap] = React.useState<CommandsSnapshot>(EMPTY);

  React.useEffect(() => {
    let alive = true;
    void window.api.commands.snapshot().then((s) => { if (alive) setSnap(s); });
    const off = window.api.on(IPC.commandsChanged, (s) => setSnap(s as CommandsSnapshot));
    return () => { alive = false; off(); };
  }, []);

  const refresh = React.useCallback(() => window.api.commands.refresh(), []);
  return { snap, refresh };
}
