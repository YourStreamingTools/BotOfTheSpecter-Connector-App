import { EventEmitter } from 'events';
import type { RewardGroup, RewardGroupInput } from '@shared/ipc';

export interface RewardGroupsStore {
  get(key: 'rewardGroups'): unknown;
  set(key: 'rewardGroups', value: RewardGroup[]): void | Promise<void>;
}

export interface RewardGroupsServiceDeps {
  store: RewardGroupsStore;
  /** Enable/disable a single reward; resolves true only if it was actually toggled
   *  (i.e. the reward is manageable). Wired to ChannelPointsService.updateReward. */
  toggleReward: (rewardId: string, enabled: boolean) => Promise<boolean>;
}

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

/**
 * Desktop-side grouping of channel-point rewards (Twitch has no group concept).
 * CRUD persists to config; setEnabled applies is_enabled to every MANAGEABLE
 * member by delegating to toggleReward (non-manageable members are attempted but
 * reported as not-toggled, so the count reflects what actually changed).
 */
export class RewardGroupsService extends EventEmitter {
  private readonly store: RewardGroupsStore;
  private readonly toggleReward: (rewardId: string, enabled: boolean) => Promise<boolean>;
  private groups: RewardGroup[] = [];

  constructor(deps: RewardGroupsServiceDeps) {
    super();
    this.store = deps.store;
    this.toggleReward = deps.toggleReward;
    this.groups = hydrate(this.store.get('rewardGroups'));
  }

  list(): RewardGroup[] {
    return [...this.groups];
  }

  async create(input: RewardGroupInput): Promise<RewardGroup> {
    const name = requireName(input?.name);
    const group: RewardGroup = { id: this.freshId(), name, rewardIds: cleanIds(input?.rewardIds) };
    this.groups = [...this.groups, group];
    await this.persist();
    return group;
  }

  async update(id: string, input: RewardGroupInput): Promise<RewardGroup | null> {
    const name = requireName(input?.name);
    const idx = this.groups.findIndex((g) => g.id === id);
    if (idx < 0) return null;
    const updated: RewardGroup = {
      ...this.groups[idx],
      name,
      rewardIds: input?.rewardIds === undefined ? this.groups[idx].rewardIds : cleanIds(input.rewardIds)
    };
    const next = [...this.groups];
    next[idx] = updated;
    this.groups = next;
    await this.persist();
    return updated;
  }

  async delete(id: string): Promise<boolean> {
    const idx = this.groups.findIndex((g) => g.id === id);
    if (idx < 0) return false;
    this.groups = this.groups.filter((g) => g.id !== id);
    await this.persist();
    return true;
  }

  /** Enable/disable every member; returns how many were actually toggled (manageable). */
  async setEnabled(id: string, enabled: boolean): Promise<number> {
    const group = this.groups.find((g) => g.id === id);
    if (!group) return 0;
    const results = await Promise.all(group.rewardIds.map((rid) => this.toggleReward(rid, enabled).catch(() => false)));
    return results.filter(Boolean).length;
  }

  private freshId(): string {
    const taken = new Set(this.groups.map((g) => g.id));
    let id = genId();
    while (taken.has(id)) id = genId();
    return id;
  }

  private async persist(): Promise<void> {
    await this.store.set('rewardGroups', this.groups);
    this.emit('changed', this.list());
  }
}

function requireName(raw: unknown): string {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name) throw new Error('Group name is required');
  return name;
}

function cleanIds(ids: unknown): string[] {
  return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string' && x.length > 0) : [];
}

function hydrate(raw: unknown): RewardGroup[] {
  if (!Array.isArray(raw)) return [];
  const out: RewardGroup[] = [];
  const seen = new Set<string>();
  for (const entry of raw) {
    if (isValidGroup(entry) && !seen.has(entry.id)) { seen.add(entry.id); out.push(entry); }
  }
  return out;
}

function isValidGroup(v: unknown): v is RewardGroup {
  if (!v || typeof v !== 'object') return false;
  const g = v as Record<string, unknown>;
  if (typeof g.id !== 'string' || !g.id) return false;
  if (typeof g.name !== 'string' || !g.name) return false;
  if (!Array.isArray(g.rewardIds)) return false;
  return true;
}

function genId(): string {
  let s = 'grp_';
  for (let i = 0; i < 10; i++) s += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
  return s;
}
