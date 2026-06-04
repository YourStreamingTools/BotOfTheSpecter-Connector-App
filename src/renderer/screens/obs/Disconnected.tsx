import React from 'react';
import type { ObsConnectionState } from '@shared/ipc';
import { IconOBS, IconExternal } from '../../icons';

export function ObsDisconnected({
  state, error, defaults, onConnect
}: {
  state: ObsConnectionState;
  error?: string;
  defaults: { host: string; port: number; password: string; autoConnect: boolean };
  onConnect: (p: { host: string; port: number; password: string; autoConnect: boolean }) => void;
}) {
  const [host, setHost] = React.useState(defaults.host);
  const [port, setPort] = React.useState(String(defaults.port));
  const [password, setPassword] = React.useState(defaults.password);
  const [autoConnect, setAutoConnect] = React.useState(defaults.autoConnect);

  // Re-seed fields when async-loaded saved settings arrive after mount (keyed on values so unrelated re-renders don't clobber edits).
  React.useEffect(() => {
    setHost(defaults.host);
    setPort(String(defaults.port));
    setPassword(defaults.password);
    setAutoConnect(defaults.autoConnect);
  }, [defaults.host, defaults.port, defaults.password, defaults.autoConnect]);

  const isError = state === 'error';
  const isConnecting = state === 'connecting';
  // Validate the port instead of silently coercing blank/garbage to 4455.
  const portNum = Number(port);
  const portValid = port.trim() !== '' && Number.isInteger(portNum) && portNum >= 1 && portNum <= 65535;

  return (
    <div className="screen" style={{ position: 'relative' }}>
      <div className="ambient" style={{ width: 600, height: 600, background: 'var(--primary)', top: -200, left: '40%', opacity: 0.18 }} />
      <div style={{ maxWidth: 900, margin: '20px auto 0', position: 'relative' }}>
        <div className="card" style={{ padding: 28, textAlign: 'center', borderColor: isError ? 'var(--error)' : 'var(--border)' }}>
          <div style={{
            width: 72, height: 72, margin: '0 auto 18px', borderRadius: 18,
            background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
            display: 'grid', placeItems: 'center', boxShadow: '0 0 32px var(--primary-glow)', position: 'relative'
          }}>
            <IconOBS size={36} stroke={1.4} style={{ color: 'white' }} />
            {isError && (
              <span style={{
                position: 'absolute', right: -6, bottom: -6, width: 24, height: 24, borderRadius: '50%',
                background: 'var(--error)', display: 'grid', placeItems: 'center',
                border: '3px solid var(--bg-app)', color: 'white', fontWeight: 800, fontSize: 14
              }}>!</span>
            )}
          </div>
          <h2 className="h1" style={{ fontSize: 24, marginBottom: 8 }}>
            {isError ? 'Connection Failed' : isConnecting ? 'Connecting to OBS…' : 'Connect to OBS Studio'}
          </h2>
          <p className="dim" style={{ maxWidth: 540, margin: '0 auto 22px', fontSize: 13.5, lineHeight: 1.55 }}>
            BotOfTheSpecter bridges OBS to the bot's WebSocket. Every scene change, source toggle,
            recording start and stream event is forwarded — so triggers, overlays and chat actions stay in sync.
          </p>
          {isError && (
            <div style={{
              background: 'var(--error-soft)', border: '1px solid var(--error)', borderRadius: 10,
              padding: '10px 14px', fontSize: 12.5, color: '#ff8a7c', maxWidth: 540, margin: '0 auto 22px', textAlign: 'left'
            }}>
              <b style={{ fontWeight: 700 }}>obs-websocket refused the connection.</b><br />
              {error
                ? <span className="mono">{error}</span>
                : 'Check that obs-websocket is enabled in OBS → Tools → WebSocket Server Settings, and that your password matches.'}
            </div>
          )}
        </div>

        <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 14 }}>
          <div className="card">
            <div className="card-head"><h3>Connection</h3></div>
            <div className="col" style={{ gap: 14 }}>
              <div>
                <label className="label-row">Host</label>
                <input className="input mono" value={host} onChange={(e) => setHost(e.target.value)} />
              </div>
              <div className="row" style={{ gap: 10 }}>
                <div style={{ flex: 1 }}>
                  <label className="label-row">Port</label>
                  <input className="input mono" value={port} onChange={(e) => setPort(e.target.value)} aria-invalid={!portValid} />
                  {!portValid && <span className="dim" style={{ color: 'var(--error)', fontSize: 11 }}>Enter a port between 1 and 65535</span>}
                </div>
                <div style={{ flex: 2 }}>
                  <label className="label-row">Password</label>
                  <input className="input mono" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
              </div>
              <div className="row" style={{ gap: 10, justifyContent: 'space-between' }}>
                <label className="row" style={{ gap: 8 }}>
                  <span className="toggle" data-on={autoConnect ? 'true' : 'false'} onClick={() => setAutoConnect((v) => !v)} />
                  <span style={{ fontSize: 12.5 }} className="dim">Auto-connect on launch</span>
                </label>
                <span className="chip">obs-websocket 5.x</span>
              </div>
              <button className="btn btn-primary btn-lg" disabled={isConnecting || !portValid}
                      onClick={() => onConnect({ host, port: portNum, password, autoConnect })}>
                {isConnecting ? 'Connecting…' : 'Connect'}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Getting Started</h3></div>
            <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                ['Open OBS Studio', 'Make sure it’s running on this machine or the host you specified.'],
                ['Enable obs-websocket', 'In OBS → Tools → WebSocket Server Settings, tick “Enable WebSocket server”.'],
                ['Copy your password', 'Click “Show Connect Info” in OBS and paste the password to the left.'],
                ['Connect', 'We’ll forward all events to the BotOfTheSpecter relay.']
              ].map(([t, d], i) => (
                <li key={t} className="row" style={{ alignItems: 'flex-start', gap: 12 }}>
                  <span className="mono" style={{
                    width: 24, height: 24, borderRadius: 8, background: 'var(--primary-soft)', color: 'var(--primary)',
                    border: '1px solid var(--primary)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, flex: '0 0 24px'
                  }}>{i + 1}</span>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{t}</div>
                    <div className="dim" style={{ fontSize: 12, lineHeight: 1.5 }}>{d}</div>
                  </div>
                </li>
              ))}
            </ol>
            <div style={{ marginTop: 16, padding: '10px 12px', background: 'var(--bg-elev)', border: '1px dashed var(--border-light)', borderRadius: 8, fontSize: 12, color: 'var(--text-dim)' }}>
              <IconExternal size={11} style={{ verticalAlign: '-2px', marginRight: 4 }} />
              Find setup guides at <span className="mono" style={{ color: 'var(--primary)' }}>support.botofthespecter.com</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
