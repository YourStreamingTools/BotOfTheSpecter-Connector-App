import { promises as fsp, existsSync, readFileSync, mkdirSync } from 'fs';
import { dirname } from 'path';
import type { AppConfig } from '@shared/ipc';

/** Crash-safe JSON config. No electron import → unit-testable in node. */
export class ConfigStore {
  private data: AppConfig;
  // Writes are serialized so concurrent set()/merge() calls never race on the
  // temp file. Each write uses a unique temp name and the chain never breaks.
  private writeChain: Promise<unknown> = Promise.resolve();
  private writeSeq = 0;

  constructor(private readonly filePath: string) {
    this.data = this.load();
  }

  private load(): AppConfig {
    try {
      if (existsSync(this.filePath)) {
        return JSON.parse(readFileSync(this.filePath, 'utf-8')) as AppConfig;
      }
    } catch {
      // Corrupt or unreadable → start clean rather than crash.
    }
    return {};
  }

  get<K extends keyof AppConfig>(key: K): AppConfig[K] | undefined {
    return this.data[key];
  }

  all(): AppConfig {
    return { ...this.data };
  }

  async set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void> {
    this.data[key] = value;
    await this.persist();
  }

  async merge(patch: Partial<AppConfig>): Promise<void> {
    this.data = { ...this.data, ...patch };
    await this.persist();
  }

  getPath(): string {
    return this.filePath;
  }

  private persist(): Promise<void> {
    const snapshot = JSON.stringify(this.data, null, 2);
    // Queue after any in-flight write (ignoring its outcome) so writes never overlap.
    const run = this.writeChain.catch(() => undefined).then(() => this.writeOnce(snapshot));
    this.writeChain = run.catch(() => undefined);
    return run;
  }

  private async writeOnce(snapshot: string): Promise<void> {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.${++this.writeSeq}.tmp`;
    try {
      await fsp.writeFile(tmp, snapshot, 'utf-8');
      await fsp.rename(tmp, this.filePath); // atomic on the same volume
    } catch (err) {
      // A failed write (or rename) must not leave the unique temp file behind —
      // otherwise repeated failures accumulate orphans in userData.
      await fsp.unlink(tmp).catch(() => undefined);
      throw err;
    }
  }
}
