import React from 'react';
import { useLogs } from '../state/useLogs';
import type { LogEntry, LogSource } from '@shared/ipc';
import { IconCopy } from '../icons';

type Filter = 'all' | 'OBS' | 'TWITCH' | 'WS' | 'BOT' | 'err';
const FILTERS: [Filter, string][] = [
  ['all', 'All'], ['OBS', 'OBS'], ['TWITCH', 'Twitch'], ['WS', 'WebSocket'], ['BOT', 'Bot'], ['err', 'Errors']
];
const srcColor: Record<LogSource, string> = {
  OBS: 'var(--primary)', WS: 'var(--secondary)', TWITCH: '#9146ff', BOT: 'var(--info)', APP: 'var(--text-mute)'
};
const lvlColor: Record<string, string> = {
  ok: 'var(--success)', err: 'var(--error)', warn: 'var(--warning)', info: 'var(--info)', evt: 'var(--primary)'
};

export function ScreenLogs() {
  const all = useLogs();
  const [filter, setFilter] = React.useState<Filter>('all');
  const [grep, setGrep] = React.useState('');
  const [copied, setCopied] = React.useState<'ok' | 'err' | null>(null);
  React.useEffect(() => {
    if (!copied) return;
    const id = setTimeout(() => setCopied(null), 1500);
    return () => clearTimeout(id);
  }, [copied]);

  const lines = all.filter((l) => {
    if (filter === 'err') return (l.level === 'err' || l.level === 'warn') && (!grep || l.message.toLowerCase().includes(grep.toLowerCase()));
    if (filter !== 'all' && l.src !== filter) return false;
    return grep ? l.message.toLowerCase().includes(grep.toLowerCase()) : true;
  });
  const count = (f: Filter) => all.filter((l) => f === 'all' ? true : f === 'err' ? (l.level === 'err' || l.level === 'warn') : l.src === f).length;
  const copy = (l: LogEntry[]) => {
    const text = l.map((e) => `[${e.t}] ${e.src} ${e.level.toUpperCase()} ${e.message}`).join('\n');
    const p = navigator.clipboard?.writeText(text);
    if (!p) { setCopied('err'); return; } // no clipboard API available
    p.then(() => setCopied('ok')).catch(() => setCopied('err'));
  };

  return (
    <div className="screen">
      <div className="row" style={{ marginBottom: 14, gap: 10, flexWrap: 'wrap' }}>
        {FILTERS.map(([id, label]) => (
          <button key={id} className="btn btn-sm" onClick={() => setFilter(id)} style={{
            background: filter === id ? 'var(--primary-soft)' : 'var(--bg-elev)',
            borderColor: filter === id ? 'var(--primary)' : 'var(--border)',
            color: filter === id ? 'var(--text)' : 'var(--text-dim)'
          }}>{label} <span className="mono" style={{ marginLeft: 4, opacity: 0.6 }}>{count(id)}</span></button>
        ))}
        <div className="tb-spacer" />
        <input className="input" placeholder="grep…" style={{ width: 200 }} value={grep} onChange={(e) => setGrep(e.target.value)} />
        <button className="btn btn-sm" onClick={() => copy(lines)}>
          <IconCopy size={11} />{copied === 'ok' ? 'Copied' : copied === 'err' ? 'Copy failed' : 'Copy'}
        </button>
      </div>
      <div className="card" style={{ padding: 0, background: 'var(--bg-deep)', overflow: 'hidden' }}>
        <div style={{ maxHeight: 'calc(100vh - 260px)', overflowY: 'auto', padding: '4px 14px' }}>
          {lines.length === 0 && <div className="dim" style={{ padding: 16, fontSize: 12 }}>No events yet.</div>}
          {lines.map((l) => (
            // Stable content key so prepending newer lines doesn't re-mount every row (array index would shift).
            <div key={`${l.t}|${l.src}|${l.level}|${l.message}`} className="log-line" style={{ gridTemplateColumns: '110px 70px 70px 1fr' }}>
              <span className="t">{l.t}</span>
              <span style={{ color: srcColor[l.src] ?? 'var(--text-mute)', fontWeight: 700, fontSize: 10.5, letterSpacing: '0.04em' }}>{l.src}</span>
              <span style={{ color: lvlColor[l.level], fontWeight: 700, fontSize: 10.5, letterSpacing: '0.04em' }}>{l.level.toUpperCase()}</span>
              <span className="msg">{l.message}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
