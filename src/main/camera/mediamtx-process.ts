import { EventEmitter } from 'events';
import { spawn as nodeSpawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';

export const MEDIAMTX_VERSION = 'v1.21.2';

export function mediamtxExeName(platform: NodeJS.Platform = process.platform): string {
  return platform === 'win32' ? 'mediamtx.exe' : 'mediamtx';
}

/**
 * Where the bundled binary lives. Packaged: <resources>/mediamtx/. Dev: resources/mediamtx/<platform>-<arch>/
 * (filled by `npm run fetch:mediamtx`). SPECTER_MEDIAMTX_PATH overrides both.
 */
export function resolveMediamtxPath(opts: {
  packaged: boolean;
  resourcesPath: string;
  appPath: string;
  platform?: NodeJS.Platform;
  arch?: string;
  env?: NodeJS.ProcessEnv;
  exists?: (p: string) => boolean;
}): string | null {
  const exists = opts.exists ?? existsSync;
  const override = (opts.env ?? process.env).SPECTER_MEDIAMTX_PATH;
  if (override) return exists(override) ? override : null;
  const exe = mediamtxExeName(opts.platform);
  const candidate = opts.packaged
    ? join(opts.resourcesPath, 'mediamtx', exe)
    : join(opts.appPath, 'resources', 'mediamtx', `${opts.platform ?? process.platform}-${opts.arch ?? process.arch}`, exe);
  return exists(candidate) ? candidate : null;
}

export type MediamtxState = 'stopped' | 'starting' | 'running' | 'error';

export interface MediamtxProcessDeps {
  binaryPath: string;
  configPath: string;
  spawn?: typeof nodeSpawn;
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
}

const MAX_BACKOFF_MS = 30_000;
// Seconds of uptime after which a crash is treated as fresh rather than part of a crash loop.
const STABLE_MS = 20_000;

/** Supervises the MediaMTX child: start/stop, line-buffered log output, restart with backoff on crash. */
export class MediamtxProcess extends EventEmitter {
  private child: ChildProcess | null = null;
  private wanted = false;
  private backoffMs = 1000;
  private restartTimer: ReturnType<typeof setTimeout> | undefined;
  private startedAt = 0;
  private lastError: string | undefined;
  private state: MediamtxState = 'stopped';
  private readonly spawnFn: typeof nodeSpawn;
  private readonly setTimeoutFn: typeof setTimeout;
  private readonly clearTimeoutFn: typeof clearTimeout;

  constructor(private readonly deps: MediamtxProcessDeps) {
    super();
    this.spawnFn = deps.spawn ?? nodeSpawn;
    this.setTimeoutFn = deps.setTimeout ?? setTimeout;
    this.clearTimeoutFn = deps.clearTimeout ?? clearTimeout;
  }

  getState(): { state: MediamtxState; error?: string } {
    return this.lastError && this.state !== 'running' ? { state: this.state, error: this.lastError } : { state: this.state };
  }

  start(): void {
    this.wanted = true;
    this.backoffMs = 1000;
    if (this.child) return;
    this.spawnChild();
  }

  stop(): Promise<void> {
    this.wanted = false;
    if (this.restartTimer) {
      this.clearTimeoutFn(this.restartTimer);
      this.restartTimer = undefined;
    }
    const child = this.child;
    if (!child) {
      this.setState('stopped');
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const done = () => { clearKill(); resolve(); };
      const killTimer = this.setTimeoutFn(() => { try { child.kill('SIGKILL'); } catch { /* gone */ } }, 3000);
      const clearKill = () => this.clearTimeoutFn(killTimer);
      child.once('exit', done);
      try { child.kill(); } catch { done(); }
    });
  }

  private spawnChild(): void {
    this.setState('starting');
    this.startedAt = Date.now();
    let child: ChildProcess;
    try {
      child = this.spawnFn(this.deps.binaryPath, [this.deps.configPath], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    } catch (err) {
      this.fail(err instanceof Error ? err.message : String(err));
      return;
    }
    this.child = child;
    const onData = lineSplitter((line) => this.onLine(line));
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.on('error', (err) => this.lastError = err.message);
    child.on('exit', (code, signal) => {
      this.child = null;
      if (!this.wanted) {
        this.setState('stopped');
        return;
      }
      this.fail(this.lastError ?? `MediaMTX exited (${signal ?? `code ${code}`})`);
    });
  }

  private onLine(line: string): void {
    this.emit('log', line);
    // v1.21 prints "[RTMP] started with listener on :1935 (TCP/RTMP)" (older: "listener opened"); RTMP is what the phone needs.
    if (this.state === 'starting' && /\[RTMP\] (started with listener|listener opened)/.test(line)) {
      this.lastError = undefined;
      this.setState('running');
    }
    const m = /^\S+ \S+ ERR (.*)$/.exec(line);
    if (m) this.lastError = m[1];
  }

  private fail(message: string): void {
    this.lastError = message;
    this.setState('error');
    if (!this.wanted) return;
    if (Date.now() - this.startedAt > STABLE_MS) this.backoffMs = 1000;
    const delay = this.backoffMs;
    this.backoffMs = Math.min(this.backoffMs * 2, MAX_BACKOFF_MS);
    this.restartTimer = this.setTimeoutFn(() => {
      this.restartTimer = undefined;
      if (this.wanted && !this.child) this.spawnChild();
    }, delay);
  }

  private setState(s: MediamtxState): void {
    if (this.state === s) return;
    this.state = s;
    this.emit('state', this.getState());
  }
}

export function lineSplitter(onLine: (line: string) => void): (chunk: Buffer | string) => void {
  let buf = '';
  return (chunk) => {
    buf += chunk.toString();
    let nl: number;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      if (line) onLine(line);
    }
    if (buf.length > 64 * 1024) buf = '';
  };
}
