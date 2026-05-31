import React from 'react';
import { useVariables } from '../state/useVariables';

export function ScreenVariables() {
  const { values, counters } = useVariables();
  const [filter, setFilter] = React.useState('');

  const rows = [
    ...Object.entries(values).map(([name, v]) => ({ name, value: String(v), counter: false })),
    ...Object.entries(counters).map(([name, v]) => ({ name, value: String(v), counter: true }))
  ].filter((r) => !filter || r.name.toLowerCase().includes(filter.toLowerCase()) || r.value.toLowerCase().includes(filter.toLowerCase()))
   .sort((a, b) => a.name.localeCompare(b.name));

  const counterCount = Object.keys(counters).length;
  const valueCount = Object.keys(values).length;

  return (
    <div className="screen">
      <div className="section-head" style={{ marginTop: 0 }}>
        <h2>Real-time event data</h2>
        <input className="input" placeholder="Filter variables…" style={{ width: 220 }} value={filter} onChange={(e) => setFilter(e.target.value)} />
      </div>
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-mute)', fontWeight: 700 }}>
          <span>Variable</span><span>Value</span>
        </div>
        <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
          {rows.map((r) => (
            <div key={r.name} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0, padding: '8px 14px', borderBottom: '1px solid var(--border-soft)', alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, fontWeight: r.counter ? 700 : 500 }}>
                {r.name}{r.counter && <span className="chip secondary" style={{ height: 18, marginLeft: 8 }}>counter</span>}
              </span>
              <span className="mono" style={{ fontSize: 12, color: 'var(--text-dim)' }}>{r.value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Variables: {valueCount} · Counters: {counterCount}</div>
    </div>
  );
}
