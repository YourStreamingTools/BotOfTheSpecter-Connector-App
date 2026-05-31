import React from 'react';
import type { useObs } from '../../state/useObs';
import { IconCopy, IconDot } from '../../icons';

type Obs = ReturnType<typeof useObs>;

export function EventsTab({ obs }: { obs: Obs }) {
  // Memoize so the (potentially large) join only recomputes when the log changes —
  // not on every 30 Hz audio-meter re-render of the shared OBS context.
  const text = React.useMemo(
    () => obs.log.map((l) => `[${l.t}] ← ${l.type.padEnd(28)} ${l.message}`).join('\n'),
    [obs.log]
  );
  return (
    <div className="card" style={{ background: 'var(--bg-deep)', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, minWidth: 0 }}>
      <div className="card-head" style={{ flexShrink: 0 }}>
        <h3>Raw WebSocket Events</h3>
        <span className="chip secondary" style={{ marginLeft: 'auto' }}><IconDot size={10} />streaming</span>
        <button className="btn btn-sm btn-ghost" onClick={() => void navigator.clipboard?.writeText(text)}>
          <IconCopy size={11} />Copy
        </button>
      </div>
      <pre style={{ margin: 0, padding: 14, background: '#000', borderRadius: 10, fontFamily: 'var(--font-mono)', fontSize: 11.5, lineHeight: 1.65, color: '#a8b2d1', flex: 1, minHeight: 0, overflow: 'auto' }}>
        {obs.log.length === 0 ? 'Waiting for OBS events…' : text}
      </pre>
    </div>
  );
}
