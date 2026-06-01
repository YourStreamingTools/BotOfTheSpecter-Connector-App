// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { RewardGroupsService } from './reward-groups-service';

function fakeStore(initial: { rewardGroups?: unknown } = {}) {
  let data: { rewardGroups?: unknown } = { ...initial };
  return {
    get: vi.fn((k: 'rewardGroups') => data[k]),
    set: vi.fn(async (k: 'rewardGroups', v: unknown) => { data = { ...data, [k]: v }; })
  };
}

// toggleReward returns true only for manageable rewards (the service should skip the rest).
const toggleReward = (manageable: Set<string>) =>
  vi.fn(async (id: string, _enabled: boolean) => manageable.has(id));

describe('RewardGroupsService CRUD', () => {
  it('creates a group with a grp_ id and persists it', async () => {
    const store = fakeStore();
    const svc = new RewardGroupsService({ store, toggleReward: vi.fn() });
    const g = await svc.create({ name: 'Sounds', rewardIds: ['a', 'b'] });
    expect(g.id).toMatch(/^grp_/);
    expect(g).toMatchObject({ name: 'Sounds', rewardIds: ['a', 'b'] });
    expect(svc.list()).toHaveLength(1);
    expect(store.set).toHaveBeenCalledWith('rewardGroups', [g]);
  });

  it('rejects an empty name', async () => {
    const svc = new RewardGroupsService({ store: fakeStore(), toggleReward: vi.fn() });
    await expect(svc.create({ name: '  ' })).rejects.toThrow(/name/i);
  });

  it('updates name + members', async () => {
    const svc = new RewardGroupsService({ store: fakeStore(), toggleReward: vi.fn() });
    const g = await svc.create({ name: 'A', rewardIds: ['x'] });
    const u = await svc.update(g.id, { name: 'B', rewardIds: ['x', 'y'] });
    expect(u).toMatchObject({ id: g.id, name: 'B', rewardIds: ['x', 'y'] });
  });

  it('returns null updating an unknown id', async () => {
    const svc = new RewardGroupsService({ store: fakeStore(), toggleReward: vi.fn() });
    expect(await svc.update('nope', { name: 'x' })).toBeNull();
  });

  it('deletes a group', async () => {
    const svc = new RewardGroupsService({ store: fakeStore(), toggleReward: vi.fn() });
    const g = await svc.create({ name: 'A' });
    expect(await svc.delete(g.id)).toBe(true);
    expect(svc.list()).toEqual([]);
  });

  it('hydrates valid persisted groups and drops malformed ones', () => {
    const persisted = [
      { id: 'grp_ok', name: 'OK', rewardIds: ['a'] },
      { id: '', name: 'no id', rewardIds: [] },
      'not-an-object',
      { id: 'grp_x', name: 'bad ids', rewardIds: 'nope' }
    ];
    const svc = new RewardGroupsService({ store: fakeStore({ rewardGroups: persisted }), toggleReward: vi.fn() });
    expect(svc.list().map((g) => g.id)).toEqual(['grp_ok']);
  });

  it('emits "changed" after a mutation', async () => {
    const svc = new RewardGroupsService({ store: fakeStore(), toggleReward: vi.fn() });
    const seen: number[] = [];
    svc.on('changed', (list: unknown[]) => seen.push(list.length));
    await svc.create({ name: 'A' });
    expect(seen).toEqual([1]);
  });
});

describe('RewardGroupsService.setEnabled', () => {
  it('toggles each member and returns the count actually toggled (manageable only)', async () => {
    const manageable = new Set(['a', 'b']); // 'c' is not manageable
    const toggle = toggleReward(manageable);
    const svc = new RewardGroupsService({ store: fakeStore(), toggleReward: toggle });
    const g = await svc.create({ name: 'G', rewardIds: ['a', 'b', 'c'] });
    const count = await svc.setEnabled(g.id, false);
    expect(count).toBe(2);
    expect(toggle).toHaveBeenCalledWith('a', false);
    expect(toggle).toHaveBeenCalledWith('b', false);
    expect(toggle).toHaveBeenCalledWith('c', false); // attempted, but reported not-toggled
  });

  it('returns 0 for an unknown group', async () => {
    const svc = new RewardGroupsService({ store: fakeStore(), toggleReward: vi.fn() });
    expect(await svc.setEnabled('nope', true)).toBe(0);
  });
});
