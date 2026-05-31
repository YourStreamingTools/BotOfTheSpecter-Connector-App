// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { AutomationsService } from './automations-service';
import type {
  Automation,
  AutomationActions,
  AutomationInput,
  Check,
  Folder,
  Trigger,
  TriggerType
} from '@shared/ipc';

// Lightweight in-memory ConfigStore stand-in matching what AutomationsService consumes.
function fakeStore(initial: { folders?: unknown; automations?: unknown } = {}) {
  let data: { folders?: unknown; automations?: unknown } = { ...initial };
  return {
    get: vi.fn((k: 'folders' | 'automations') => data[k]),
    set: vi.fn(async (k: 'folders' | 'automations', v: unknown) => { data = { ...data, [k]: v }; })
  };
}

const baseAutomationInput: AutomationInput = {
  name: 'My automation'
};

// ---- Folders --------------------------------------------------------------

describe('AutomationsService folders.create', () => {
  it('assigns an fld_ id and order:0 for the first root folder', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const f = await svc.createFolder({ name: 'Root' });
    expect(f.id).toMatch(/^fld_/);
    expect(f.name).toBe('Root');
    expect(f.parentId).toBeNull();
    expect(f.order).toBe(0);
  });

  it('orders subsequent siblings under the same parent', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const a = await svc.createFolder({ name: 'A' });
    const b = await svc.createFolder({ name: 'B' });
    const child1 = await svc.createFolder({ name: 'C1', parentId: a.id });
    const child2 = await svc.createFolder({ name: 'C2', parentId: a.id });
    expect(a.order).toBe(0);
    expect(b.order).toBe(1);
    expect(child1.order).toBe(0);
    expect(child2.order).toBe(1);
  });

  it('rejects an empty name', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    await expect(svc.createFolder({ name: '' })).rejects.toThrow(/name/i);
    await expect(svc.createFolder({ name: '   ' })).rejects.toThrow(/name/i);
  });

  it('emits foldersChanged after create', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const seen: number[] = [];
    svc.on('foldersChanged', (list: Folder[]) => seen.push(list.length));
    await svc.createFolder({ name: 'A' });
    await svc.createFolder({ name: 'B' });
    expect(seen).toEqual([1, 2]);
  });
});

describe('AutomationsService folders.update', () => {
  it('returns null for an unknown id', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    expect(await svc.updateFolder('nope', { name: 'x' })).toBeNull();
  });

  it('updates the name and persists', async () => {
    const store = fakeStore();
    const svc = new AutomationsService({ store });
    const f = await svc.createFolder({ name: 'Old' });
    const u = await svc.updateFolder(f.id, { name: 'New' });
    expect(u?.name).toBe('New');
    expect(svc.listFolders().find((x) => x.id === f.id)?.name).toBe('New');
  });
});

describe('AutomationsService folders.delete', () => {
  it('cascades by lifting children up one level', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const root = await svc.createFolder({ name: 'Root' });
    const mid = await svc.createFolder({ name: 'Mid', parentId: root.id });
    const leaf = await svc.createFolder({ name: 'Leaf', parentId: mid.id });
    const a = await svc.createAutomation({ name: 'A', folderId: mid.id });

    expect(await svc.deleteFolder(mid.id)).toBe(true);
    const folders = svc.listFolders();
    // mid is gone
    expect(folders.find((f) => f.id === mid.id)).toBeUndefined();
    // leaf moved up to root
    expect(folders.find((f) => f.id === leaf.id)?.parentId).toBe(root.id);
    // automation moved up to root (mid's parentId)
    expect(svc.listAutomations().find((x) => x.id === a.id)?.folderId).toBe(root.id);
  });

  it('returns false on an unknown id', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    expect(await svc.deleteFolder('nope')).toBe(false);
  });

  it('emits foldersChanged on delete', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const f = await svc.createFolder({ name: 'A' });
    const seen: number[] = [];
    svc.on('foldersChanged', (list: Folder[]) => seen.push(list.length));
    await svc.deleteFolder(f.id);
    expect(seen).toEqual([0]);
  });
});

describe('AutomationsService folders.reorder', () => {
  it('swaps with previous sibling on up; false at the top', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const a = await svc.createFolder({ name: 'A' });
    const b = await svc.createFolder({ name: 'B' });
    expect(await svc.reorderFolder(b.id, 'up')).toBe(true);
    const folders = svc.listFolders();
    expect(folders.find((f) => f.id === a.id)?.order).toBe(1);
    expect(folders.find((f) => f.id === b.id)?.order).toBe(0);
    // a is now at top
    expect(await svc.reorderFolder(b.id, 'up')).toBe(false);
  });

  it('swaps with next sibling on down; false at the bottom', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const a = await svc.createFolder({ name: 'A' });
    const b = await svc.createFolder({ name: 'B' });
    expect(await svc.reorderFolder(a.id, 'down')).toBe(true);
    const folders = svc.listFolders();
    expect(folders.find((f) => f.id === a.id)?.order).toBe(1);
    expect(folders.find((f) => f.id === b.id)?.order).toBe(0);
    expect(await svc.reorderFolder(a.id, 'down')).toBe(false);
  });

  it('returns false for unknown id', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    expect(await svc.reorderFolder('nope', 'up')).toBe(false);
  });

  it('only swaps siblings under the same parentId', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const a = await svc.createFolder({ name: 'A' });
    const c1 = await svc.createFolder({ name: 'C1', parentId: a.id });
    // single child — no sibling to swap with
    expect(await svc.reorderFolder(c1.id, 'up')).toBe(false);
    expect(await svc.reorderFolder(c1.id, 'down')).toBe(false);
  });
});

describe('AutomationsService listFolders', () => {
  it('rehydrates from the store on construction', () => {
    const persisted: Folder[] = [
      { id: 'fld_1234567890', name: 'Persisted', parentId: null, order: 0 }
    ];
    const svc = new AutomationsService({ store: fakeStore({ folders: persisted }) });
    expect(svc.listFolders()).toEqual(persisted);
  });

  it('drops persisted folders that are missing id or name', () => {
    const persisted = [
      { id: 'fld_good_abc', name: 'OK', parentId: null, order: 0 },
      { id: '', name: 'No id', parentId: null, order: 1 },
      { id: 'fld_no_name', parentId: null, order: 2 },
      'not-an-object'
    ];
    const svc = new AutomationsService({ store: fakeStore({ folders: persisted }) });
    expect(svc.listFolders().map((f) => f.id)).toEqual(['fld_good_abc']);
  });
});

// ---- Automations ----------------------------------------------------------

describe('AutomationsService automations.create', () => {
  it('assigns an auto_ id and the documented defaults', async () => {
    const store = fakeStore();
    const svc = new AutomationsService({ store, now: () => '2026-05-28T10:00:00.000Z' });
    const a = await svc.createAutomation(baseAutomationInput);
    expect(a.id).toMatch(/^auto_/);
    expect(a.name).toBe('My automation');
    expect(a.enabled).toBe(true);
    expect(a.folderId).toBeNull();
    expect(a.queue).toBeNull();
    expect(a.checksGate).toBe('AND');
    expect(a.actions).toEqual({ mode: 'standard', refs: [] });
    expect(a.triggers).toEqual([]);
    expect(a.checks).toEqual([]);
    expect(a.createdAt).toBe('2026-05-28T10:00:00.000Z');
    expect(a.updatedAt).toBe('2026-05-28T10:00:00.000Z');
    expect(a.order).toBe(0);
    expect(store.set).toHaveBeenCalledWith('automations', [a]);
  });

  it('appends with incrementing order within the same folder', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const a = await svc.createAutomation({ name: 'A' });
    const b = await svc.createAutomation({ name: 'B' });
    expect(a.order).toBe(0);
    expect(b.order).toBe(1);
  });

  it('rejects an empty name', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    await expect(svc.createAutomation({ name: '' })).rejects.toThrow(/name/i);
    await expect(svc.createAutomation({ name: '   ' })).rejects.toThrow(/name/i);
  });

  it('rejects an unknown trigger type', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    await expect(
      // @ts-expect-error — testing the runtime guard
      svc.createAutomation({ name: 'X', triggers: [{ type: 'fake', config: {} }] })
    ).rejects.toThrow(/type/i);
  });

  it('rejects an unknown check type', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    await expect(
      svc.createAutomation({
        name: 'X',
        // @ts-expect-error — testing the runtime guard
        checks: [{ type: 'made_up', variable: 'v', operator: 'eq', value: '1' }]
      })
    ).rejects.toThrow(/type/i);
  });

  it('rejects an unknown action mode', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    await expect(
      svc.createAutomation({
        name: 'X',
        // @ts-expect-error — testing the runtime guard
        actions: { mode: 'bonkers' }
      })
    ).rejects.toThrow(/mode/i);
  });

  it('emits automationsChanged on create', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const seen: number[] = [];
    svc.on('automationsChanged', (list: Automation[]) => seen.push(list.length));
    await svc.createAutomation({ name: 'A' });
    await svc.createAutomation({ name: 'B' });
    expect(seen).toEqual([1, 2]);
  });
});

describe('AutomationsService automations.update', () => {
  it('preserves createdAt and refreshes updatedAt', async () => {
    let ts = '2026-05-28T10:00:00.000Z';
    const svc = new AutomationsService({ store: fakeStore(), now: () => ts });
    const a = await svc.createAutomation({ name: 'Original' });
    ts = '2026-05-28T11:00:00.000Z';
    const u = await svc.updateAutomation(a.id, {
      name: 'Renamed',
      enabled: false,
      folderId: null,
      queue: 'q1',
      checksGate: 'OR',
      actions: { mode: 'random', refs: [{ actionId: 'act_xyz' }] }
    });
    expect(u).toMatchObject({
      id: a.id,
      name: 'Renamed',
      enabled: false,
      queue: 'q1',
      checksGate: 'OR',
      createdAt: a.createdAt,
      updatedAt: '2026-05-28T11:00:00.000Z'
    });
    expect(u?.actions).toEqual({ mode: 'random', refs: [{ actionId: 'act_xyz' }] });
  });

  it('returns null for unknown id', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    expect(await svc.updateAutomation('nope', { name: 'x' })).toBeNull();
  });

  it('emits automationsChanged after update', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const a = await svc.createAutomation({ name: 'A' });
    const seen: number[] = [];
    svc.on('automationsChanged', (list: Automation[]) => seen.push(list.length));
    await svc.updateAutomation(a.id, { name: 'A2' });
    expect(seen).toEqual([1]);
  });
});

describe('AutomationsService automations.delete', () => {
  it('removes and persists', async () => {
    const store = fakeStore();
    const svc = new AutomationsService({ store });
    const a = await svc.createAutomation({ name: 'A' });
    expect(await svc.deleteAutomation(a.id)).toBe(true);
    expect(svc.listAutomations()).toEqual([]);
    expect(store.set).toHaveBeenLastCalledWith('automations', []);
  });

  it('returns false on unknown id', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    expect(await svc.deleteAutomation('nope')).toBe(false);
  });

  it('emits automationsChanged on delete', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const a = await svc.createAutomation({ name: 'A' });
    const seen: number[] = [];
    svc.on('automationsChanged', (list: Automation[]) => seen.push(list.length));
    await svc.deleteAutomation(a.id);
    expect(seen).toEqual([0]);
  });
});

describe('AutomationsService automations.reorder', () => {
  it('swaps two automations in the same folder', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const a = await svc.createAutomation({ name: 'A' });
    const b = await svc.createAutomation({ name: 'B' });
    expect(await svc.reorderAutomation(a.id, 'down')).toBe(true);
    const list = svc.listAutomations();
    expect(list.find((x) => x.id === a.id)?.order).toBe(1);
    expect(list.find((x) => x.id === b.id)?.order).toBe(0);
    expect(await svc.reorderAutomation(a.id, 'down')).toBe(false);
  });

  it('does not see siblings in a different folder', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const f = await svc.createFolder({ name: 'F' });
    const inFolder = await svc.createAutomation({ name: 'IF', folderId: f.id });
    const atRoot = await svc.createAutomation({ name: 'AR' });
    // inFolder is alone in its folder
    expect(await svc.reorderAutomation(inFolder.id, 'up')).toBe(false);
    expect(await svc.reorderAutomation(inFolder.id, 'down')).toBe(false);
    // atRoot is also alone at root
    expect(await svc.reorderAutomation(atRoot.id, 'up')).toBe(false);
  });

  it('returns false on unknown id', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    expect(await svc.reorderAutomation('nope', 'up')).toBe(false);
  });

  it('emits automationsChanged on a successful reorder', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const a = await svc.createAutomation({ name: 'A' });
    const b = await svc.createAutomation({ name: 'B' });
    const seen: number[] = [];
    svc.on('automationsChanged', (list: Automation[]) => seen.push(list.length));
    await svc.reorderAutomation(a.id, 'down');
    expect(seen).toEqual([2]);
    expect(b.id).toBeDefined();
  });
});

describe('AutomationsService.testFireAutomation', () => {
  it('emits "fired" with the id and returns true', async () => {
    const svc = new AutomationsService({ store: fakeStore(), now: () => '2026-05-28T12:00:00.000Z' });
    const a = await svc.createAutomation({ name: 'A' });
    const seen: Array<{ automationId: string; at: string }> = [];
    svc.on('fired', (payload: { automationId: string; at: string }) => seen.push(payload));
    expect(await svc.testFireAutomation(a.id)).toBe(true);
    expect(seen).toEqual([{ automationId: a.id, at: '2026-05-28T12:00:00.000Z' }]);
  });

  it('returns false and emits nothing for an unknown id', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const seen: unknown[] = [];
    svc.on('fired', (p: unknown) => seen.push(p));
    expect(await svc.testFireAutomation('nope')).toBe(false);
    expect(seen).toEqual([]);
  });
});

describe('AutomationsService listAutomations rehydration', () => {
  it('rehydrates valid persisted automations', () => {
    const persisted: Automation[] = [
      {
        id: 'auto_1234567890',
        name: 'A',
        enabled: true,
        folderId: null,
        order: 0,
        queue: null,
        triggers: [],
        checks: [],
        checksGate: 'AND',
        actions: { mode: 'standard', refs: [] },
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z'
      }
    ];
    const svc = new AutomationsService({ store: fakeStore({ automations: persisted }) });
    expect(svc.listAutomations()).toEqual(persisted);
  });

  it('drops automations with an unknown actions.mode', () => {
    const persisted = [
      {
        id: 'auto_ok123', name: 'OK', enabled: true, folderId: null, order: 0, queue: null,
        triggers: [], checks: [], checksGate: 'AND', actions: { mode: 'standard', refs: [] },
        createdAt: 't', updatedAt: 't'
      },
      {
        id: 'auto_bad__', name: 'BAD', enabled: true, folderId: null, order: 1, queue: null,
        triggers: [], checks: [], checksGate: 'AND', actions: { mode: 'wild_west' },
        createdAt: 't', updatedAt: 't'
      },
      // Missing required fields
      { id: 'auto_x', name: '' },
      'not-an-object'
    ];
    const svc = new AutomationsService({ store: fakeStore({ automations: persisted }) });
    expect(svc.listAutomations().map((a) => a.id)).toEqual(['auto_ok123']);
  });
});

// ---- Smoke / round-trip ---------------------------------------------------

describe('AutomationsService round-trip — triggers, actions, checks', () => {
  it('round-trips every documented TriggerType through create', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const triggers: Trigger[] = [
      { type: 'chat_message', config: { command: 'so' } },
      { type: 'follow', config: {} },
      { type: 'sub', config: { minTier: 1 } },
      { type: 'bits', config: { minBits: 100 } },
      { type: 'raid', config: { minRaiders: 5 } },
      { type: 'channel_point_redemption', config: { rewardId: 'reward_1', rewardName: 'R' } },
      { type: 'stream_go_live', config: {} },
      { type: 'stream_end', config: {} },
      { type: 'obs_scene_switch', config: { sceneName: 'Game' } },
      { type: 'obs_stream_start_stop', config: {} },
      { type: 'manual_fire', config: {} },
      { type: 'public_api_webhook', config: {} }
    ];
    for (const t of triggers) {
      const a = await svc.createAutomation({ name: `T:${t.type}`, triggers: [t] });
      expect(a.triggers[0].type).toBe(t.type);
    }
    const seenTypes = svc.listAutomations().map((a) => a.triggers[0].type as TriggerType);
    expect(new Set(seenTypes).size).toBe(triggers.length);
  });

  it('round-trips all 6 action modes through create', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const blocks: AutomationActions[] = [
      { mode: 'standard', refs: [{ actionId: 'act_1' }] },
      { mode: 'random', refs: [{ actionId: 'act_1' }, { actionId: 'act_2' }] },
      { mode: 'toggle', refs: [{ actionId: 'act_1' }, { actionId: 'act_2' }] },
      { mode: 'sequence', refs: [{ actionId: 'act_1' }, { actionId: 'act_2' }] },
      {
        mode: 'if_else',
        ifElse: {
          inlineCheck: { variable: 'v', operator: 'eq', value: '1' },
          thenActions: [{ actionId: 'act_a' }],
          elseActions: [{ actionId: 'act_b' }]
        }
      },
      {
        mode: 'switch_case',
        switchCase: {
          source: { kind: 'variable', name: 'k' },
          cases: [{ value: 'one', actions: [{ actionId: 'act_1' }] }],
          defaultActions: [{ actionId: 'act_d' }]
        }
      }
    ];
    for (const b of blocks) {
      const a = await svc.createAutomation({ name: `M:${b.mode}`, actions: b });
      expect(a.actions.mode).toBe(b.mode);
    }
    expect(svc.listAutomations()).toHaveLength(blocks.length);
  });

  it('round-trips both Check types through create', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const checks: Check[] = [
      { type: 'variable', variable: 'foo', operator: 'eq', value: 'bar' },
      { type: 'data', path: 'user.login', operator: 'contains', value: 'mod' }
    ];
    const a = await svc.createAutomation({ name: 'Checks', checks, checksGate: 'OR' });
    expect(a.checks).toEqual(checks);
    expect(a.checksGate).toBe('OR');
  });
});

// ---- Hydration de-dup + action-ref cleanup --------------------------------

describe('AutomationsService hydration de-dup and removeActionRefs', () => {
  const persistedAutomation = (id: string, name: string) => ({
    id, name, enabled: true, folderId: null, order: 0, queue: null,
    triggers: [], checks: [], checksGate: 'AND',
    actions: { mode: 'standard', refs: [] },
    createdAt: 't', updatedAt: 't'
  });

  it('de-duplicates persisted automations sharing an id (keeps the first)', () => {
    const svc = new AutomationsService({
      store: fakeStore({ automations: [persistedAutomation('auto_dup0001', 'first'), persistedAutomation('auto_dup0001', 'second')] })
    });
    expect(svc.listAutomations()).toHaveLength(1);
    expect(svc.listAutomations()[0].name).toBe('first');
  });

  it('removeActionRefs strips a deleted action from refs / ifElse / switchCase across automations', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const a1 = await svc.createAutomation({ name: 'std', actions: { mode: 'standard', refs: [{ actionId: 'act_x' }, { actionId: 'act_keep' }] } });
    const a2 = await svc.createAutomation({
      name: 'ifelse',
      actions: { mode: 'if_else', ifElse: { inlineCheck: { variable: 'v', operator: 'eq', value: '1' }, thenActions: [{ actionId: 'act_x' }], elseActions: [{ actionId: 'act_keep' }] } }
    });
    const changed = await svc.removeActionRefs('act_x');
    expect(changed).toBe(true);
    const out1 = svc.listAutomations().find((a) => a.id === a1.id)!;
    expect(out1.actions.refs).toEqual([{ actionId: 'act_keep' }]);
    const out2 = svc.listAutomations().find((a) => a.id === a2.id)!;
    expect(out2.actions.ifElse!.thenActions).toEqual([]);
    expect(out2.actions.ifElse!.elseActions).toEqual([{ actionId: 'act_keep' }]);
  });

  it('removeActionRefs returns false and changes nothing when no automation references the id', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    await svc.createAutomation({ name: 'std', actions: { mode: 'standard', refs: [{ actionId: 'act_keep' }] } });
    expect(await svc.removeActionRefs('act_missing')).toBe(false);
  });
});

// ---- Reparenting: referential integrity + order recompute -----------------

describe('AutomationsService reparenting (validation + order)', () => {
  it('createFolder rejects a parentId that does not exist', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    await expect(svc.createFolder({ name: 'X', parentId: 'fld_missing' })).rejects.toThrow(/parent/i);
  });

  it('updateFolder rejects making a folder its own parent', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const a = await svc.createFolder({ name: 'A' });
    await expect(svc.updateFolder(a.id, { name: 'A', parentId: a.id })).rejects.toThrow(/own|itself|parent/i);
  });

  it('updateFolder rejects moving a folder into its own descendant (cycle)', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const a = await svc.createFolder({ name: 'A' });
    const b = await svc.createFolder({ name: 'B', parentId: a.id });
    await expect(svc.updateFolder(a.id, { name: 'A', parentId: b.id })).rejects.toThrow(/descendant|cycle/i);
  });

  it('updateFolder rejects a parentId that does not exist', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const a = await svc.createFolder({ name: 'A' });
    await expect(svc.updateFolder(a.id, { name: 'A', parentId: 'fld_missing' })).rejects.toThrow(/parent/i);
  });

  it('updateFolder recomputes order on reparent so the moved folder gets a unique slot in the new group', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const a = await svc.createFolder({ name: 'A' });                 // root, order 0
    const b = await svc.createFolder({ name: 'B' });                 // root, order 1
    await svc.createFolder({ name: 'C1', parentId: b.id });          // under B, order 0
    // Move A under B. A's old order (0) would collide with C1's order (0) without recompute.
    const moved = await svc.updateFolder(a.id, { name: 'A', parentId: b.id });
    expect(moved?.parentId).toBe(b.id);
    expect(moved?.order).toBe(1);
    const ordersUnderB = svc.listFolders().filter((f) => f.parentId === b.id).map((f) => f.order).sort();
    expect(ordersUnderB).toEqual([0, 1]); // no duplicate orders
  });

  it('createAutomation rejects a folderId that does not exist', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    await expect(svc.createAutomation({ name: 'X', folderId: 'fld_missing' })).rejects.toThrow(/folder/i);
  });

  it('updateAutomation rejects a folderId that does not exist', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const a = await svc.createAutomation({ name: 'A' });
    await expect(svc.updateAutomation(a.id, { name: 'A', folderId: 'fld_missing' })).rejects.toThrow(/folder/i);
  });

  it('updateAutomation recomputes order when moved to a different folder', async () => {
    const svc = new AutomationsService({ store: fakeStore() });
    const f = await svc.createFolder({ name: 'F' });
    await svc.createAutomation({ name: 'X', folderId: f.id });       // in F, order 0
    const y = await svc.createAutomation({ name: 'Y' });             // root, order 0
    // Move Y into F. Y's old order (0) would collide with X (0) without recompute.
    const moved = await svc.updateAutomation(y.id, { name: 'Y', folderId: f.id });
    expect(moved?.folderId).toBe(f.id);
    expect(moved?.order).toBe(1);
    const ordersInF = svc.listAutomations().filter((a) => a.folderId === f.id).map((a) => a.order).sort();
    expect(ordersInF).toEqual([0, 1]);
  });
});
