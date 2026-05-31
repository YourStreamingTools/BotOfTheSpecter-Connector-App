import React from 'react';
import { useObs } from '../state/useObs';
import { ObsDisconnected } from './obs/Disconnected';
import { ObsConnected } from './obs/Connected';
import { OBS_DEFAULT_HOST, OBS_DEFAULT_PORT } from '@shared/constants';

export function ScreenObs() {
  const obs = useObs();
  const [defaults, setDefaults] = React.useState({ host: OBS_DEFAULT_HOST, port: OBS_DEFAULT_PORT, password: '', autoConnect: false });

  React.useEffect(() => {
    void (async () => {
      const cfg = await window.api.config.all();
      setDefaults({
        host: cfg.obs_host ?? OBS_DEFAULT_HOST,
        port: cfg.obs_port ?? OBS_DEFAULT_PORT,
        password: cfg.obs_password ?? '',
        autoConnect: cfg.autoConnectObs ?? false
      });
    })();
  }, []);

  const onConnect = async (p: { host: string; port: number; password: string; autoConnect: boolean }) => {
    await window.api.config.set('obs_host', p.host);
    await window.api.config.set('obs_port', p.port);
    await window.api.config.set('obs_password', p.password);
    await window.api.config.set('autoConnectObs', p.autoConnect);
    await obs.actions.connect({ host: p.host, port: p.port, password: p.password });
  };

  if (obs.status.state === 'connected') {
    return <ObsConnected obs={obs} />;
  }
  return <ObsDisconnected state={obs.status.state} error={obs.status.error} defaults={defaults} onConnect={onConnect} />;
}
