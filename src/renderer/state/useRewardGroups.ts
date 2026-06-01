import React from 'react';
import { IPC, type RewardGroup } from '@shared/ipc';

export function useRewardGroups(): RewardGroup[] {
  const [groups, setGroups] = React.useState<RewardGroup[]>([]);
  React.useEffect(() => {
    let alive = true;
    const off = window.api.on(IPC.rewardGroupsChanged, (g) => setGroups(g as RewardGroup[]));
    void window.api.rewardGroups.list().then((g) => { if (alive) setGroups(g); });
    return () => { alive = false; off(); };
  }, []);
  return groups;
}
