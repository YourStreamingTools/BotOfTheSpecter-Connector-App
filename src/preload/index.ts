import { contextBridge, ipcRenderer } from 'electron';
import { IPC, type AppConfig, type BridgeApi } from '@shared/ipc';

// Every channel the main process can push on is one of the IPC constants.
// Restricting on() to this set keeps the renderer from subscribing to arbitrary channels.
const ALLOWED_CHANNELS = new Set<string>(Object.values(IPC));

const api: BridgeApi = {
  config: {
    get: (key) => ipcRenderer.invoke(IPC.configGet, key),
    set: (key, value) => ipcRenderer.invoke(IPC.configSet, key, value),
    all: () => ipcRenderer.invoke(IPC.configAll)
  },
  window: {
    minimize: () => ipcRenderer.invoke(IPC.windowMinimize),
    maximize: () => ipcRenderer.invoke(IPC.windowMaximize),
    close: () => ipcRenderer.invoke(IPC.windowClose)
  },
  obs: {
    connect: (params) => ipcRenderer.invoke(IPC.obsConnect, params),
    disconnect: () => ipcRenderer.invoke(IPC.obsDisconnect),
    setScene: (name) => ipcRenderer.invoke(IPC.obsSetScene, name),
    setSourceEnabled: (scene, id, on) => ipcRenderer.invoke(IPC.obsSetSourceEnabled, scene, id, on),
    startStream: () => ipcRenderer.invoke(IPC.obsStartStream),
    stopStream: () => ipcRenderer.invoke(IPC.obsStopStream),
    startRecord: () => ipcRenderer.invoke(IPC.obsStartRecord),
    stopRecord: () => ipcRenderer.invoke(IPC.obsStopRecord),
    saveReplay: () => ipcRenderer.invoke(IPC.obsSaveReplay),
    startReplayBuffer: () => ipcRenderer.invoke(IPC.obsStartReplay),
    stopReplayBuffer: () => ipcRenderer.invoke(IPC.obsStopReplay),
    toggleVcam: () => ipcRenderer.invoke(IPC.obsToggleVcam),
    refreshScenes: () => ipcRenderer.invoke(IPC.obsRefreshScenes),
    refreshAudio: () => ipcRenderer.invoke(IPC.obsRefreshAudio),
    setInputMute: (name, muted) => ipcRenderer.invoke(IPC.obsSetInputMute, name, muted),
    listSourceFilters: (sourceName) => ipcRenderer.invoke(IPC.obsListSourceFilters, sourceName),
    setSourceFilterEnabled: (sourceName, filterName, enabled) => ipcRenderer.invoke(IPC.obsSetSourceFilterEnabled, sourceName, filterName, enabled),
    snapshot: () => ipcRenderer.invoke(IPC.obsSnapshot)
  },
  relay: {
    setLock: (locked) => ipcRenderer.invoke(IPC.relaySetLock, locked),
    setApiKey: (key) => ipcRenderer.invoke(IPC.relaySetApiKey, key),
    connect: () => ipcRenderer.invoke(IPC.relayConnect),
    disconnect: () => ipcRenderer.invoke(IPC.relayDisconnect),
    snapshot: () => ipcRenderer.invoke(IPC.relaySnapshot)
  },
  variables: {
    all: () => ipcRenderer.invoke(IPC.variablesAll),
    resetSession: () => ipcRenderer.invoke(IPC.variablesResetSession)
  },
  logs: {
    snapshot: () => ipcRenderer.invoke(IPC.logSnapshot)
  },
  chat: {
    snapshot: () => ipcRenderer.invoke(IPC.chatSnapshot)
  },
  bot: {
    snapshot: () => ipcRenderer.invoke(IPC.botSnapshot)
  },
  auth: {
    validateKey: (key) => ipcRenderer.invoke(IPC.authValidateKey, key),
    account: (key) => ipcRenderer.invoke(IPC.authAccount, key)
  },
  twitch: {
    snapshot: () => ipcRenderer.invoke(IPC.twitchSnapshot)
  },
  commands: {
    snapshot: () => ipcRenderer.invoke(IPC.commandsSnapshot),
    refresh: () => ipcRenderer.invoke(IPC.commandsRefresh),
    updateBuiltin: (name, patch) => ipcRenderer.invoke(IPC.commandsUpdateBuiltin, name, patch)
  },
  actions: {
    list: () => ipcRenderer.invoke(IPC.actionsList),
    create: (input) => ipcRenderer.invoke(IPC.actionsCreate, input),
    update: (id, input) => ipcRenderer.invoke(IPC.actionsUpdate, id, input),
    delete: (id) => ipcRenderer.invoke(IPC.actionsDelete, id)
  },
  folders: {
    list:    () => ipcRenderer.invoke(IPC.foldersList),
    create:  (input) => ipcRenderer.invoke(IPC.foldersCreate, input),
    update:  (id, input) => ipcRenderer.invoke(IPC.foldersUpdate, id, input),
    delete:  (id) => ipcRenderer.invoke(IPC.foldersDelete, id),
    reorder: (id, direction) => ipcRenderer.invoke(IPC.foldersReorder, id, direction)
  },
  automations: {
    list:     () => ipcRenderer.invoke(IPC.automationsList),
    create:   (input) => ipcRenderer.invoke(IPC.automationsCreate, input),
    update:   (id, input) => ipcRenderer.invoke(IPC.automationsUpdate, id, input),
    delete:   (id) => ipcRenderer.invoke(IPC.automationsDelete, id),
    reorder:  (id, direction) => ipcRenderer.invoke(IPC.automationsReorder, id, direction),
    testFire: (id) => ipcRenderer.invoke(IPC.automationsTestFire, id)
  },
  platform: process.platform,
  on: (channel, listener) => {
    // Only allow subscribing to known IPC channels — never an arbitrary,
    // renderer-supplied channel name.
    if (!ALLOWED_CHANNELS.has(channel)) return () => {};
    const sub = (_e: Electron.IpcRendererEvent, ...args: unknown[]) => listener(...args);
    ipcRenderer.on(channel, sub);
    return () => ipcRenderer.removeListener(channel, sub);
  }
};

contextBridge.exposeInMainWorld('api', api);

export type { AppConfig };
