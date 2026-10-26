import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ScreenCameras } from './Cameras';
import { IPC, type CameraInfo, type CamerasSnapshot } from '@shared/ipc';

let listeners: Record<string, (...a: unknown[]) => void>;

const base: CamerasSnapshot = {
  enabled: false, state: 'off', lanView: true, rtmpPort: 1935, webPort: 47830,
  hosts: [], host: null, rtmpUrl: null, srtUrl: null, pairUri: null, pairQr: null, cameras: [], firewall: { state: 'unknown' }
};

const cam = (over: Partial<CameraInfo> = {}): CameraInfo => ({
  id: 'main', name: 'Desk Cam', remoteAddr: '192.168.1.40', since: null,
  video: { codec: 'H264', width: 1280, height: 720 }, audio: { codec: 'MPEG-4 Audio' }, audioPlayable: false,
  bitrateKbps: 4000, viewers: 1,
  viewUrl: 'http://192.168.1.20:47830/view/main', localViewUrl: 'http://127.0.0.1:47830/view/main',
  ...over
});

beforeEach(() => {
  listeners = {};
  window.api.on = vi.fn((c: string, cb: (...a: unknown[]) => void) => {
    listeners[c] = cb;
    return () => delete listeners[c];
  });
  window.api.cameras.snapshot = vi.fn().mockResolvedValue(base);
  window.api.cameras.setEnabled = vi.fn().mockResolvedValue(undefined);
  window.api.cameras.addToObs = vi.fn().mockResolvedValue({ ok: true, sourceName: 'Specter Cam - main', sceneName: 'Scene' });
});

const push = (snap: CamerasSnapshot) => act(() => { listeners[IPC.camerasChanged]?.(snap); });

describe('ScreenCameras', () => {
  it('offers to turn the camera server on', async () => {
    render(<ScreenCameras />);
    fireEvent.click(await screen.findByRole('button', { name: /turn on camera server/i }));
    expect(window.api.cameras.setEnabled).toHaveBeenCalledWith(true);
  });

  it('shows the pairing QR and live cameras, and adds one to OBS', async () => {
    render(<ScreenCameras />);
    push({
      ...base, enabled: true, state: 'running', hosts: ['192.168.1.20'], host: '192.168.1.20',
      rtmpUrl: 'rtmp://192.168.1.20:1935/camera', pairUri: 'specter-cam://local?v=1', pairQr: 'data:image/png;base64,AA==',
      cameras: [cam()]
    });
    expect(screen.getByAltText(/pairing qr code/i)).toHaveAttribute('src', 'data:image/png;base64,AA==');
    expect(screen.getByText('rtmp://192.168.1.20:1935/camera')).toBeInTheDocument();
    expect(screen.getByText('Desk Cam')).toBeInTheDocument();
    expect(screen.getByText('http://192.168.1.20:47830/view/main')).toBeInTheDocument();
    expect(screen.getByText(/no sound in view/i)).toBeInTheDocument();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /add to obs/i })); });
    expect(window.api.cameras.addToObs).toHaveBeenCalledWith('main');
    expect(screen.getByText(/added "specter cam - main" to the obs scene "scene"/i)).toBeInTheDocument();
  });

  it('offers a one-click firewall fix when the firewall blocks phones', async () => {
    window.api.cameras.allowFirewall = vi.fn().mockResolvedValue(undefined);
    render(<ScreenCameras />);
    push({ ...base, enabled: true, state: 'running', firewall: { state: 'blocked', message: 'Your Mac\'s firewall is blocking the camera server' } });
    expect(screen.getByRole('alert')).toHaveTextContent('firewall is blocking the camera server');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: /allow phone cameras/i })); });
    expect(window.api.cameras.allowFirewall).toHaveBeenCalled();
  });

  it('surfaces server errors', async () => {
    render(<ScreenCameras />);
    push({ ...base, enabled: true, state: 'error', error: 'Port 47830 is already in use by another program' });
    expect(screen.getByRole('alert')).toHaveTextContent('Port 47830 is already in use');
  });
});
