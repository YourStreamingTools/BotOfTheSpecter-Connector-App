import { EventEmitter } from 'events';
import { BOTOFTHESPECTER_API_BASE } from '@shared/constants';
import type { BuiltinCommand, BuiltinCommandUpdate, CustomCommand, UserCommand, CommandsSnapshot } from '@shared/ipc';

export interface CommandsServiceDeps {
  fetch?: typeof fetch;
  /** Live API key getter — re-read every refresh so a Settings change takes effect. */
  getApiKey: () => string;
}

const PUBLIC_BUILTIN = `${BOTOFTHESPECTER_API_BASE}/commands/info`;
const CUSTOM_URL    = `${BOTOFTHESPECTER_API_BASE}/v2/custom-commands`;
const USER_URL      = `${BOTOFTHESPECTER_API_BASE}/v2/user-commands/get/all`;

/**
 * Aggregates the three command lists shown on the Commands screen:
 *  - built-in: GET /commands/info (public)
 *  - custom:   GET /v2/custom-commands (X-API-KEY)
 *  - user:     GET /v2/user-commands/get/all (X-API-KEY, grouped by owner)
 *
 * The renderer always reads from the latest snapshot — a refresh emits 'changed'
 * with the new snapshot so subscribers don't need to poll.
 */
export class CommandsService extends EventEmitter {
  private fetch: typeof fetch;
  private getApiKey: () => string;
  private snap: CommandsSnapshot = { builtin: [], custom: [], user: [], state: 'idle' };
  // Per-streamer overrides applied via updateBuiltin. /commands/info does NOT
  // return these, so we must remember them locally to survive a refresh.
  // Cleared if/when the API exposes a GET endpoint for streamer-side built-in state.
  private builtinOverrides = new Map<string, { enabled: boolean; forceLevel: string }>();

  constructor(deps: CommandsServiceDeps) {
    super();
    this.fetch = deps.fetch ?? fetch;
    this.getApiKey = deps.getApiKey;
  }

  snapshot(): CommandsSnapshot {
    return this.snap;
  }

  /**
   * Update the streamer's override for a built-in command (status + permission).
   * The API accepts the change as query params on a PUT; success is signalled by
   * `{ status: "success", ... }` in the JSON body. We mirror the change onto the
   * in-memory snapshot on success so the UI reflects it without a re-fetch.
   */
  async updateBuiltin(name: string, patch: BuiltinCommandUpdate): Promise<boolean> {
    const key = (this.getApiKey() ?? '').trim();
    if (!key || !name) return false;
    const qs = new URLSearchParams({ command: name, status: patch.status, permission: patch.permission });
    try {
      const res = await this.fetch(`${BOTOFTHESPECTER_API_BASE}/v2/builtin-commands/update?${qs.toString()}`, {
        method: 'PUT',
        headers: { accept: 'application/json', 'X-API-KEY': key }
      });
      if (!res.ok) return false;
      const body = (await res.json()) as { status?: unknown };
      if (String(body?.status ?? '').toLowerCase() !== 'success') return false;
      // Remember the override + mirror onto the snapshot so subsequent refreshes
      // (which only see catalog defaults) don't undo it.
      const enabled = patch.status === 'Enabled';
      this.builtinOverrides.set(name, { enabled, forceLevel: patch.permission });
      const next = this.snap.builtin.map((c) => c.name === name
        ? { ...c, enabled, forceLevel: patch.permission }
        : c);
      this.snap = { ...this.snap, builtin: next };
      this.emit('changed', this.snap);
      return true;
    } catch {
      return false;
    }
  }

  async refresh(): Promise<void> {
    this.snap = { ...this.snap, state: 'loading', error: undefined };
    // Emit the loading transition so the renderer can show a spinner instead of
    // jumping straight from stale data to the final result.
    this.emit('changed', this.snap);
    const key = (this.getApiKey() ?? '').trim();

    const [builtin, custom, user] = await Promise.all([
      this.fetchBuiltin(),
      key ? this.fetchCustom(key) : Promise.resolve({ ok: true as const, data: [] as CustomCommand[] }),
      key ? this.fetchUser(key)   : Promise.resolve({ ok: true as const, data: [] as UserCommand[] })
    ]);

    const errors: string[] = [];
    if (!builtin.ok) errors.push(`built-in commands: ${builtin.error}`);
    if (!custom.ok)  errors.push(`custom commands: ${custom.error}`);
    if (!user.ok)    errors.push(`user commands: ${user.error}`);

    // Layer remembered overrides over the freshly-fetched catalog so a saved
    // Disabled/permission survives a refresh.
    const mergedBuiltin = builtin.ok
      ? builtin.data.map((c) => {
          const o = this.builtinOverrides.get(c.name);
          return o ? { ...c, enabled: o.enabled, forceLevel: o.forceLevel } : c;
        })
      : [];

    this.snap = {
      builtin: mergedBuiltin,
      custom:  custom.ok  ? custom.data  : [],
      user:    user.ok    ? user.data    : [],
      state: errors.length ? 'error' : 'ok',
      error: errors.length ? errors.join('; ') : undefined,
      fetchedAt: new Date().toISOString()
    };
    this.emit('changed', this.snap);
  }

  // ---- per-endpoint fetchers (return a tagged result so partial failures still surface) ----

  private async fetchBuiltin(): Promise<{ ok: true; data: BuiltinCommand[] } | { ok: false; error: string }> {
    try {
      const res = await this.fetch(PUBLIC_BUILTIN, { headers: { accept: 'application/json' } });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      // Shape: { commands: { <name>: { description, syntax, aliases?, force_level? } } }.
      // One of the entries IS literally named "commands" — don't descend twice or
      // you end up iterating that single entry's sub-keys (description/aliases/syntax).
      const body = (await res.json()) as { commands?: Record<string, RawBuiltin> };
      const map = body?.commands ?? {};
      return { ok: true, data: Object.entries(map).map(([name, raw]) => normaliseBuiltin(name, raw)) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fetch failed' };
    }
  }

  private async fetchCustom(key: string): Promise<{ ok: true; data: CustomCommand[] } | { ok: false; error: string }> {
    try {
      const res = await this.fetch(CUSTOM_URL, { headers: { accept: 'application/json', 'X-API-KEY': key } });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const body = (await res.json()) as { commands?: Array<RawCustom> };
      const list = Array.isArray(body?.commands) ? body!.commands : [];
      return { ok: true, data: list.map(normaliseCustom) };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fetch failed' };
    }
  }

  private async fetchUser(key: string): Promise<{ ok: true; data: UserCommand[] } | { ok: false; error: string }> {
    try {
      const res = await this.fetch(USER_URL, { headers: { accept: 'application/json', 'X-API-KEY': key } });
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      const body = (await res.json()) as { commands?: Record<string, Array<RawUser>>; profile_images?: Record<string, string> };
      const grouped = body?.commands ?? {};
      const avatars = body?.profile_images ?? {};
      const flat: UserCommand[] = [];
      for (const [ownerLogin, entries] of Object.entries(grouped)) {
        if (!Array.isArray(entries)) continue;
        for (const e of entries) flat.push(normaliseUser(e, ownerLogin, avatars[ownerLogin]));
      }
      return { ok: true, data: flat };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'fetch failed' };
    }
  }
}

// ---- normalisers — keep these free functions so they're trivially testable later ----

interface RawBuiltin { description?: string; aliases?: unknown; syntax?: unknown; force_level?: unknown }
interface RawCustom  { command?: unknown; response?: unknown; status?: unknown; cooldown?: unknown; permission?: unknown }
interface RawUser    { command?: unknown; response?: unknown; status?: unknown; cooldown?: unknown }

function asStringArray(v: unknown): string[] {
  if (typeof v === 'string') return v ? [v] : [];
  if (Array.isArray(v)) return v.filter((x): x is string => typeof x === 'string' && x.length > 0);
  return [];
}

function normaliseBuiltin(name: string, raw: RawBuiltin): BuiltinCommand {
  return {
    name,
    description: typeof raw.description === 'string' ? raw.description : '',
    usage: asStringArray(raw.syntax),
    aliases: asStringArray(raw.aliases),
    forceLevel: typeof raw.force_level === 'string' && raw.force_level ? raw.force_level : 'everyone',
    enabled: true // default — overridden in-memory after a PUT update
  };
}

function normaliseCustom(raw: RawCustom): CustomCommand {
  return {
    name: String(raw.command ?? ''),
    response: String(raw.response ?? ''),
    enabled: String(raw.status ?? '').toLowerCase() === 'enabled',
    cooldown: Number(raw.cooldown ?? 0),
    permission: String(raw.permission ?? 'everyone')
  };
}

function normaliseUser(raw: RawUser, ownerLogin: string, ownerProfileImage?: string): UserCommand {
  return {
    name: String(raw.command ?? ''),
    response: String(raw.response ?? ''),
    enabled: String(raw.status ?? '').toLowerCase() === 'enabled',
    cooldown: Number(raw.cooldown ?? 0),
    ownerLogin,
    ownerProfileImage: typeof ownerProfileImage === 'string' && ownerProfileImage ? ownerProfileImage : undefined
  };
}
