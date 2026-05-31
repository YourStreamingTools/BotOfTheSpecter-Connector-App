import { SCREEN_TITLES, type ScreenId } from './nav';

type ObsState = 'connected' | 'connecting' | 'disconnected' | 'error';

export function Topbar({
  screen, obsState, streamLive, onObsPillClick
}: {
  screen: ScreenId;
  obsState: ObsState;
  streamLive: boolean;
  onObsPillClick?: () => void;
}) {
  const meta = SCREEN_TITLES[screen];
  const obsLabels: Record<ObsState, string> = {
    connected: 'OBS Connected',
    connecting: 'OBS Connecting…',
    disconnected: 'OBS Disconnected',
    error: 'OBS Error'
  };
  return (
    <div className="topbar">
      <div>
        <div className="tb-screen">{meta.t}<small>{meta.s}</small></div>
      </div>
      <div className="tb-spacer" />
      {streamLive && <div className="live-pill">LIVE</div>}
      <div
        className="status-pill"
        data-state={obsState}
        title="Open OBS Control"
        role="button"
        tabIndex={0}
        onClick={onObsPillClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onObsPillClick?.(); } }}
      >
        <span className="dot" />
        <span>{obsLabels[obsState]}</span>
      </div>
    </div>
  );
}
