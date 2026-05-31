import React from 'react';
import {
  IPC,
  type Automation,
  type AutomationInput,
  type Folder,
  type FolderInput,
  type ReorderDirection
} from '@shared/ipc';

/**
 * Subscribe to the AutomationsService — both folders and automations. Seeds from
 * window.api.folders.list() + window.api.automations.list() on mount and stays in
 * sync via the IPC.foldersChanged / IPC.automationsChanged push channels, which the
 * main process emits after every mutation (the full list goes out on every change).
 *
 * Mirrors the pattern in useActions/useCommands: the service is the source of truth,
 * so the mutator wrappers don't optimistically update local state — they await the
 * IPC round-trip and let the push refresh the list.
 */
export function useAutomations(): {
  folders: Folder[];
  automations: Automation[];
  createFolder: (input: FolderInput) => Promise<Folder>;
  updateFolder: (id: string, input: FolderInput) => Promise<Folder | null>;
  deleteFolder: (id: string) => Promise<boolean>;
  reorderFolder: (id: string, direction: ReorderDirection) => Promise<boolean>;
  createAutomation: (input: AutomationInput) => Promise<Automation>;
  updateAutomation: (id: string, input: AutomationInput) => Promise<Automation | null>;
  deleteAutomation: (id: string) => Promise<boolean>;
  reorderAutomation: (id: string, direction: ReorderDirection) => Promise<boolean>;
  testFire: (id: string) => Promise<boolean>;
} {
  const [folders, setFolders] = React.useState<Folder[]>([]);
  const [automations, setAutomations] = React.useState<Automation[]>([]);

  React.useEffect(() => {
    let alive = true;
    void window.api.folders.list().then((list) => { if (alive) setFolders(list); });
    void window.api.automations.list().then((list) => { if (alive) setAutomations(list); });
    const offFolders = window.api.on(IPC.foldersChanged, (list) => setFolders(list as Folder[]));
    const offAutomations = window.api.on(IPC.automationsChanged, (list) => setAutomations(list as Automation[]));
    return () => { alive = false; offFolders(); offAutomations(); };
  }, []);

  const createFolder = React.useCallback((input: FolderInput) => window.api.folders.create(input), []);
  const updateFolder = React.useCallback((id: string, input: FolderInput) => window.api.folders.update(id, input), []);
  const deleteFolder = React.useCallback((id: string) => window.api.folders.delete(id), []);
  const reorderFolder = React.useCallback((id: string, direction: ReorderDirection) => window.api.folders.reorder(id, direction), []);

  const createAutomation = React.useCallback((input: AutomationInput) => window.api.automations.create(input), []);
  const updateAutomation = React.useCallback((id: string, input: AutomationInput) => window.api.automations.update(id, input), []);
  const deleteAutomation = React.useCallback((id: string) => window.api.automations.delete(id), []);
  const reorderAutomation = React.useCallback((id: string, direction: ReorderDirection) => window.api.automations.reorder(id, direction), []);

  const testFire = React.useCallback((id: string) => window.api.automations.testFire(id), []);

  return {
    folders,
    automations,
    createFolder,
    updateFolder,
    deleteFolder,
    reorderFolder,
    createAutomation,
    updateAutomation,
    deleteAutomation,
    reorderAutomation,
    testFire
  };
}
