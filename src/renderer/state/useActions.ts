import React from 'react';
import { IPC, type Action, type ActionInput } from '@shared/ipc';

/**
 * Subscribe to the ActionsService list. Seeds from window.api.actions.list() on mount
 * and stays in sync via the IPC.actionsChanged push channel, which the main process
 * emits after every create/update/delete. Because the service is the source of truth,
 * the create/update/remove callbacks do not optimistically mutate local state — they
 * just await the IPC round-trip and let the push refresh the list.
 */
export function useActions(): {
  actions: Action[];
  create: (input: ActionInput) => Promise<Action>;
  update: (id: string, input: ActionInput) => Promise<Action | null>;
  remove: (id: string) => Promise<boolean>;
} {
  const [actions, setActions] = React.useState<Action[]>([]);

  React.useEffect(() => {
    let alive = true;
    void window.api.actions.list().then((list) => { if (alive) setActions(list); });
    const off = window.api.on(IPC.actionsChanged, (list) => setActions(list as Action[]));
    return () => { alive = false; off(); };
  }, []);

  const create = React.useCallback((input: ActionInput) => window.api.actions.create(input), []);
  const update = React.useCallback((id: string, input: ActionInput) => window.api.actions.update(id, input), []);
  const remove = React.useCallback((id: string) => window.api.actions.delete(id), []);

  return { actions, create, update, remove };
}
