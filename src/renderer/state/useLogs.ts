import React from 'react';
import { IPC, type LogEntry } from '@shared/ipc';

const CAP = 500;

export function useLogs() {
  const [lines, setLines] = React.useState<LogEntry[]>([]);
  React.useEffect(() => {
    let alive = true;
    // Subscribe BEFORE the snapshot so a line emitted during the round-trip isn't lost.
    const off = window.api.on(IPC.logLine, (e) => setLines((prev) => [e as LogEntry, ...prev].slice(0, CAP)));
    void window.api.logs.snapshot().then((s) => {
      if (!alive) return;
      // Newest-first: lines that arrived during the round-trip are newer than the
      // snapshot history, so they stay in front; the snapshot follows.
      setLines((live) => [...live, ...s].slice(0, CAP));
    });
    return () => { alive = false; off(); };
  }, []);
  return lines;
}
