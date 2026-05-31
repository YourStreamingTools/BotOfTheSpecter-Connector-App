import { EventEmitter } from 'events';
import { BOTOFTHESPECTER_API_BASE } from '@shared/constants';
import type { BotStatus } from '@shared/ipc';

export interface BotStatusServiceDeps {
  fetch?: typeof fetch;
  intervalMs?: number;
}

const UNREACHABLE: BotStatus = { running: false, reachable: false };

export class BotStatusService extends EventEmitter {
  private fetch: typeof fetch;
  private intervalMs: number;
  private apiKey = '';
  private timer?: NodeJS.Timeout;
  private status: BotStatus = { ...UNREACHABLE };

  constructor(deps: BotStatusServiceDeps = {}) {
    super();
    this.fetch = deps.fetch ?? fetch;
    this.intervalMs = deps.intervalMs ?? 30_000;
  }

  getStatus(): BotStatus {
    return this.status;
  }

  setApiKey(key: string): void {
    this.apiKey = key.trim();
    if (!this.apiKey) {
      // Key cleared — stop polling and reset the status so the UI doesn't keep
      // reporting the bot as running.
      this.stop();
      this.set({ ...UNREACHABLE });
    }
  }

  /** Begin polling (immediately + on an interval). Safe to call repeatedly. */
  start(): void {
    this.stop();
    if (!this.apiKey) return;
    void this.refresh();
    this.timer = setInterval(() => void this.refresh(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async refresh(): Promise<void> {
    if (!this.apiKey) {
      this.set({ ...UNREACHABLE });
      return;
    }
    try {
      const res = await this.fetch(`${BOTOFTHESPECTER_API_BASE}/v2/bot/status`, {
        headers: { accept: 'application/json', 'X-API-KEY': this.apiKey }
      });
      if (!res.ok) {
        this.set({ ...UNREACHABLE });
        return;
      }
      const d = (await res.json()) as {
        running?: boolean; pid?: number; version?: string;
        bot_type?: string; outdated?: boolean; latest_version?: string;
      };
      this.set({
        running: Boolean(d.running),
        reachable: true,
        pid: d.pid,
        version: d.version,
        botType: d.bot_type,
        outdated: Boolean(d.outdated),
        latestVersion: d.latest_version
      });
    } catch {
      this.set({ ...UNREACHABLE });
    }
  }

  private set(status: BotStatus): void {
    this.status = status;
    this.emit('status', status);
  }
}
