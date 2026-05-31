import { EventEmitter } from 'events';
import type {
  ActionMode,
  ActionRef,
  Automation,
  AutomationActions,
  AutomationInput,
  Check,
  ChecksGate,
  Folder,
  FolderInput,
  ReorderDirection,
  Trigger,
  TriggerType
} from '@shared/ipc';

/**
 * Minimal structural view of the ConfigStore — we only read/write the
 * `folders` and `automations` slots. Keeping the surface narrow lets the
 * service stay trivially unit-testable with an in-memory fake.
 */
export interface AutomationsStore {
  get(key: 'folders'): unknown;
  get(key: 'automations'): unknown;
  set(key: 'folders', value: Folder[]): void | Promise<void>;
  set(key: 'automations', value: Automation[]): void | Promise<void>;
}

export interface AutomationsServiceDeps {
  store: AutomationsStore;
  /** ISO timestamp generator, swappable for deterministic tests. */
  now?: () => string;
}

const KNOWN_TRIGGER_TYPES: ReadonlySet<TriggerType> = new Set<TriggerType>([
  'chat_message',
  'follow',
  'sub',
  'bits',
  'raid',
  'channel_point_redemption',
  'stream_go_live',
  'stream_end',
  'obs_scene_switch',
  'obs_stream_start_stop',
  'manual_fire',
  'public_api_webhook'
]);

const KNOWN_CHECK_TYPES: ReadonlySet<string> = new Set(['variable', 'data']);

const KNOWN_ACTION_MODES: ReadonlySet<ActionMode> = new Set<ActionMode>([
  'standard',
  'random',
  'toggle',
  'sequence',
  'if_else',
  'switch_case'
]);

const KNOWN_CHECKS_GATES: ReadonlySet<ChecksGate> = new Set<ChecksGate>(['AND', 'OR']);

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Persists Folders and Automations (the rules-engine tree) to the ConfigStore.
 * Mirrors the structural pattern of ActionsService: hydrate on construction,
 * drop entries that fail validation so a corrupt config can't crash startup,
 * emit '*Changed' events with the full list after every mutation.
 *
 * Folder delete cascades by lifting children up one level (folders + automations)
 * rather than deleting them — a missing folder is far less painful than silent
 * data loss.
 */
export class AutomationsService extends EventEmitter {
  private readonly store: AutomationsStore;
  private readonly now: () => string;
  private folders: Folder[] = [];
  private automations: Automation[] = [];

  constructor(deps: AutomationsServiceDeps) {
    super();
    this.store = deps.store;
    this.now = deps.now ?? (() => new Date().toISOString());
    this.folders = hydrateFolders(this.store.get('folders'));
    this.automations = hydrateAutomations(this.store.get('automations'));
  }

  // ---- Folders ----------------------------------------------------------

  listFolders(): Folder[] {
    return [...this.folders];
  }

  async createFolder(input: FolderInput): Promise<Folder> {
    const name = requireName(input?.name, 'Folder');
    const parentId = input?.parentId ?? null;
    if (parentId !== null && !this.folders.some((f) => f.id === parentId)) {
      throw new Error('Parent folder does not exist');
    }
    const order = nextOrder(this.folders.filter((f) => f.parentId === parentId));
    const folder: Folder = {
      id: this.freshId('fld_'),
      name,
      parentId,
      order
    };
    this.folders = [...this.folders, folder];
    await this.persistFolders();
    this.emit('foldersChanged', this.listFolders());
    return folder;
  }

  async updateFolder(id: string, input: FolderInput): Promise<Folder | null> {
    const name = requireName(input?.name, 'Folder');
    const idx = this.folders.findIndex((f) => f.id === id);
    if (idx < 0) return null;
    const existing = this.folders[idx];
    const nextParentId = input?.parentId === undefined ? existing.parentId : input.parentId;
    const parentChanged = nextParentId !== existing.parentId;
    if (parentChanged) this.assertValidParent(id, nextParentId);
    // On a real move, recompute order so the folder gets a unique slot at the end
    // of its new sibling group — carrying the old order forward would collide with
    // an existing sibling and silently break reorder (equal orders swap to a no-op).
    const order = parentChanged
      ? nextOrder(this.folders.filter((f) => f.parentId === nextParentId && f.id !== id))
      : existing.order;
    const updated: Folder = { ...existing, name, parentId: nextParentId, order };
    const next = [...this.folders];
    next[idx] = updated;
    this.folders = next;
    await this.persistFolders();
    this.emit('foldersChanged', this.listFolders());
    return updated;
  }

  /**
   * Validate a proposed new parent for `folderId`: it must be null, or an
   * existing folder that is neither the folder itself nor one of its own
   * descendants (which would create a cycle and break the renderer's recursive
   * tree-walk). Throws on violation; the IPC layer surfaces it as a rejected call.
   */
  private assertValidParent(folderId: string, parentId: string | null): void {
    if (parentId === null) return;
    if (parentId === folderId) throw new Error('A folder cannot be its own parent');
    const byId = new Map(this.folders.map((f) => [f.id, f] as const));
    if (!byId.has(parentId)) throw new Error('Parent folder does not exist');
    // Walk up from the proposed parent; reaching folderId means parentId is a
    // descendant of folderId, so the move would create a cycle.
    let cursor: string | null = parentId;
    const seen = new Set<string>();
    while (cursor) {
      if (cursor === folderId) throw new Error('Cannot move a folder into its own descendant');
      if (seen.has(cursor)) break; // guard against a pre-existing cycle in persisted data
      seen.add(cursor);
      cursor = byId.get(cursor)?.parentId ?? null;
    }
  }

  async deleteFolder(id: string): Promise<boolean> {
    const target = this.folders.find((f) => f.id === id);
    if (!target) return false;
    // Lift direct children up one level. Recursive descendants stay attached
    // to those lifted children, so the whole subtree shifts up by one.
    const newParentId = target.parentId;
    this.folders = this.folders
      .filter((f) => f.id !== id)
      .map((f) => (f.parentId === id ? { ...f, parentId: newParentId } : f));
    this.automations = this.automations.map((a) =>
      a.folderId === id ? { ...a, folderId: newParentId, updatedAt: this.now() } : a
    );
    await this.persistFolders();
    await this.persistAutomations();
    this.emit('foldersChanged', this.listFolders());
    this.emit('automationsChanged', this.listAutomations());
    return true;
  }

  async reorderFolder(id: string, direction: ReorderDirection): Promise<boolean> {
    const target = this.folders.find((f) => f.id === id);
    if (!target) return false;
    const siblings = this.folders
      .filter((f) => f.parentId === target.parentId)
      .sort((a, b) => a.order - b.order);
    const pos = siblings.findIndex((f) => f.id === id);
    const swapWith = direction === 'up' ? siblings[pos - 1] : siblings[pos + 1];
    if (!swapWith) return false;
    const swapOrder = swapWith.order;
    this.folders = this.folders.map((f) => {
      if (f.id === target.id) return { ...f, order: swapOrder };
      if (f.id === swapWith.id) return { ...f, order: target.order };
      return f;
    });
    await this.persistFolders();
    this.emit('foldersChanged', this.listFolders());
    return true;
  }

  // ---- Automations ------------------------------------------------------

  listAutomations(): Automation[] {
    return [...this.automations];
  }

  async createAutomation(input: AutomationInput): Promise<Automation> {
    const name = requireName(input?.name, 'Automation');
    const triggers = input?.triggers ?? [];
    const checks = input?.checks ?? [];
    const actions = input?.actions ?? { mode: 'standard', refs: [] };
    const checksGate = input?.checksGate ?? 'AND';
    validateTriggers(triggers);
    validateChecks(checks);
    validateChecksGate(checksGate);
    validateActions(actions);
    const folderId = input?.folderId ?? null;
    if (folderId !== null && !this.folders.some((f) => f.id === folderId)) {
      throw new Error('Folder does not exist');
    }
    const order = nextOrder(this.automations.filter((a) => a.folderId === folderId));
    const ts = this.now();
    const automation: Automation = {
      id: this.freshId('auto_'),
      name,
      enabled: input?.enabled ?? true,
      folderId,
      order,
      queue: input?.queue ?? null,
      triggers,
      checks,
      checksGate,
      actions,
      createdAt: ts,
      updatedAt: ts
    };
    this.automations = [...this.automations, automation];
    await this.persistAutomations();
    this.emit('automationsChanged', this.listAutomations());
    return automation;
  }

  async updateAutomation(id: string, input: AutomationInput): Promise<Automation | null> {
    const name = requireName(input?.name, 'Automation');
    const idx = this.automations.findIndex((a) => a.id === id);
    if (idx < 0) return null;
    const existing = this.automations[idx];
    const triggers = input?.triggers ?? existing.triggers;
    const checks = input?.checks ?? existing.checks;
    const actions = input?.actions ?? existing.actions;
    const checksGate = input?.checksGate ?? existing.checksGate;
    validateTriggers(triggers);
    validateChecks(checks);
    validateChecksGate(checksGate);
    validateActions(actions);
    const nextFolderId = input?.folderId === undefined ? existing.folderId : input.folderId;
    const folderChanged = nextFolderId !== existing.folderId;
    if (folderChanged && nextFolderId !== null && !this.folders.some((f) => f.id === nextFolderId)) {
      throw new Error('Folder does not exist');
    }
    // Recompute order on a real folder move so it appends uniquely to the new
    // group — see updateFolder for why a carried-over order breaks reorder.
    const order = folderChanged
      ? nextOrder(this.automations.filter((a) => a.folderId === nextFolderId && a.id !== id))
      : existing.order;
    const updated: Automation = {
      ...existing,
      name,
      enabled: input?.enabled ?? existing.enabled,
      folderId: nextFolderId,
      order,
      queue: input?.queue === undefined ? existing.queue : input.queue,
      triggers,
      checks,
      checksGate,
      actions,
      updatedAt: this.now()
    };
    const next = [...this.automations];
    next[idx] = updated;
    this.automations = next;
    await this.persistAutomations();
    this.emit('automationsChanged', this.listAutomations());
    return updated;
  }

  async deleteAutomation(id: string): Promise<boolean> {
    const idx = this.automations.findIndex((a) => a.id === id);
    if (idx < 0) return false;
    const next = [...this.automations];
    next.splice(idx, 1);
    this.automations = next;
    await this.persistAutomations();
    this.emit('automationsChanged', this.listAutomations());
    return true;
  }

  async reorderAutomation(id: string, direction: ReorderDirection): Promise<boolean> {
    const target = this.automations.find((a) => a.id === id);
    if (!target) return false;
    const siblings = this.automations
      .filter((a) => a.folderId === target.folderId)
      .sort((a, b) => a.order - b.order);
    const pos = siblings.findIndex((a) => a.id === id);
    const swapWith = direction === 'up' ? siblings[pos - 1] : siblings[pos + 1];
    if (!swapWith) return false;
    const swapOrder = swapWith.order;
    this.automations = this.automations.map((a) => {
      if (a.id === target.id) return { ...a, order: swapOrder };
      if (a.id === swapWith.id) return { ...a, order: target.order };
      return a;
    });
    await this.persistAutomations();
    this.emit('automationsChanged', this.listAutomations());
    return true;
  }

  async testFireAutomation(id: string): Promise<boolean> {
    const target = this.automations.find((a) => a.id === id);
    if (!target) return false;
    this.emit('fired', { automationId: id, at: this.now() });
    return true;
  }

  /**
   * Strip every reference to a now-deleted Action from all automations' action
   * blocks (refs / ifElse / switchCase). Called when an Action is deleted so
   * automations don't keep dangling actionIds that resolve to nothing.
   * Returns whether anything changed.
   */
  async removeActionRefs(actionId: string): Promise<boolean> {
    let changed = false;
    this.automations = this.automations.map((a) => {
      const cleaned = stripActionRefs(a.actions, actionId);
      if (cleaned === a.actions) return a;
      changed = true;
      return { ...a, actions: cleaned, updatedAt: this.now() };
    });
    if (changed) {
      await this.persistAutomations();
      this.emit('automationsChanged', this.listAutomations());
    }
    return changed;
  }

  /** Generate an id with the given prefix, guaranteed not to collide with an
   *  existing folder or automation id. */
  private freshId(prefix: string): string {
    const taken = new Set<string>([...this.folders.map((f) => f.id), ...this.automations.map((a) => a.id)]);
    let id = genId(prefix);
    while (taken.has(id)) id = genId(prefix);
    return id;
  }

  // ---- persistence ------------------------------------------------------

  private async persistFolders(): Promise<void> {
    await this.store.set('folders', this.folders);
  }

  private async persistAutomations(): Promise<void> {
    await this.store.set('automations', this.automations);
  }
}

// ---- helpers --------------------------------------------------------------

function requireName(raw: unknown, label: string): string {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) throw new Error(`${label} name is required`);
  return name;
}

function nextOrder(siblings: Array<{ order: number }>): number {
  return siblings.reduce((max, s) => (s.order > max ? s.order : max), -1) + 1;
}

/** Remove every ActionRef matching `actionId` from an action block. Returns the
 *  SAME object reference when nothing changed so callers can skip a needless write. */
function stripActionRefs(actions: AutomationActions, actionId: string): AutomationActions {
  let changed = false;
  const filter = (refs: ActionRef[]): ActionRef[] => {
    const next = refs.filter((r) => r.actionId !== actionId);
    if (next.length !== refs.length) changed = true;
    return next;
  };
  const next: AutomationActions = { ...actions };
  if (actions.refs) next.refs = filter(actions.refs);
  if (actions.ifElse) {
    next.ifElse = {
      ...actions.ifElse,
      thenActions: filter(actions.ifElse.thenActions),
      elseActions: filter(actions.ifElse.elseActions)
    };
  }
  if (actions.switchCase) {
    next.switchCase = {
      ...actions.switchCase,
      cases: actions.switchCase.cases.map((c) => ({ ...c, actions: filter(c.actions) })),
      defaultActions: filter(actions.switchCase.defaultActions)
    };
  }
  return changed ? next : actions;
}

function validateTriggers(triggers: Trigger[]): void {
  if (!Array.isArray(triggers)) {
    throw new Error('Automation triggers must be an array');
  }
  for (const t of triggers) {
    const type = (t as { type?: unknown } | undefined)?.type;
    if (typeof type !== 'string' || !KNOWN_TRIGGER_TYPES.has(type as TriggerType)) {
      throw new Error(`Unknown trigger type: ${String(type)}`);
    }
  }
}

function validateChecks(checks: Check[]): void {
  if (!Array.isArray(checks)) {
    throw new Error('Automation checks must be an array');
  }
  for (const c of checks) {
    const type = (c as { type?: unknown } | undefined)?.type;
    if (typeof type !== 'string' || !KNOWN_CHECK_TYPES.has(type)) {
      throw new Error(`Unknown check type: ${String(type)}`);
    }
  }
}

function validateChecksGate(gate: ChecksGate): void {
  if (!KNOWN_CHECKS_GATES.has(gate)) {
    throw new Error(`Unknown checks gate: ${String(gate)}`);
  }
}

function validateActions(actions: AutomationActions): void {
  const mode = (actions as { mode?: unknown } | undefined)?.mode;
  if (typeof mode !== 'string' || !KNOWN_ACTION_MODES.has(mode as ActionMode)) {
    throw new Error(`Unknown action mode: ${String(mode)}`);
  }
}

function hydrateFolders(raw: unknown): Folder[] {
  if (!Array.isArray(raw)) return [];
  const out: Folder[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (isValidPersistedFolder(entry) && !seen.has(entry.id)) {
      seen.add(entry.id);
      out.push(entry);
    }
  }
  return out;
}

function isValidPersistedFolder(v: unknown): v is Folder {
  if (!v || typeof v !== 'object') return false;
  const f = v as Record<string, unknown>;
  if (typeof f.id !== 'string' || !f.id) return false;
  if (typeof f.name !== 'string' || !f.name) return false;
  if (!(f.parentId === null || typeof f.parentId === 'string')) return false;
  if (typeof f.order !== 'number') return false;
  return true;
}

function hydrateAutomations(raw: unknown): Automation[] {
  if (!Array.isArray(raw)) return [];
  const out: Automation[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (isValidPersistedAutomation(entry) && !seen.has(entry.id)) {
      seen.add(entry.id);
      out.push(entry);
    }
  }
  return out;
}

function isValidPersistedAutomation(v: unknown): v is Automation {
  if (!v || typeof v !== 'object') return false;
  const a = v as Record<string, unknown>;
  if (typeof a.id !== 'string' || !a.id) return false;
  if (typeof a.name !== 'string' || !a.name) return false;
  if (typeof a.createdAt !== 'string' || typeof a.updatedAt !== 'string') return false;
  if (!Array.isArray(a.triggers)) return false;
  for (const t of a.triggers) {
    const type = (t as { type?: unknown } | undefined)?.type;
    if (typeof type !== 'string' || !KNOWN_TRIGGER_TYPES.has(type as TriggerType)) return false;
  }
  if (!Array.isArray(a.checks)) return false;
  for (const c of a.checks) {
    const type = (c as { type?: unknown } | undefined)?.type;
    if (typeof type !== 'string' || !KNOWN_CHECK_TYPES.has(type)) return false;
  }
  const gate = a.checksGate;
  if (typeof gate !== 'string' || !KNOWN_CHECKS_GATES.has(gate as ChecksGate)) return false;
  const actions = a.actions as { mode?: unknown } | undefined;
  if (!actions || typeof actions !== 'object') return false;
  if (typeof actions.mode !== 'string' || !KNOWN_ACTION_MODES.has(actions.mode as ActionMode)) return false;
  return true;
}

function genId(prefix: string): string {
  let s = prefix;
  for (let i = 0; i < 10; i++) {
    s += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  }
  return s;
}
