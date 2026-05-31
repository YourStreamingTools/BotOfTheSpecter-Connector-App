import { EventEmitter } from 'events';
import type { LogEntry, LogLevel, LogSource } from '@shared/ipc';

export class LogService extends EventEmitter {
  private buf: LogEntry[] = [];
  private secrets = new Set<string>();

  constructor(private cap = 500) {
    super();
  }

  /** Register a secret (e.g. the API key) to scrub from every log line, whatever its source. */
  registerSecret(secret: string | undefined): void {
    if (secret && secret.length >= 6) this.secrets.add(secret);
  }

  add(src: LogSource, level: LogLevel, message: string): void {
    let safe = message;
    for (const s of this.secrets) if (safe.includes(s)) safe = safe.split(s).join('***REDACTED***');
    const entry: LogEntry = { t: timecode(), src, level, message: safe };
    this.buf.unshift(entry);
    if (this.buf.length > this.cap) this.buf.length = this.cap;
    this.emit('line', entry);
  }

  snapshot(): LogEntry[] {
    return [...this.buf];
  }

  export(): string {
    return this.buf
      .slice()
      .reverse()
      .map((e) => `[${e.t}] ${e.src.padEnd(6)} ${e.level.toUpperCase().padEnd(4)} ${e.message}`)
      .join('\n');
  }
}

function timecode(): string {
  const d = new Date();
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`;
}
