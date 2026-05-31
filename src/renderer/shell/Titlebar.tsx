import { ICON_URL } from '@shared/constants';
import { SCREEN_TITLES, type ScreenId } from './nav';

export function Titlebar({ screen }: { screen: ScreenId }) {
  const meta = SCREEN_TITLES[screen];
  const isMac = window.api.platform === 'darwin';

  return (
    <div className="titlebar">
      {isMac && (
        <div className="tb-lights">
          <button className="tb-light close" aria-label="Close" onClick={() => window.api.window.close()} />
          <button className="tb-light min" aria-label="Minimize" onClick={() => window.api.window.minimize()} />
          <button className="tb-light max" aria-label="Maximize" onClick={() => window.api.window.maximize()} />
        </div>
      )}

      {/* Brand mark in the top-left. On macOS it sits to the right of the traffic lights;
          on Windows / Linux it's the very first element. CSP allows https img-src so the
          CDN URL works without bundling the asset into the renderer. */}
      <img
        src={ICON_URL}
        alt=""
        width={18}
        height={18}
        style={{ marginLeft: isMac ? 8 : 12, marginRight: 4, borderRadius: 4, flexShrink: 0 }}
        draggable={false}
      />

      <div className="tb-title">
        <b>BotOfTheSpecter</b>
        <span>Desktop</span>
        <span className="sep">·</span>
        <span>{meta.t}</span>
      </div>

      <div className="tb-right">
        {!isMac && (
          <div className="tb-winctrls">
            <button className="tb-winbtn" aria-label="Minimize" onClick={() => window.api.window.minimize()}>
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M0 5 H10" stroke="currentColor" strokeWidth="1" />
              </svg>
            </button>
            <button className="tb-winbtn" aria-label="Maximize" onClick={() => window.api.window.maximize()}>
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" />
              </svg>
            </button>
            <button className="tb-winbtn close" aria-label="Close" onClick={() => window.api.window.close()}>
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <path d="M0 0 L10 10 M10 0 L0 10" stroke="currentColor" strokeWidth="1" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
