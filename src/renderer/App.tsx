import React from 'react';
import type { AppConfig } from '@shared/ipc';
import { Titlebar } from './shell/Titlebar';
import { Sidebar } from './shell/Sidebar';
import { Topbar } from './shell/Topbar';
import { Statusbar } from './shell/Statusbar';
import { SCREENS, type ScreenId } from './shell/nav';
import { ErrorBoundary } from './shell/ErrorBoundary';
import { useObs } from './state/useObs';
import { useRelay } from './state/useRelay';
import { useAccount } from './state/account';
import { useTwitch } from './state/useTwitch';
import { computeStreamLive } from './state/streamLive';

export function App({ initialConfig }: { initialConfig: AppConfig }) {
  const [screen, setScreen] = React.useState<ScreenId>('dashboard');
  const [sidebarExpanded] = React.useState(initialConfig.sidebarExpanded ?? true);

  const { status, outputs } = useObs();
  const relay = useRelay();
  const { account } = useAccount();
  const twitch = useTwitch();
  const obsState = status.state;
  // Twitch is the source of truth when reachable; OBS streaming is the fallback
  // when it isn't. The stale persisted `stream_status` variable is deliberately ignored.
  const streamLive = computeStreamLive({
    twitchReachable: twitch.reachable,
    twitchOnline: twitch.online,
    obsStreaming: outputs?.streaming ?? false
  });
  const relayConnected = relay.status.state === 'connected';

  const ScreenComponent = SCREENS[screen].component;

  return (
    <div className="app-window">
      <Titlebar screen={screen} />
      <div className="app-main">
        <Sidebar expanded={sidebarExpanded} active={screen} onSelect={setScreen} obsState={obsState} account={account} />
        <div className="content">
          <Topbar screen={screen} obsState={obsState} streamLive={streamLive} onObsPillClick={() => setScreen('obs')} />
          {/* Keyed by screen so the boundary resets on navigation: a screen that
              threw is retried fresh when the user navigates away and back, and
              an error in one screen never blanks the shell/navigation. */}
          <ErrorBoundary key={screen}>
            <ScreenComponent />
          </ErrorBoundary>
          <Statusbar obsState={obsState} obsUrl={status.url} streamLive={streamLive} relayConnected={relayConnected} />
        </div>
      </div>
    </div>
  );
}
