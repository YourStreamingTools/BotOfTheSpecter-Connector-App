import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';
import { promises as fsp } from 'fs';
import { join } from 'path';
import { networkInterfaces as osNetworkInterfaces } from 'os';
import type {
  AppConfig, CameraAddToObsResult, CameraFirewall, CameraInfo, CameraPortsInput, CameraServerState, CamerasSnapshot
} from '@shared/ipc';
import {
  CAMERA_API_PORT, CAMERA_RTMP_PORT, CAMERA_SRT_PORT, CAMERA_WEBRTC_PORT, CAMERA_WEBRTC_UDP_PORT, CAMERA_WEB_PORT,
  LOCAL_KEY_MIN_LENGTH, buildPairUri, cameraRtmpUrl, cameraSrtUrl, isLoopbackIp, isValidCameraSlug, isValidPort
} from '@shared/cameras';
import { buildMediamtxConfig } from './mediamtx-config';
import { MediamtxProcess, type MediamtxState } from './mediamtx-process';
import { checkPublish, decideAuth, type AuthDecision, type MediamtxAuthRequest } from './camera-auth';
import { startCameraServer, type CameraServer } from './camera-server';
import { buildCameraList, type LiveCamera, type MtxConn, type MtxPath } from './camera-list';
import type { CameraCheckResult } from '@shared/cameras';
import { allowThroughFirewall, checkFirewall, type FirewallTarget } from './firewall';

type CameraConfigKey = 'camera_enabled' | 'camera_local_key' | 'camera_host' | 'camera_lan_view' | 'camera_rtmp_port' | 'camera_web_port';

export interface CameraStore {
  get<K extends CameraConfigKey>(key: K): AppConfig[K] | undefined;
  set<K extends CameraConfigKey>(key: K, value: AppConfig[K]): Promise<void>;
}

export interface MediamtxRunner {
  start(): void;
  stop(): Promise<void>;
  getState(): { state: MediamtxState; error?: string };
  on(event: 'state', cb: (s: { state: MediamtxState; error?: string }) => void): unknown;
  on(event: 'log', cb: (line: string) => void): unknown;
}

export interface CameraServiceDeps {
  store: CameraStore;
  /** Folder for the generated mediamtx.yml. */
  dataDir: string;
  /** Bundled MediaMTX binary, or null when it isn't shipped for this platform/build. */
  binaryPath: string | null;
  addBrowserSource(inputName: string, url: string, width: number, height: number): Promise<{ sceneName: string }>;
  /** Host OBS is reached on, so Add to OBS picks 127.0.0.1 vs the LAN address. */
  obsHost(): string | undefined;
  log(level: 'info' | 'ok' | 'warn' | 'err' | 'evt', message: string): void;
  registerSecret(secret: string): void;
  qrDataUrl(text: string): Promise<string>;
  networkInterfaces?: typeof osNetworkInterfaces;
  fetch?: typeof fetch;
  createRunner?: (binaryPath: string, configPath: string) => MediamtxRunner;
  startServer?: typeof startCameraServer;
  pollMs?: number;
  /** Programs that must be let through the OS firewall (the app and MediaMTX). Omit to skip firewall checks. */
  firewallTargets?: FirewallTarget[];
  platform?: NodeJS.Platform;
  checkFirewall?: (platform: NodeJS.Platform, targets: FirewallTarget[]) => Promise<CameraFirewall>;
  allowFirewall?: (platform: NodeJS.Platform, targets: FirewallTarget[]) => Promise<void>;
}

const POLL_MS = 2000;

// Adapters made by VMs, Docker, VPNs and Internet Sharing: phones on the Wi-Fi can't reach these, so they go last.
const VIRTUAL_IFACE = /^(bridge|vnic|vmnet|vboxnet|utun|tun|tap|docker|br-|veth|virbr|tailscale|zt|wg|awdl|llw|anpi|ap\d)|vethernet|virtual|vmware|hyper-v|loopback|bluetooth|tailscale|zerotier|vpn/i;
// Built-in Wi-Fi/Ethernet names: en0/en1 (macOS), Wi-Fi/Ethernet (Windows), wlan/wlp/eth/enp (Linux).
const PHYSICAL_IFACE = /^(en\d|wi-?fi|wlan|wlp|wl|eth|enp|eno|ens|ethernet|local area connection|wireless)/i;

/** Private IPv4s of this PC: real Wi-Fi/Ethernet adapters first, virtual ones last, then home-router ranges first. */
export function lanIpv4s(ifaces: ReturnType<typeof osNetworkInterfaces>): string[] {
  const found: { ip: string; name: string }[] = [];
  for (const [name, list] of Object.entries(ifaces)) {
    for (const a of list ?? []) {
      const fam = a.family as string | number;
      if ((fam !== 'IPv4' && fam !== 4) || a.internal) continue;
      if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address) && !found.some((f) => f.ip === a.address)) {
        found.push({ ip: a.address, name });
      }
    }
  }
  const ifaceRank = (name: string) => VIRTUAL_IFACE.test(name) ? 2 : PHYSICAL_IFACE.test(name) ? 0 : 1;
  const ipRank = (ip: string) => ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2;
  return found
    .sort((x, y) => ifaceRank(x.name) - ifaceRank(y.name) || ipRank(x.ip) - ipRank(y.ip))
    .map((f) => f.ip);
}

/** Local camera route: owns the MediaMTX child, the camera web server, pairing key and the live camera list. */
export class CameraService extends EventEmitter {
  private runner: MediamtxRunner | null = null;
  private server: CameraServer | null = null;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private live: LiveCamera[] = [];
  private prevBytes = new Map<string, { bytes: number; at: number }>();
  private serverError: string | undefined;
  private pairQr: string | null = null;
  private pairQrFor: string | null = null;
  private pairQrPending: string | null = null;
  private lastJson = '';
  private transition: Promise<void> = Promise.resolve();
  private firewall: CameraFirewall = { state: 'unknown' };
  private firewallChecking = false;
  private readonly fetchFn: typeof fetch;
  private readonly ifaces: typeof osNetworkInterfaces;

  constructor(private readonly deps: CameraServiceDeps) {
    super();
    this.fetchFn = deps.fetch ?? fetch;
    this.ifaces = deps.networkInterfaces ?? osNetworkInterfaces;
  }

  // ---- config ----
  private get enabled(): boolean { return this.deps.store.get('camera_enabled') === true; }
  private get lanView(): boolean { return this.deps.store.get('camera_lan_view') !== false; }
  private get rtmpPort(): number {
    const p = this.deps.store.get('camera_rtmp_port');
    return isValidPort(p) ? p : CAMERA_RTMP_PORT;
  }
  private get webPort(): number {
    const p = this.deps.store.get('camera_web_port');
    return isValidPort(p) ? p : CAMERA_WEB_PORT;
  }
  private get localKey(): string { return this.deps.store.get('camera_local_key') ?? ''; }

  private hosts(): string[] {
    try { return lanIpv4s(this.ifaces()); } catch { return []; }
  }

  private host(): string | null {
    const hosts = this.hosts();
    const chosen = this.deps.store.get('camera_host');
    if (chosen && hosts.includes(chosen)) return chosen;
    return hosts[0] ?? null;
  }

  private async ensureKey(): Promise<string> {
    let key = this.localKey;
    if (key.length < LOCAL_KEY_MIN_LENGTH) {
      key = randomBytes(24).toString('base64url');
      await this.deps.store.set('camera_local_key', key);
    }
    this.deps.registerSecret(key);
    return key;
  }

  // ---- lifecycle ----
  /** Called once at boot: starts the server only if the user turned it on before. */
  async init(): Promise<void> {
    if (this.localKey) this.deps.registerSecret(this.localKey);
    if (this.enabled) await this.restart();
    else this.emitChanged();
  }

  private serialize(fn: () => Promise<void>): Promise<void> {
    const run = this.transition.catch(() => undefined).then(fn);
    this.transition = run.catch(() => undefined);
    return run;
  }

  restart(): Promise<void> {
    return this.serialize(async () => {
      await this.stopInner();
      if (this.enabled) await this.startInner();
      this.emitChanged();
    });
  }

  dispose(): Promise<void> {
    return this.serialize(() => this.stopInner());
  }

  private async startInner(): Promise<void> {
    this.serverError = undefined;
    if (!this.deps.binaryPath) {
      this.emitChanged();
      return;
    }
    await this.ensureKey();
    const startServer = this.deps.startServer ?? startCameraServer;
    try {
      this.server = await startServer(this.webPort, {
        check: (slug, key, device) => this.check(slug, key, device),
        auth: (req) => this.auth(req),
        list: () => this.live.map((c) => ({ id: c.info.id, name: c.info.name, viewUrl: c.info.viewUrl ?? c.info.localViewUrl })),
        webrtcPort: () => CAMERA_WEBRTC_PORT,
        lanView: () => this.lanView
      });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      this.serverError = code === 'EADDRINUSE'
        ? `Port ${this.webPort} is already in use by another program`
        : `Camera web server failed: ${err instanceof Error ? err.message : String(err)}`;
      this.deps.log('err', this.serverError);
      return;
    }

    const configPath = join(this.deps.dataDir, 'mediamtx.yml');
    await fsp.mkdir(this.deps.dataDir, { recursive: true });
    await fsp.writeFile(configPath, buildMediamtxConfig({ rtmpPort: this.rtmpPort, webPort: this.webPort, lanView: this.lanView }), 'utf-8');

    const runner = this.deps.createRunner
      ? this.deps.createRunner(this.deps.binaryPath, configPath)
      : new MediamtxProcess({ binaryPath: this.deps.binaryPath, configPath });
    runner.on('state', (s) => {
      if (s.state === 'running') {
        this.deps.log('ok', `Camera server listening: RTMP :${this.rtmpPort}, view http://<this PC>:${this.webPort}/view/{id}`);
        void this.refreshFirewall();
      }
      if (s.state === 'error' && s.error) this.deps.log('err', `MediaMTX: ${s.error}`);
      this.emitChanged();
    });
    runner.on('log', (line) => this.onMediamtxLine(line));
    this.runner = runner;
    runner.start();
    this.pollTimer = setInterval(() => void this.poll(), this.deps.pollMs ?? POLL_MS);
  }

  private async stopInner(): Promise<void> {
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
    const runner = this.runner;
    this.runner = null;
    const server = this.server;
    this.server = null;
    await runner?.stop();
    await server?.close();
    this.live = [];
    this.prevBytes.clear();
  }

  private onMediamtxLine(line: string): void {
    // Keep connection/auth lines and problems; drop per-request chatter.
    const m = /^\S+ \S+ (INF|WAR|ERR|DEB) (.*)$/.exec(line);
    if (!m) return;
    const [, lvl, msg] = m;
    if (lvl === 'DEB') return;
    if (lvl === 'INF' && !/\[RTMP\] \[conn|\[SRT\] \[conn|\[path camera\/|started with listener|listener opened|\[WebRTC\] \[session/.test(msg)) return;
    this.deps.log(lvl === 'ERR' ? 'err' : lvl === 'WAR' ? 'warn' : 'info', msg);
  }

  // ---- MediaMTX API ----
  private apiUrl(path: string): string {
    return `http://127.0.0.1:${CAMERA_API_PORT}${path}`;
  }

  private async fetchJson<T>(path: string): Promise<T | null> {
    try {
      const res = await this.fetchFn(this.apiUrl(path), { signal: AbortSignal.timeout(1500) });
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  private async fetchLive(): Promise<LiveCamera[] | null> {
    const [paths, rtmp, srt] = await Promise.all([
      this.fetchJson<{ items?: MtxPath[] }>('/v3/paths/list?itemsPerPage=1000'),
      this.fetchJson<{ items?: MtxConn[] }>('/v3/rtmp/conns/list?itemsPerPage=1000'),
      this.fetchJson<{ items?: MtxConn[] }>('/v3/srt/conns/list?itemsPerPage=1000')
    ]);
    if (!paths) return null;
    return buildCameraList(paths.items ?? [], [...(rtmp?.items ?? []), ...(srt?.items ?? [])], {
      host: this.host(), webPort: this.webPort, prevBytes: this.prevBytes, now: Date.now()
    });
  }

  private async poll(): Promise<void> {
    if (!this.runner) return;
    const live = await this.fetchLive();
    if (!live || !this.runner) return;
    const before = new Set(this.live.map((c) => c.info.id));
    const after = new Set(live.map((c) => c.info.id));
    for (const c of live) if (!before.has(c.info.id)) this.deps.log('ok', `Camera "${c.info.name}" connected as ${c.info.id}${c.info.remoteAddr ? ` from ${c.info.remoteAddr}` : ''}`);
    for (const c of this.live) if (!after.has(c.info.id)) this.deps.log('info', `Camera ${c.info.id} disconnected`);
    const now = Date.now();
    this.prevBytes = new Map(live.map((c) => [c.info.id, { bytes: c.bytes, at: now }]));
    this.live = live;
    this.emitChanged();
  }

  // ---- auth (shared by the MediaMTX hook and the phone preflight) ----
  private async existingPublisher(slug: string): Promise<{ device: string } | null> {
    if (!this.runner) return null;
    const live = (await this.fetchLive()) ?? this.live;
    const cam = live.find((c) => c.info.id === slug);
    return cam ? { device: cam.device } : null;
  }

  async check(slug: string, key: string, device: string): Promise<CameraCheckResult> {
    if (!this.runner || this.runner.getState().state !== 'running') return { ok: false, status: 503, error: 'not_running' };
    if (!isValidCameraSlug(slug)) return { ok: false, status: 400, error: 'invalid_cam' };
    return checkPublish(slug, key, device, { localKey: this.localKey, lanView: this.lanView, existing: await this.existingPublisher(slug) });
  }

  async auth(req: MediamtxAuthRequest): Promise<AuthDecision> {
    const slug = (req.path ?? '').replace(/^camera\//, '');
    const existing = req.action === 'publish' && isValidCameraSlug(slug) ? await this.existingPublisher(slug) : null;
    const decision = decideAuth(req, { localKey: this.localKey, lanView: this.lanView, existing });
    if (!decision.allow && req.action === 'publish') {
      this.deps.log('warn', `Refused camera publish on ${req.path ?? '?'} from ${req.ip ?? '?'}: ${decision.reason}`);
    }
    return decision;
  }

  // ---- firewall ----
  private get platform(): NodeJS.Platform { return this.deps.platform ?? process.platform; }

  /** Checks whether the OS firewall lets phones in; the Cameras screen offers a one-click fix when it doesn't. */
  async refreshFirewall(): Promise<void> {
    const targets = this.deps.firewallTargets;
    if (!targets?.length || this.firewallChecking) return;
    this.firewallChecking = true;
    try {
      const fw = await (this.deps.checkFirewall ?? checkFirewall)(this.platform, targets);
      if (fw.state === 'blocked' && this.firewall.state !== 'blocked') this.deps.log('warn', fw.message ?? 'The firewall is blocking phone cameras');
      this.firewall = fw;
    } finally {
      this.firewallChecking = false;
    }
    this.emitChanged();
  }

  async allowFirewall(): Promise<void> {
    const targets = this.deps.firewallTargets;
    if (!targets?.length) throw new Error('Nothing to allow through the firewall');
    await (this.deps.allowFirewall ?? allowThroughFirewall)(this.platform, targets);
    this.deps.log('ok', 'Allowed phone cameras through the firewall');
    await this.refreshFirewall();
  }

  // ---- renderer actions ----
  async setEnabled(on: boolean): Promise<void> {
    await this.deps.store.set('camera_enabled', !!on);
    await this.restart();
  }

  async setLanView(on: boolean): Promise<void> {
    await this.deps.store.set('camera_lan_view', !!on);
    if (this.enabled) await this.restart();
    else this.emitChanged();
  }

  async setHost(host: string): Promise<void> {
    if (!this.hosts().includes(host)) throw new Error(`${host} is not an address of this PC`);
    await this.deps.store.set('camera_host', host);
    this.emitChanged();
  }

  async setPorts(p: CameraPortsInput): Promise<void> {
    if (!isValidPort(p?.rtmpPort) || !isValidPort(p?.webPort)) throw new Error('Ports must be whole numbers from 1 to 65535');
    const reserved = [CAMERA_WEBRTC_PORT, CAMERA_WEBRTC_UDP_PORT, CAMERA_API_PORT, CAMERA_SRT_PORT];
    if (p.rtmpPort === p.webPort || reserved.includes(p.rtmpPort) || reserved.includes(p.webPort)) {
      throw new Error(`Ports must differ from each other and from ${reserved.join(', ')}`);
    }
    await this.deps.store.set('camera_rtmp_port', p.rtmpPort);
    await this.deps.store.set('camera_web_port', p.webPort);
    if (this.enabled) await this.restart();
    else this.emitChanged();
  }

  async regenerateKey(): Promise<void> {
    await this.deps.store.set('camera_local_key', '');
    await this.ensureKey();
    // Cut every phone that paired with the old key; they must scan the new QR.
    await Promise.all(this.live.filter((c) => c.connId && c.connKind).map((c) =>
      this.fetchFn(this.apiUrl(`/v3/${c.connKind}/conns/kick/${c.connId}`), { method: 'POST' }).catch(() => undefined)
    ));
    this.deps.log('info', 'Camera pairing key regenerated; phones must scan the new QR');
    this.emitChanged();
  }

  viewUrlFor(id: string): string | null {
    if (!isValidCameraSlug(id)) return null;
    return `http://127.0.0.1:${this.webPort}/view/${id}`;
  }

  async addToObs(id: string): Promise<CameraAddToObsResult> {
    if (!isValidCameraSlug(id)) return { ok: false, error: 'Invalid camera id' };
    const obsHost = (this.deps.obsHost() ?? '').trim();
    const sameMachine = !obsHost || obsHost === 'localhost' || isLoopbackIp(obsHost);
    const host = sameMachine ? '127.0.0.1' : this.host();
    if (!host) return { ok: false, error: 'No LAN address found for this PC' };
    if (!sameMachine && !this.lanView) return { ok: false, error: 'OBS is on another PC: turn on "Allow other PCs to view" first' };
    const sourceName = `Specter Cam - ${id}`;
    try {
      const { sceneName } = await this.deps.addBrowserSource(sourceName, `http://${host}:${this.webPort}/view/${id}`, 1920, 1080);
      this.deps.log('ok', `Added ${sourceName} to OBS scene "${sceneName}"`);
      return { ok: true, sourceName, sceneName };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  // ---- snapshot ----
  private state(): { state: CameraServerState; error?: string } {
    if (!this.enabled) return { state: 'off' };
    if (!this.deps.binaryPath) return { state: 'missing', error: 'The camera server (MediaMTX) is not bundled with this build' };
    if (this.serverError) return { state: 'error', error: this.serverError };
    if (!this.runner) return { state: 'starting' };
    const s = this.runner.getState();
    if (s.state === 'running') return { state: 'running' };
    if (s.state === 'error') return { state: 'error', error: s.error };
    return { state: 'starting' };
  }

  snapshot(): CamerasSnapshot {
    const hosts = this.hosts();
    const host = this.host();
    const key = this.localKey;
    const st = this.state();
    const pairUri = host && key && st.state !== 'off'
      ? buildPairUri({ host, rtmpPort: this.rtmpPort, webPort: this.webPort, srtPort: CAMERA_SRT_PORT, key })
      : null;
    return {
      enabled: this.enabled,
      ...st,
      lanView: this.lanView,
      rtmpPort: this.rtmpPort,
      webPort: this.webPort,
      hosts,
      host,
      rtmpUrl: host ? cameraRtmpUrl(host, this.rtmpPort) : null,
      srtUrl: host ? cameraSrtUrl(host, CAMERA_SRT_PORT) : null,
      pairUri,
      pairQr: pairUri && pairUri === this.pairQrFor ? this.pairQr : null,
      cameras: this.live.map((c): CameraInfo => ({ ...c.info })),
      // Only meaningful while the server runs.
      firewall: st.state === 'running' ? this.firewall : { state: 'unknown' }
    };
  }

  private emitChanged(): void {
    const snap = this.snapshot();
    if (snap.pairUri && snap.pairUri !== this.pairQrFor && snap.pairUri !== this.pairQrPending) {
      const uri = snap.pairUri;
      this.pairQrPending = uri;
      void this.deps.qrDataUrl(uri).then((png) => {
        this.pairQr = png;
        this.pairQrFor = uri;
        this.emitChanged();
      }).catch(() => undefined).finally(() => {
        if (this.pairQrPending === uri) this.pairQrPending = null;
      });
    }
    const json = JSON.stringify(snap);
    if (json === this.lastJson) return;
    this.lastJson = json;
    this.emit('changed', snap);
  }
}
