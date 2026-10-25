import React from 'react';
import { IPC, type CamerasSnapshot } from '@shared/ipc';
import { CAMERA_RTMP_PORT, CAMERA_WEB_PORT } from '@shared/cameras';

export const EMPTY_CAMERAS: CamerasSnapshot = {
  enabled: false, state: 'off', lanView: true, rtmpPort: CAMERA_RTMP_PORT, webPort: CAMERA_WEB_PORT,
  hosts: [], host: null, rtmpUrl: null, srtUrl: null, pairUri: null, pairQr: null, cameras: []
};

export function useCameras() {
  const [snap, setSnap] = React.useState<CamerasSnapshot>(EMPTY_CAMERAS);
  React.useEffect(() => {
    let alive = true;
    let pushSeen = false;
    const off = window.api.on(IPC.camerasChanged, (s) => {
      pushSeen = true;
      setSnap(s as CamerasSnapshot);
    });
    void window.api.cameras.snapshot().then((s) => { if (alive && !pushSeen) setSnap(s); });
    return () => { alive = false; off(); };
  }, []);
  return snap;
}
