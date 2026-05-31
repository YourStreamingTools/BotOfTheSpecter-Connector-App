import React from 'react';
import { APP_VERSION, SPECTER_WEBSOCKET_URI } from '@shared/constants';

type ObsState = 'connected' | 'connecting' | 'disconnected' | 'error';

const formatNow = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export function Statusbar({ obsState, obsUrl, streamLive, relayConnected = false }: { obsState: ObsState; obsUrl?: string; streamLive: boolean; relayConnected?: boolean }) {
  const obsText: Record<ObsState, string> = {
    connected: obsUrl ?? 'connected',
    connecting: 'connecting…',
    disconnected: 'not connected',
    error: 'connection failed'
  };
  const dotClass = obsState === 'connected' ? 'good' : obsState === 'connecting' ? 'warn' : obsState === 'error' ? 'bad' : '';
  // Tick the clock instead of freezing at first render. 30s keeps the HH:MM display fresh.
  const [now, setNow] = React.useState(formatNow);
  React.useEffect(() => {
    const id = setInterval(() => setNow(formatNow()), 30_000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="statusbar">
      <span className="sb-stat"><span className={`dot ${dotClass}`} /><b>OBS</b> {obsText[obsState]}</span>
      <span className="sb-sep" />
      <span className="sb-stat"><span className={`dot ${relayConnected ? 'good' : ''}`} /><b>WebSocket</b> {relayConnected ? SPECTER_WEBSOCKET_URI.replace('https://', 'wss://') : 'disconnected'}</span>
      <span className="sb-sep" />
      <span className="sb-stat"><span className={`dot ${streamLive ? 'bad' : ''}`} /><b>Stream</b> {streamLive ? 'LIVE' : 'offline'}</span>
      <span className="right">
        <span className="sb-stat"><b>v{APP_VERSION}</b></span>
        <span className="sb-sep" />
        <span className="sb-stat" data-testid="sb-clock">{now}</span>
      </span>
    </div>
  );
}
