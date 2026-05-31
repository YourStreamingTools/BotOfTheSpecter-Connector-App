import React from 'react';
import { useObs } from '../state/useObs';
import { useRelay } from '../state/useRelay';
import { useVariables } from '../state/useVariables';
import { useLogs } from '../state/useLogs';
import { useBotStatus } from '../state/useBotStatus';
import { useTwitch } from '../state/useTwitch';
import { computeStreamLive } from '../state/streamLive';
import { IconEye, IconHeart, IconGift, IconCommands, IconFilter, IconDot } from '../icons';
import type { LogSource } from '@shared/ipc';

const LOG_SOURCES: LogSource[] = ['OBS', 'TWITCH', 'WS', 'BOT', 'APP'];

export function ScreenDashboard() {
  const obs = useObs();
  const relay = useRelay();
  const { values, counters, resetSession } = useVariables();
  const log = useLogs();
  const bot = useBotStatus();
  const twitch = useTwitch();

  // Twitch wins when reachable; OBS streaming is the fallback when it isn't.
  // The persisted `stream_status` variable can be stale across sessions, so it's ignored.
  const streamOnline = computeStreamLive({
    twitchReachable: twitch.reachable,
    twitchOnline: twitch.online,
    obsStreaming: obs.outputs?.streaming ?? false
  });
  const currentGame = twitch.game || (values.current_game ? String(values.current_game) : '');
  const obsState = obs.status.state;
  const num = (k: string) => Number(counters[k] ?? 0).toLocaleString();

  const [filterOpen, setFilterOpen] = React.useState(false);
  const [activeSrc, setActiveSrc] = React.useState<Set<LogSource>>(() => new Set(LOG_SOURCES));
  const filtering = activeSrc.size < LOG_SOURCES.length;
  const shown = filtering ? log.filter((e) => activeSrc.has(e.src)) : log;
  const toggleSrc = (s: LogSource) => setActiveSrc((prev) => {
    const next = new Set(prev);
    if (next.has(s)) next.delete(s); else next.add(s);
    return next;
  });

  // Manual session reset (for when the app wasn't open at go-live). Two-click confirm.
  const [confirmReset, setConfirmReset] = React.useState(false);
  const resetTimer = React.useRef<number>();
  React.useEffect(() => () => window.clearTimeout(resetTimer.current), []);
  const handleResetSession = () => {
    if (confirmReset) {
      window.clearTimeout(resetTimer.current);
      setConfirmReset(false);
      void resetSession();
    } else {
      setConfirmReset(true);
      resetTimer.current = window.setTimeout(() => setConfirmReset(false), 3000);
    }
  };

  return (
    <div className="screen" style={{ position: 'relative', display: 'flex', flexDirection: 'column' }}>
      <div className="ambient" style={{ width: 520, height: 520, background: 'var(--primary)', top: -180, right: -120, opacity: 0.25 }} />

      {/* Status row */}
      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14, flexShrink: 0 }}>
        <div className={`status-card ${streamOnline ? 'live' : 'offline'}`}>
          <div className="title">Stream Status</div>
          <div className="row"><span className="dot" /><span className="label">{streamOnline ? 'LIVE' : 'OFFLINE'}</span></div>
          <div className="meta">
            {currentGame ? <div className="game">{currentGame}</div> : <div className="row-meta"><b>Game:</b><span>—</span></div>}
          </div>
        </div>
        <div className={`status-card ${bot.running ? 'online' : 'offline'}`}>
          <div className="title">Bot Status</div>
          <div className="row"><span className="dot" /><span className="label">{bot.running ? 'RUNNING' : 'OFFLINE'}</span></div>
          <div className="meta">
            <div className="row-meta"><b>Type:</b><span>{bot.botType ? bot.botType.charAt(0).toUpperCase() + bot.botType.slice(1) : '—'}</span></div>
            <div className="row-meta"><b>Version:</b><span>{bot.version ?? '—'}{bot.outdated && bot.latestVersion ? <span className="chip warn" style={{ height: 16, marginLeft: 6 }}>update → {bot.latestVersion}</span> : null}</span></div>
            {bot.pid ? <div className="row-meta"><b>PID:</b><span className="mono">{bot.pid}</span></div> : null}
          </div>
        </div>
        <div className={`status-card ${obsState === 'connected' ? 'online' : obsState === 'connecting' ? 'live' : 'offline'}`}>
          <div className="title">OBS Studio</div>
          <div className="row"><span className="dot" /><span className="label">{obsState === 'connected' ? 'LINKED' : obsState === 'connecting' ? 'LINKING' : obsState === 'error' ? 'ERROR' : 'OFFLINE'}</span></div>
          <div className="meta">
            {obsState === 'connected' ? (
              <>
                <div className="row-meta"><b>Scene:</b><span style={{ color: 'var(--secondary)' }}>{obs.scenes?.current ?? '—'}</span></div>
                <div className="row-meta"><b>Events:</b><span>{obs.status.eventsForwarded} forwarded</span></div>
              </>
            ) : (
              <div className="row-meta"><b>Action:</b><span style={{ color: 'var(--primary)' }}>Connect from OBS tab →</span></div>
            )}
          </div>
        </div>
      </div>

      {/* KPI tiles */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 14, flexShrink: 0 }}>
        <div className="stat-tile"><div className="lbl"><IconEye size={12} />Viewers</div><div className="val">{twitch.online && twitch.viewers !== undefined ? twitch.viewers.toLocaleString() : '—'}</div><div className="delta">{twitch.online ? 'watching now' : 'offline'}</div></div>
        <div className="stat-tile"><div className="lbl"><IconHeart size={12} />Follows</div><div className="val">{num('session_followers')}</div><div className="delta">this session</div></div>
        <div className="stat-tile"><div className="lbl"><IconGift size={12} />Subs / Bits</div><div className="val">{num('session_subs')} <span style={{ color: 'var(--text-mute)', fontSize: 16 }}>· {num('session_bits')}</span></div><div className="delta">this session</div></div>
        <div className="stat-tile"><div className="lbl"><IconCommands size={12} />Redemptions</div><div className="val">{num('session_redemptions')}</div><div className="delta">this session</div></div>
      </div>

      {/* Activity + side column — flexes to fill the remaining viewport height */}
      <div className="grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)', gap: 14, flex: 1, minHeight: 0 }}>
        <div className="card" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div className="card-head" style={{ flexShrink: 0 }}>
            <h3>Live Activity</h3>
            <span className="chip" style={{ marginLeft: 'auto' }}>last {Math.min(shown.length, 100)} events</span>
            <button className="btn btn-sm btn-ghost" style={{ color: filterOpen ? 'var(--text)' : undefined }}
                    onClick={() => setFilterOpen((o) => !o)}>
              <IconFilter size={12} />Filter{filtering ? ` · ${activeSrc.size}/${LOG_SOURCES.length}` : ''}
            </button>
          </div>
          {filterOpen && (
            <div className="row" style={{ flexWrap: 'wrap', gap: 6, padding: '2px 0 10px', flexShrink: 0 }}>
              {LOG_SOURCES.map((s) => {
                const on = activeSrc.has(s);
                return (
                  <button key={s} type="button" className={`chip ${on ? 'good' : ''}`}
                          style={{ cursor: 'pointer', opacity: on ? 1 : 0.45 }} onClick={() => toggleSrc(s)}>{s}</button>
                );
              })}
              <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button type="button" className="chip" style={{ cursor: 'pointer' }} onClick={() => setActiveSrc(new Set(LOG_SOURCES))}>All</button>
                <button type="button" className="chip" style={{ cursor: 'pointer' }} onClick={() => setActiveSrc(new Set())}>None</button>
              </span>
            </div>
          )}
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
            {shown.length === 0 && <div className="dim" style={{ fontSize: 12, padding: '8px 4px' }}>{log.length === 0 ? 'No activity yet. Connect OBS and the bot relay.' : 'No events match the current filter.'}</div>}
            {shown.slice(0, 100).map((e) => (
              // Stable content key — array index would shift on every newest-first prepend.
              <div className="log-line" key={`${e.t}|${e.src}|${e.message}`}>
                <span className="t">{e.t}</span>
                <span className={`lvl ${e.level}`}>{e.src}</span>
                <span className="msg">{e.message}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="col" style={{ gap: 14, alignSelf: 'start' }}>
          <div className="card">
            <div className="card-head"><h3>Quick Actions</h3></div>
            <div className="col" style={{ gap: 12 }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12.5 }}>Lock OBS commands</span>
                <span className="toggle" data-on={relay.status.locked ? 'true' : 'false'} onClick={() => void relay.actions.setLock(!relay.status.locked)} />
              </div>
              <div className="col" style={{ gap: 6 }}>
                <button className={`btn btn-sm ${confirmReset ? 'btn-danger' : ''}`} onClick={handleResetSession}>
                  {confirmReset ? 'Click again to reset' : 'Reset session counters'}
                </button>
                <span className="dim" style={{ fontSize: 11 }}>
                  Auto-resets when you go live. Use this if the app wasn’t open then — totals are kept.
                </span>
              </div>
            </div>
          </div>
          <div className="card">
            <div className="card-head"><h3>System</h3>
              <span className={`chip ${relay.status.state === 'connected' && obsState === 'connected' ? 'good' : 'warn'}`} style={{ marginLeft: 'auto' }}><IconDot size={10} />{relay.status.state === 'connected' ? 'relay up' : 'relay down'}</span>
            </div>
            <div className="col" style={{ gap: 8 }}>
              {[
                ['Bot relay', relay.status.state === 'connected'],
                ['OBS bridge', obsState === 'connected']
              ].map(([name, ok]) => (
                <div key={String(name)} className="row" style={{ gap: 10 }}>
                  <span style={{ fontSize: 12, flex: 1 }}>{name}</span>
                  <span className="chip" style={{ height: 18, borderColor: ok ? 'var(--success)' : 'var(--border)', color: ok ? '#7ee5a4' : 'var(--text-mute)' }}>{ok ? 'connected' : 'offline'}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
