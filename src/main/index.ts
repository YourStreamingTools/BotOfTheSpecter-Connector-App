import { app, BrowserWindow, ipcMain } from 'electron';
import { join } from 'path';
import { IPC, type AppConfig, type ObsConnectParams, type BuiltinCommandUpdate, type ActionInput, type FolderInput, type AutomationInput, type ReorderDirection, type TwitchStatus } from '@shared/ipc';
import { ConfigStore } from './config-store';
import { legacyConfigPath, migrateLegacyConfig } from './config-migration';
import { createMainWindow, APP_ICON_PATH } from './window';
import { ObsService } from './obs/obs-service';
import { VariablesService } from './variables/variables-service';
import { LogService } from './log/log-service';
import { RelayService } from './relay/relay-service';
import { BotStatusService } from './botstatus/bot-status-service';
import { SpecterApiService } from './api/specter-api';
import { TwitchService } from './twitch/twitch-service';
import { ChatService } from './chat/chat-service';
import { CommandsService } from './commands/commands-service';
import { ActionsService } from './automation/actions-service';
import { AutomationsService } from './automation/automations-service';

let store: ConfigStore;
let obs: ObsService;
let pollTimer: NodeJS.Timeout | undefined;
let variables: VariablesService;
let logs: LogService;
let relay: RelayService;
let botStatus: BotStatusService;
let specterApi: SpecterApiService;
let twitch: TwitchService;
let chat: ChatService;
let commands: CommandsService;
let actions: ActionsService;
let automations: AutomationsService;

// Persistable config keys — the allow-list for config:set so a buggy/compromised
// renderer can't scribble arbitrary keys into the plaintext config.json.
const CONFIG_KEYS = new Set<keyof AppConfig>([
  'api_key', 'obs_host', 'obs_port', 'obs_password', 'autoConnectObs', 'log_expanded',
  'theme', 'density', 'sidebarExpanded', 'variables', 'actions', 'folders', 'automations', 'streamOutputCount'
]);

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    // Skip windows torn down or with a destroyed webContents — sending to those
    // throws (or is silently lost) on a high-frequency emitter like OBS stats.
    if (w.isDestroyed() || w.webContents.isDestroyed()) continue;
    w.webContents.send(channel, payload);
  }
}

function registerIpc(): void {
  ipcMain.handle(IPC.configGet, (_e, key: keyof AppConfig) => store.get(key));
  ipcMain.handle(IPC.configAll, () => store.all());
  ipcMain.handle(IPC.configSet, (_e, key: keyof AppConfig, value: AppConfig[keyof AppConfig]) => {
    if (typeof key !== 'string' || !CONFIG_KEYS.has(key as keyof AppConfig)) {
      throw new Error(`Invalid config key: ${String(key)}`);
    }
    return store.set(key, value);
  });

  ipcMain.handle(IPC.windowMinimize, (e) => BrowserWindow.fromWebContents(e.sender)?.minimize());
  ipcMain.handle(IPC.windowMaximize, (e) => {
    const w = BrowserWindow.fromWebContents(e.sender);
    if (!w) return;
    if (w.isMaximized()) w.unmaximize();
    else w.maximize();
  });
  ipcMain.handle(IPC.windowClose, (e) => BrowserWindow.fromWebContents(e.sender)?.close());
}

function registerObs(): void {
  // Read streamOutputCount lazily so a config change takes effect on the next
  // stream-start without restarting the app.
  obs = new ObsService({ getStreamOutputCount: () => store.get('streamOutputCount') });
  obs.on('status', (s) => {
    broadcast(IPC.obsStatus, s);
    if (s.state === 'connected' && !pollTimer) {
      pollTimer = setInterval(() => void obs.pollOnce().catch(() => undefined), 1000);
    }
    if (s.state !== 'connected' && pollTimer) {
      clearInterval(pollTimer);
      pollTimer = undefined;
    }
  });
  obs.on('outputs', (o) => broadcast(IPC.obsOutputs, o));
  obs.on('stats', (s) => broadcast(IPC.obsStats, s));
  obs.on('scenes', (s) => broadcast(IPC.obsScenes, s));
  obs.on('audio', (a) => broadcast(IPC.obsAudio, a));
  obs.on('audioMeters', (m) => broadcast(IPC.obsAudioMeters, m));
  obs.on('event', (e) => broadcast(IPC.obsEvent, e));

  ipcMain.handle(IPC.obsConnect, (_e, params: ObsConnectParams) => obs.connect(params));
  ipcMain.handle(IPC.obsDisconnect, () => obs.disconnect());
  ipcMain.handle(IPC.obsSetScene, (_e, name: string) => obs.setScene(name));
  ipcMain.handle(IPC.obsSetSourceEnabled, (_e, scene: string, id: number, on: boolean) => obs.setSourceEnabled(scene, id, on));
  ipcMain.handle(IPC.obsStartStream, () => obs.startStream());
  ipcMain.handle(IPC.obsStopStream, () => obs.stopStream());
  ipcMain.handle(IPC.obsStartRecord, () => obs.startRecord());
  ipcMain.handle(IPC.obsStopRecord, () => obs.stopRecord());
  ipcMain.handle(IPC.obsSaveReplay, () => obs.saveReplay());
  ipcMain.handle(IPC.obsStartReplay, () => obs.startReplayBuffer());
  ipcMain.handle(IPC.obsStopReplay, () => obs.stopReplayBuffer());
  ipcMain.handle(IPC.obsToggleVcam, () => obs.toggleVcam());
  ipcMain.handle(IPC.obsRefreshScenes, () => obs.refreshScenes());
  ipcMain.handle(IPC.obsRefreshAudio, () => obs.refreshAudio());
  ipcMain.handle(IPC.obsSetInputMute, (_e, name: string, muted: boolean) => obs.setInputMute(name, muted));
  ipcMain.handle(IPC.obsListSourceFilters, (_e, sourceName: string) => obs.listSourceFilters(sourceName));
  ipcMain.handle(IPC.obsSetSourceFilterEnabled, (_e, sourceName: string, filterName: string, enabled: boolean) => obs.setSourceFilterEnabled(sourceName, filterName, enabled));
  ipcMain.handle(IPC.obsSnapshot, () => obs.getSnapshot());
}

function registerRelay(): void {
  variables = new VariablesService(store);
  logs = new LogService();
  relay = new RelayService({ obs, variables, log: logs });

  variables.on('changed', () => broadcast(IPC.variablesChanged, variables.all()));
  logs.on('line', (e) => broadcast(IPC.logLine, e));
  relay.on('status', (s) => broadcast(IPC.relayStatus, s));

  // OBS event stream → log + forward to the relay.
  obs.on('event', (e: { type: string; message: string; data?: Record<string, unknown> }) => {
    logs.add('OBS', 'evt', e.message);
    relay.forwardObsEvent(e.type, e.data ?? {});
  });
  obs.on('status', (s: { state: string; error?: string }) => {
    if (s.state === 'error' && s.error) logs.add('OBS', 'err', s.error);
  });

  ipcMain.handle(IPC.relaySetLock, (_e, locked: boolean) => relay.setLock(locked));
  ipcMain.handle(IPC.relaySetApiKey, async (_e, key: string) => {
    const trimmed = typeof key === 'string' ? key.trim() : '';
    logs.registerSecret(trimmed); // register BEFORE logging so any failure line is scrubbed
    try {
      // Await the persist so the renderer's await only resolves once the key is
      // safely on disk, and a failed write surfaces as a rejected invoke instead
      // of a silently-dropped promise (key gone on next launch).
      await store.set('api_key', trimmed);
    } catch (err) {
      logs.add('APP', 'err', `Failed to persist API key: ${err instanceof Error ? err.message : String(err)}`);
      throw err;
    }
    relay.setApiKey(trimmed);
    relay.connect();
    botStatus.setApiKey(trimmed);
    botStatus.start();
    twitch.setApiKey(trimmed);
    twitch.start();
    // New key → re-fetch custom + user commands (built-in is unchanged but harmless).
    void commands.refresh();
  });
  ipcMain.handle(IPC.relayConnect, () => relay.connect());
  ipcMain.handle(IPC.relayDisconnect, () => relay.disconnect());
  ipcMain.handle(IPC.relaySnapshot, () => relay.getStatus());
  ipcMain.handle(IPC.variablesAll, () => variables.all());
  ipcMain.handle(IPC.variablesResetSession, () => variables.resetSession());
  ipcMain.handle(IPC.logSnapshot, () => logs.snapshot());
}

function registerChat(): void {
  chat = new ChatService();
  relay.on('chat', (raw: Record<string, unknown>) => chat.handleChat(raw));
  relay.on('moderation', (raw: Record<string, unknown>) => chat.handleModeration(raw));
  chat.on('message', (m) => broadcast(IPC.chatMessage, m));
  chat.on('moderation', (mod) => broadcast(IPC.chatModeration, mod));
  ipcMain.handle(IPC.chatSnapshot, () => chat.snapshot());
}

function registerBotStatus(): void {
  botStatus = new BotStatusService();
  botStatus.on('status', (s) => broadcast(IPC.botStatus, s));
  ipcMain.handle(IPC.botSnapshot, () => botStatus.getStatus());
}

function registerAuth(): void {
  specterApi = new SpecterApiService();
  ipcMain.handle(IPC.authValidateKey, (_e, key: string) => specterApi.validateApiKey(key));
  ipcMain.handle(IPC.authAccount, (_e, key: string) => specterApi.getAccount(key));
}

function registerTwitch(): void {
  twitch = new TwitchService({
    getCredentials: (key) => specterApi.getCredentials(key),
    // Register each rotated Twitch token so LogService scrubs it from log lines.
    registerSecret: (secret) => logs.registerSecret(secret)
  });
  twitch.on('status', (s: TwitchStatus) => {
    broadcast(IPC.twitchStatus, s);
    // Keep the persisted stream_status variable honest. The bot's STREAM_ONLINE/
    // OFFLINE events drive it normally, but a missed STREAM_OFFLINE leaves it
    // stuck "online". When Twitch gives a definitive answer, mirror it so the
    // Variables page agrees with the dashboard (both derive from Twitch).
    if (s.reachable) variables.reconcileStreamStatus(s.online);
  });
  ipcMain.handle(IPC.twitchSnapshot, () => twitch.getStatus());
}

function registerCommands(): void {
  commands = new CommandsService({ getApiKey: () => store.get('api_key') ?? '' });
  commands.on('changed', (snap) => broadcast(IPC.commandsChanged, snap));
  ipcMain.handle(IPC.commandsSnapshot, () => commands.snapshot());
  ipcMain.handle(IPC.commandsRefresh, () => commands.refresh());
  ipcMain.handle(IPC.commandsUpdateBuiltin, (_e, name: string, patch: BuiltinCommandUpdate) => commands.updateBuiltin(name, patch));
}

function registerActions(): void {
  actions = new ActionsService({ store });
  actions.on('changed', (list) => broadcast(IPC.actionsChanged, list));
  ipcMain.handle(IPC.actionsList, () => actions.list());
  ipcMain.handle(IPC.actionsCreate, (_e, input: ActionInput) => actions.create(input));
  ipcMain.handle(IPC.actionsUpdate, (_e, id: string, input: ActionInput) => actions.update(id, input));
  ipcMain.handle(IPC.actionsDelete, async (_e, id: string) => {
    const ok = await actions.delete(id);
    // Sweep dangling references to the deleted action out of every automation.
    if (ok) await automations.removeActionRefs(id);
    return ok;
  });
}

function registerAutomations(): void {
  automations = new AutomationsService({ store });
  automations.on('foldersChanged',     (list) => broadcast(IPC.foldersChanged,     list));
  automations.on('automationsChanged', (list) => broadcast(IPC.automationsChanged, list));

  ipcMain.handle(IPC.foldersList,         () => automations.listFolders());
  ipcMain.handle(IPC.foldersCreate,       (_e, input: FolderInput) => automations.createFolder(input));
  ipcMain.handle(IPC.foldersUpdate,       (_e, id: string, input: FolderInput) => automations.updateFolder(id, input));
  ipcMain.handle(IPC.foldersDelete,       (_e, id: string) => automations.deleteFolder(id));
  ipcMain.handle(IPC.foldersReorder,      (_e, id: string, direction: ReorderDirection) => automations.reorderFolder(id, direction));

  ipcMain.handle(IPC.automationsList,     () => automations.listAutomations());
  ipcMain.handle(IPC.automationsCreate,   (_e, input: AutomationInput) => automations.createAutomation(input));
  ipcMain.handle(IPC.automationsUpdate,   (_e, id: string, input: AutomationInput) => automations.updateAutomation(id, input));
  ipcMain.handle(IPC.automationsDelete,   (_e, id: string) => automations.deleteAutomation(id));
  ipcMain.handle(IPC.automationsReorder,  (_e, id: string, direction: ReorderDirection) => automations.reorderAutomation(id, direction));
  ipcMain.handle(IPC.automationsTestFire, (_e, id: string) => automations.testFireAutomation(id));
}

async function bootstrap(): Promise<void> {
  // macOS dock icon — Windows + Linux taskbar icons are set via BrowserWindow.icon.
  // In a packaged .app the bundle's Icon.icns wins, but in dev this gives us the
  // right artwork instead of the generic Electron mascot.
  if (process.platform === 'darwin' && app.dock) {
    try { app.dock.setIcon(APP_ICON_PATH); } catch { /* ignore — best-effort cosmetic */ }
  }

  store = new ConfigStore(join(app.getPath('userData'), 'config.json'));
  await migrateLegacyConfig(store, legacyConfigPath(app.getPath('appData')));
  registerIpc();
  registerObs();
  registerRelay();
  registerChat();
  registerBotStatus();
  registerAuth();
  registerTwitch();
  registerCommands();
  registerActions();
  registerAutomations();

  const host = store.get('obs_host');
  const port = store.get('obs_port');
  const password = store.get('obs_password');
  if (store.get('autoConnectObs') && host && port && password !== undefined) {
    void obs.connect({ host, port, password });
  }

  const apiKey = store.get('api_key');
  if (apiKey) {
    logs.registerSecret(apiKey);
    relay.setApiKey(apiKey);
    relay.connect();
    botStatus.setApiKey(apiKey);
    botStatus.start();
    twitch.setApiKey(apiKey);
    twitch.start();
  }
  // Commands fetch is cheap and shared across viewers; kick off once on boot so the
  // screen is ready by the time the user navigates to it. Built-in fetches without auth,
  // custom + user only fetch if there's an API key.
  void commands.refresh();

  createMainWindow();
}

app.whenReady().then(bootstrap);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
