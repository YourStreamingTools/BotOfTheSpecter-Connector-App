import { EventEmitter } from 'events';
import type { Action, ActionInput, ActionType } from '@shared/ipc';

/**
 * Minimal structural view of the ConfigStore — we only read/write the
 * `actions` slot, so we don't take a dependency on the full ConfigStore class
 * here (keeps the service trivially unit-testable with an in-memory fake).
 */
export interface ActionsStore {
  get(key: 'actions'): unknown;
  set(key: 'actions', value: Action[]): void | Promise<void>;
}

export interface ActionsServiceDeps {
  store: ActionsStore;
  /** ISO timestamp generator, swappable for deterministic tests. */
  now?: () => string;
}

const KNOWN_TYPES: ReadonlySet<ActionType> = new Set<ActionType>([
  'call_webpage',
  'change_variable',
  'trigger_command',
  'play_sound',
  'tts',
  'toggle_automation',
  'send_webhook',
  'toggle_redemption',
  'run_ads',
  'create_marker',
  'start_end_poll',
  'start_cancel_prediction',
  'toggle_slow_mode',
  'create_clip'
]);

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Persists the Actions list (reusable units of work driven by Automations) to
 * the ConfigStore. CRUD methods emit 'changed' with the full list so the
 * renderer can stay in sync without polling. Hydrates on construction and
 * drops any persisted entry that doesn't match the Action shape so a corrupt
 * config can't crash startup.
 */
export class ActionsService extends EventEmitter {
  private readonly store: ActionsStore;
  private readonly now: () => string;
  private items: Action[] = [];

  constructor(deps: ActionsServiceDeps) {
    super();
    this.store = deps.store;
    this.now = deps.now ?? (() => new Date().toISOString());
    this.items = hydrate(this.store.get('actions'));
  }

  list(): Action[] {
    return [...this.items];
  }

  async create(input: ActionInput): Promise<Action> {
    validateInput(input);
    const ts = this.now();
    const action: Action = {
      id: this.freshId(),
      name: input.name.trim(),
      enabled: input.enabled ?? true,
      body: input.body,
      createdAt: ts,
      updatedAt: ts
    };
    this.items = [...this.items, action];
    await this.store.set('actions', this.items);
    this.emit('changed', this.list());
    return action;
  }

  async update(id: string, input: ActionInput): Promise<Action | null> {
    validateInput(input);
    const idx = this.items.findIndex((a) => a.id === id);
    if (idx < 0) return null;
    const existing = this.items[idx];
    const updated: Action = {
      ...existing,
      name: input.name.trim(),
      enabled: input.enabled ?? true,
      body: input.body,
      updatedAt: this.now()
    };
    const next = [...this.items];
    next[idx] = updated;
    this.items = next;
    await this.store.set('actions', this.items);
    this.emit('changed', this.list());
    return updated;
  }

  /** Generate an id guaranteed not to collide with an existing action. */
  private freshId(): string {
    const taken = new Set(this.items.map((a) => a.id));
    let id = genId();
    while (taken.has(id)) id = genId();
    return id;
  }

  async delete(id: string): Promise<boolean> {
    const idx = this.items.findIndex((a) => a.id === id);
    if (idx < 0) return false;
    const next = [...this.items];
    next.splice(idx, 1);
    this.items = next;
    await this.store.set('actions', this.items);
    this.emit('changed', this.list());
    return true;
  }
}

// ---- helpers -------------------------------------------------------------

function validateInput(input: ActionInput): void {
  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  if (!name) throw new Error('Action name is required');
  const type = (input?.body as { type?: unknown } | undefined)?.type;
  if (typeof type !== 'string' || !KNOWN_TYPES.has(type as ActionType)) {
    throw new Error(`Unknown action type: ${String(type)}`);
  }
  const config = (input.body as { config?: unknown }).config;
  if (!config || typeof config !== 'object') {
    throw new Error('Action body config must be an object');
  }
}

function hydrate(raw: unknown): Action[] {
  if (!Array.isArray(raw)) return [];
  const out: Action[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    // Drop duplicate ids (e.g. from a hand-merged config) so CRUD-by-id can't
    // hit the wrong record.
    if (isValidPersistedAction(entry) && !seen.has(entry.id)) {
      seen.add(entry.id);
      out.push(entry);
    }
  }
  return out;
}

function isValidPersistedAction(v: unknown): v is Action {
  if (!v || typeof v !== 'object') return false;
  const a = v as Record<string, unknown>;
  if (typeof a.id !== 'string' || !a.id) return false;
  if (typeof a.name !== 'string') return false;
  if (typeof a.createdAt !== 'string' || typeof a.updatedAt !== 'string') return false;
  const body = a.body as { type?: unknown; config?: unknown } | undefined;
  if (!body || typeof body !== 'object') return false;
  if (typeof body.type !== 'string' || !KNOWN_TYPES.has(body.type as ActionType)) return false;
  if (!body.config || typeof body.config !== 'object') return false;
  return true;
}

function genId(): string {
  let s = 'act_';
  for (let i = 0; i < 10; i++) {
    s += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  }
  return s;
}
