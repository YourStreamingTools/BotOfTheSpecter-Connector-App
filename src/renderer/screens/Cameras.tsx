import React from 'react';
import { useCameras } from '../state/useCameras';
import { IconCam, IconCopy, IconExternal, IconPlus, IconRefresh } from '../icons';
import type { CameraInfo, CamerasSnapshot } from '@shared/ipc';

const STATE_CHIP: Record<CamerasSnapshot['state'], { cls: string; label: string }> = {
  off: { cls: '', label: 'Off' },
  starting: { cls: 'warn', label: 'Starting' },
  running: { cls: 'good', label: 'Running' },
  error: { cls: 'live', label: 'Error' },
  missing: { cls: 'live', label: 'Not bundled' }
};

export function ScreenCameras() {
  const snap = useCameras();
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState<string | null>(null);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(text);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setError('Could not copy to the clipboard');
    }
  };

  const addToObs = async (cam: CameraInfo) => {
    setError(null);
    setNotice(null);
    const res = await window.api.cameras.addToObs(cam.id);
    if (res.ok) setNotice(`Added "${res.sourceName}" to the OBS scene "${res.sceneName}".`);
    else setError(res.error ?? 'Could not add the camera to OBS');
  };

  const chip = STATE_CHIP[snap.state];

  return (
    <div className="screen">
      <div className="row" style={{ marginBottom: 14, gap: 10, alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Phone cameras</h3>
        <span className={`chip ${chip.cls}`}>{chip.label}</span>
        <span className="chip">{snap.cameras.length} live</span>
        <span style={{ marginLeft: 'auto' }} />
        <label className="row" style={{ gap: 8, fontSize: 12.5 }}>
          <span
            className="toggle"
            role="switch"
            aria-label="Local camera server"
            aria-checked={snap.enabled}
            data-on={snap.enabled ? 'true' : 'false'}
            onClick={() => { if (!busy) void run(() => window.api.cameras.setEnabled(!snap.enabled)); }}
          />
          Local camera server
        </label>
      </div>

      {snap.error && <div className="card camera-error" role="alert" style={{ marginBottom: 12 }}>{snap.error}</div>}
      {error && <div className="camera-error" role="alert" style={{ marginBottom: 12 }}>{error}</div>}
      {notice && <div className="chip good" style={{ marginBottom: 12 }}>{notice}</div>}

      {!snap.enabled ? (
        <div className="card" style={{ textAlign: 'center', padding: 48 }}>
          <IconCam size={36} />
          <h3 style={{ margin: '14px 0 6px' }}>Stream your phone camera over Wi-Fi</h3>
          <p style={{ color: 'var(--text-dim)', margin: '0 auto 18px', maxWidth: 520 }}>
            Turn on the local camera server and scan the QR code with the Specter Camera app. The video stays on your
            network, so there is no internet delay, and each phone shows up in OBS at <span className="mono">/view/&lt;camera&gt;</span>.
            Windows may ask you to allow the app through the firewall the first time.
          </p>
          <button className="btn btn-primary" disabled={busy} onClick={() => void run(() => window.api.cameras.setEnabled(true))}>
            Turn on camera server
          </button>
        </div>
      ) : (
        <div className="cameras-layout">
          <section className="card">
            <div className="card-head"><h3>Live cameras</h3></div>
            {snap.cameras.length === 0 ? (
              <p className="camera-hint">
                No phones connected yet. In the Specter Camera app choose <b>Local (Connector App)</b>, scan the QR code,
                and press Go live. The phone must be on the same Wi-Fi as this PC.
              </p>
            ) : (
              snap.cameras.map((cam) => (
                <CameraRow key={cam.id} cam={cam} copied={copied} onCopy={(t) => void copy(t)} onAdd={() => void addToObs(cam)} />
              ))
            )}
            <p className="camera-hint" style={{ marginTop: 14 }}>
              To add a camera by hand: OBS, Add Source, Browser, paste the view URL, 1920 x 1080, and leave
              "Control audio via OBS" on to hear the phone. Use the 127.0.0.1 URL when OBS runs on this PC.
            </p>
          </section>

          <aside className="card">
            <div className="card-head"><h3>Pair a phone</h3></div>
            {snap.pairQr ? (
              <img className="camera-qr" src={snap.pairQr} alt="Pairing QR code for the Specter Camera app" />
            ) : (
              <p className="camera-hint">{snap.host ? 'Preparing the QR code…' : 'No Wi-Fi or Ethernet address found on this PC.'}</p>
            )}
            {snap.hosts.length > 1 && (
              <>
                <label className="label-row" htmlFor="camera-host">Address phones connect to</label>
                <select
                  id="camera-host"
                  className="input"
                  value={snap.host ?? ''}
                  disabled={busy}
                  onChange={(e) => void run(() => window.api.cameras.setHost(e.target.value))}
                >
                  {snap.hosts.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </>
            )}
            {snap.rtmpUrl && (
              <p className="camera-hint" style={{ marginTop: 10 }}>
                Phone address: <span className="mono">{snap.rtmpUrl}</span>
                {snap.srtUrl && <> or <span className="mono">{snap.srtUrl}</span></>}
              </p>
            )}
            <button
              className="btn btn-sm"
              style={{ marginTop: 10 }}
              disabled={busy}
              onClick={() => void run(() => window.api.cameras.regenerateKey())}
              title="Disconnects every paired phone"
            >
              <IconRefresh size={11} />New pairing code
            </button>

            <div className="camera-setting">
              <span
                className="toggle"
                role="switch"
                aria-label="Allow other PCs to view"
                aria-checked={snap.lanView}
                data-on={snap.lanView ? 'true' : 'false'}
                onClick={() => { if (!busy) void run(() => window.api.cameras.setLanView(!snap.lanView)); }}
              />
              Allow other PCs on my network to view cameras
            </div>
            <PortsEditor snap={snap} busy={busy} onSave={(rtmpPort, webPort) => void run(() => window.api.cameras.setPorts({ rtmpPort, webPort }))} />
          </aside>
        </div>
      )}
    </div>
  );
}

function CameraRow({ cam, copied, onCopy, onAdd }: {
  cam: CameraInfo;
  copied: string | null;
  onCopy: (text: string) => void;
  onAdd: () => void;
}) {
  const res = cam.video?.width && cam.video?.height ? `${cam.video.width}x${cam.video.height}` : null;
  const url = cam.viewUrl ?? cam.localViewUrl;
  return (
    <div className="camera-row" data-testid={`camera-${cam.id}`}>
      <div style={{ minWidth: 0 }}>
        <div className="camera-name">{cam.name} <span className="chip">{cam.id}</span></div>
        <div className="camera-meta">
          {cam.video && <span className="chip">{cam.video.codec}{res ? ` ${res}` : ''}</span>}
          {cam.bitrateKbps !== null && <span className="chip">{(cam.bitrateKbps / 1000).toFixed(1)} Mbps</span>}
          {cam.audio
            ? <span className={`chip ${cam.audioPlayable ? '' : 'warn'}`} title={cam.audioPlayable ? undefined : 'Browser sources can only play Opus audio; switch the phone to Opus to hear it'}>
                {cam.audio.codec}{cam.audioPlayable ? '' : ' (no sound in view)'}
              </span>
            : <span className="chip">no audio</span>}
          <span className="chip">{cam.viewers} viewing</span>
          {cam.remoteAddr && <span className="chip">{cam.remoteAddr}</span>}
        </div>
        <div className="camera-url" title={url}>{url}</div>
      </div>
      <div className="camera-actions">
        <button className="btn btn-sm btn-primary" onClick={onAdd}><IconPlus size={11} />Add to OBS</button>
        <button className="btn btn-sm" onClick={() => onCopy(url)}><IconCopy size={11} />{copied === url ? 'Copied' : 'Copy URL'}</button>
        {cam.viewUrl && cam.viewUrl !== cam.localViewUrl && (
          <button className="btn btn-sm" onClick={() => onCopy(cam.localViewUrl)}>
            <IconCopy size={11} />{copied === cam.localViewUrl ? 'Copied' : 'Copy 127.0.0.1 URL'}
          </button>
        )}
        <button className="btn btn-sm" onClick={() => void window.api.cameras.openView(cam.id)}><IconExternal size={11} />Preview</button>
      </div>
    </div>
  );
}

function PortsEditor({ snap, busy, onSave }: { snap: CamerasSnapshot; busy: boolean; onSave: (rtmp: number, web: number) => void }) {
  const [rtmp, setRtmp] = React.useState(String(snap.rtmpPort));
  const [web, setWeb] = React.useState(String(snap.webPort));
  React.useEffect(() => { setRtmp(String(snap.rtmpPort)); setWeb(String(snap.webPort)); }, [snap.rtmpPort, snap.webPort]);
  const dirty = rtmp !== String(snap.rtmpPort) || web !== String(snap.webPort);
  return (
    <div style={{ marginTop: 16 }}>
      <div className="row" style={{ gap: 8 }}>
        <div style={{ flex: 1 }}>
          <label className="label-row" htmlFor="camera-rtmp-port">Phone (RTMP) port</label>
          <input id="camera-rtmp-port" className="input mono" inputMode="numeric" value={rtmp} disabled={busy} onChange={(e) => setRtmp(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <label className="label-row" htmlFor="camera-web-port">View port</label>
          <input id="camera-web-port" className="input mono" inputMode="numeric" value={web} disabled={busy} onChange={(e) => setWeb(e.target.value)} />
        </div>
      </div>
      {dirty && (
        <button className="btn btn-sm" style={{ marginTop: 8 }} disabled={busy} onClick={() => onSave(Number(rtmp), Number(web))}>
          Save ports
        </button>
      )}
      <p className="camera-hint" style={{ marginTop: 8 }}>
        Changing a port means phones must scan the QR again and OBS sources need the new URL.
      </p>
    </div>
  );
}
