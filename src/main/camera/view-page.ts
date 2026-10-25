/**
 * OBS Browser Source page for one camera. Plays camera/<id> from the bundled MediaMTX over WHEP
 * (non-trickle: the full offer is sent once ICE gathering finishes, which is instant on a LAN)
 * and keeps retrying while the phone is offline. ?status=0 hides the waiting caption.
 */
export function renderViewPage(slug: string, webrtcPort: number): string {
  // slug is pre-validated against [a-z0-9_-]{1,32}; JSON.stringify keeps the inline script safe regardless.
  const cfg = JSON.stringify({ slug, webrtcPort });
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>Specter Camera - ${slug}</title>
<style>
  html,body { margin:0; width:100%; height:100%; background:transparent; overflow:hidden; }
  video { width:100%; height:100%; object-fit:contain; background:transparent; display:block; }
  #status { position:absolute; left:16px; bottom:14px; font:600 14px Inter, Segoe UI, sans-serif; color:#fff;
    background:rgba(13,13,13,.72); border-left:3px solid #9B59B6; padding:6px 10px; border-radius:4px; }
  #status[hidden] { display:none; }
</style>
</head>
<body>
<video id="v" autoplay playsinline></video>
<div id="status">Waiting for camera…</div>
<script>
const CFG = ${cfg};
const video = document.getElementById('v');
const statusEl = document.getElementById('status');
const showStatus = new URLSearchParams(location.search).get('status') !== '0';
const whepUrl = location.protocol + '//' + location.hostname + ':' + CFG.webrtcPort + '/camera/' + CFG.slug + '/whep';
let pc = null;
let sessionUrl = null;
let retryTimer = null;

function setStatus(text) {
  statusEl.textContent = text;
  statusEl.hidden = !showStatus || !text;
}

function waitIce(conn) {
  if (conn.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(resolve, 2000);
    conn.addEventListener('icegatheringstatechange', () => {
      if (conn.iceGatheringState === 'complete') { clearTimeout(t); resolve(); }
    });
  });
}

function teardown() {
  if (sessionUrl) { fetch(sessionUrl, { method: 'DELETE' }).catch(() => {}); sessionUrl = null; }
  if (pc) { try { pc.close(); } catch (e) {} pc = null; }
}

function retry(delay) {
  teardown();
  clearTimeout(retryTimer);
  retryTimer = setTimeout(connect, delay);
}

async function connect() {
  teardown();
  const conn = new RTCPeerConnection({ iceServers: [] });
  pc = conn;
  conn.addTransceiver('video', { direction: 'recvonly' });
  conn.addTransceiver('audio', { direction: 'recvonly' });
  const stream = new MediaStream();
  conn.ontrack = (ev) => {
    stream.addTrack(ev.track);
    if (video.srcObject !== stream) video.srcObject = stream;
    video.play().catch(() => { video.muted = true; video.play().catch(() => {}); });
  };
  conn.onconnectionstatechange = () => {
    if (pc !== conn) return;
    if (conn.connectionState === 'connected') setStatus('');
    if (conn.connectionState === 'failed' || conn.connectionState === 'closed' || conn.connectionState === 'disconnected') {
      setStatus('Camera ' + CFG.slug + ' disconnected, reconnecting…');
      retry(1500);
    }
  };
  try {
    await conn.setLocalDescription(await conn.createOffer());
    await waitIce(conn);
    const res = await fetch(whepUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/sdp' },
      body: conn.localDescription.sdp
    });
    if (pc !== conn) return;
    if (res.status !== 201) {
      setStatus(res.status === 404 ? 'Waiting for camera ' + CFG.slug + '…' : 'Camera ' + CFG.slug + ' unavailable (' + res.status + ')');
      retry(2000);
      return;
    }
    const loc = res.headers.get('Location');
    if (loc) sessionUrl = new URL(loc, whepUrl).toString();
    await conn.setRemoteDescription({ type: 'answer', sdp: await res.text() });
  } catch (e) {
    if (pc !== conn) return;
    setStatus('Camera server not reachable, retrying…');
    retry(3000);
  }
}

window.addEventListener('beforeunload', teardown);
setStatus('Waiting for camera ' + CFG.slug + '…');
connect();
</script>
</body>
</html>`;
}
