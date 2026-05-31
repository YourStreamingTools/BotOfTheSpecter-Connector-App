import React from 'react';
import type { useObs } from '../../state/useObs';
import { IconCam, IconMic, IconMicOff } from '../../icons';

type Obs = ReturnType<typeof useObs>;

export function PreviewTab({ obs }: { obs: Obs }) {
  const scene = obs.scenes?.current ?? '—';
  const audio = obs.audio;
  const stats = obs.stats;
  const meters = obs.audioMeters;

  // Refresh the audio mixer whenever the Preview tab is opened.
  React.useEffect(() => { void obs.actions.refreshAudio(); }, [obs.actions]);

  // Index meter levels by input name for O(1) lookup in the source row.
  const meterByName = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const x of meters) m.set(x.name, x.peakDb);
    return m;
  }, [meters]);

  return (
    <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 14, flex: 1, minWidth: 0, minHeight: 0 }}>
      <div className="card" style={{ padding: 12, display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <div style={{ aspectRatio: '16 / 9', background: '#000', borderRadius: 10, position: 'relative', overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(135deg, #14152040 0 12px, #1f2240 12px 24px)' }} />
          <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'var(--text-mute)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
            <div style={{ textAlign: 'center' }}>
              <IconCam size={32} style={{ opacity: 0.4 }} />
              <div style={{ marginTop: 8 }}>Program scene · {scene}</div>
              <div style={{ opacity: 0.5, fontSize: 11, marginTop: 2 }}>
                {stats ? `${stats.activeFps} fps · ${stats.streamBitrateKbps} kbps · CPU ${stats.cpuUsage}%` : 'live video preview not available over WebSocket'}
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="card-head" style={{ flexShrink: 0 }}><h3>Audio Sources</h3>
          <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={() => void obs.actions.refreshAudio()}>Refresh</button>
        </div>
        <div className="col" style={{ gap: 10, flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
          {audio === null && <span className="dim" style={{ fontSize: 12 }}>Loading audio sources…</span>}
          {audio && audio.length === 0 && <span className="dim" style={{ fontSize: 12 }}>No audio sources found.</span>}
          {audio && audio.map((a) => {
            // Muted inputs read as silent for the meter — OBS still emits levels
            // post-mute on some kinds, and a meter on a muted row is misleading.
            const peakDb = a.muted ? -100 : (meterByName.get(a.name) ?? -100);
            return (
              <div key={a.name} className="col" style={{ gap: 4 }}>
                <div className="row" style={{ justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
                  <span className="row" style={{ gap: 8, minWidth: 0 }}>
                    {a.muted
                      ? <IconMicOff size={13} style={{ color: 'var(--error)', flex: '0 0 auto' }} />
                      : <IconMic size={13} style={{ color: 'var(--secondary)', flex: '0 0 auto' }} />}
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={a.name}>{a.name}</span>
                  </span>
                  <span className="row" style={{ gap: 8, flex: '0 0 auto', alignItems: 'center' }}>
                    <span className="mono dim" style={{ fontSize: 11 }}>{a.volumeDb <= -95 ? '−∞ dB' : `${a.volumeDb.toFixed(1)} dB`}</span>
                    <button className={`btn btn-sm ${a.muted ? 'btn-danger' : ''}`}
                            onClick={() => void obs.actions.setInputMute(a.name, !a.muted)}
                            title={a.muted ? 'Unmute' : 'Mute'}>
                      {a.muted ? 'Muted' : 'Live'}
                    </button>
                  </span>
                </div>
                <MeterBar peakDb={peakDb} muted={a.muted} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Visual: -60 dB → empty, 0 dB → full. Green below -20, yellow -20 to -6, red above.
// Muted rows render as a flat dim track so the row layout stays consistent.
function MeterBar({ peakDb, muted }: { peakDb: number; muted: boolean }) {
  const MIN_DB = -60;
  const clamped = Math.max(MIN_DB, Math.min(0, peakDb));
  const pct = ((clamped - MIN_DB) / -MIN_DB) * 100;
  const color = muted
    ? 'var(--surface-3, rgba(255,255,255,0.07))'
    : peakDb >= -6 ? 'var(--error)'
    : peakDb >= -20 ? 'var(--warning)'
    : 'var(--success)';
  return (
    <div style={{
      height: 4, borderRadius: 2, overflow: 'hidden',
      background: 'var(--surface-2, rgba(255,255,255,0.04))',
      border: '1px solid var(--border)'
    }}>
      <div style={{ height: '100%', width: `${pct}%`, background: color, transition: 'width 80ms linear' }} />
    </div>
  );
}
