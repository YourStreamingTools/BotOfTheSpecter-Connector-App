import { app, BrowserWindow, ipcMain, shell } from 'electron';
import { join } from 'path';
import { IPC, type AppConfig, type ObsConnectParams, type BuiltinCommandUpdate, type ActionInput, type FolderInput, type AutomationInput, type ReorderDirection, type TwitchStatus, type TimerInput, type RaffleInput, type PollInput, type PollEndStatus, type PredictionInput, type PredictionEndStatus, type ChannelRewardCreate, type ChannelRewardUpdate, type RewardGroupInput, type WheelInput, type CameraPortsInput } from '@shared/ipc';
import { parseMutedEvents } from '@shared/activity-filter';
import { ConfigStore } from './config-store';
import { legacyConfigPath, migrateLegacyConfig } from './config-migration';
import { createMainWindow, APP_ICON_PATH, isSafeExternalUrl } from './window';
import { ObsService } from './obs/obs-service';
import { VariablesService } from './variables/variables-service';
import { LogService } from './log/log-service';
import { RelayService } from './relay/relay-service';
import { BotStatusService } from './botstatus/bot-status-service';
import { SpecterApiService } from './api/specter-api';
import { TwitchService } from './twitch/twitch-service';
import { ChannelPointsService } from './channelpoints/channel-points-service';
import { RewardGroupsService } from './channelpoints/reward-groups-service';
import { ChatService } from './chat/chat-service';
import { AlertsService } from './alerts/alerts-service';
import { CommandsService } from './commands/commands-service';
import { SoundboardService } from './soundboard/soundboard-service';
import { TimersService } from './timers/timers-service';
import { RafflesService } from './raffles/raffles-service';
import { PollsService } from './polls/polls-service';
import { PredictionsService } from './predictions/predictions-service';
import { ActionsService } from './automation/actions-service';
import { AutomationsService } from './automation/automations-service';
import { WheelsService } from './wheels/wheels-service';
import { startWheelOverlay, type WheelOverlay } from './wheels/overlay-server';
import QRCode from 'qrcode';
import { macAppBundle } from './camera/firewall';
import { CameraService } from './camera/camera-service';
import { resolveMediamtxPath } from './camera/mediamtx-process';

let store: ConfigStore;
let obs: ObsService;
let pollTimer: NodeJS.Timeout | undefined;
let variables: VariablesService;
let logs: LogService;
let relay: RelayService;
let botStatus: BotStatusService;
let specterApi: SpecterApiService;
let twitch: TwitchService;
let channelPoints: ChannelPointsService;
let rewardGroups: RewardGroupsService;
let chat: ChatService;
let alerts: AlertsService;
let commands: CommandsService;
let soundboard: SoundboardService;
let timers: TimersService;
let raffles: RafflesService;
let polls: PollsService;
let predictions: PredictionsService;
let actions: ActionsService;
let automations: AutomationsService;
let wheels: WheelsService | undefined;
let wheelOverlay: WheelOverlay | undefined;
let cameras: CameraService | undefined;

// Allow-list of persistable config keys for config:set, blocking arbitrary keys from a compromised renderer.
// Service-owned collections (variables/actions/folders/automations/wheels) are written only via their IPC services
// so a raw config:set cannot desync the in-memory service copy from disk.
const CONFIG_KEYS = new Set<keyof AppConfig>([
  'api_key', 'obs_host', 'obs_port', 'obs_password', 'autoConnectObs', 'log_expanded',
  'theme', 'density', 'sidebarExpanded', 'streamOutputCount', 'activityMutedEvents'
]);

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    // Skip destroyed windows/webContents — sending to those throws on high-frequency emitters like OBS stats.
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
  // Read streamOutputCount lazily so a config change takes effect on the next stream-start without restart.
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
  relay = new RelayService({
    obs, variables, log: logs,
    isEventMuted: (event) => parseMutedEvents(store.get('activityMutedEvents')).includes(event)
  });

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
      // Await the persist so the renderer resolves only once the key is on disk and a failed write rejects the invoke.
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
    // New key → channel-point rewards are per-broadcaster, re-fetch.
    void channelPoints.refresh();
    // New key → re-fetch custom + user commands (built-in is unchanged but harmless).
    void commands.refresh();
    // New key → the soundboard list is per-user, so re-fetch it too.
    void soundboard.refresh();
    // New key → timers are per-user, re-fetch.
    void timers.refresh();
    // New key → raffles are per-user, re-fetch.
    void raffles.refresh();
    // New key → Twitch polls are per-broadcaster, re-fetch.
    void polls.refresh();
    // New key → Twitch predictions are per-broadcaster, re-fetch.
    void predictions.refresh();
  });
  ipcMain.handle(IPC.relayConnect, () => relay.connect());
  ipcMain.handle(IPC.relayDisconnect, () => relay.disconnect());
  ipcMain.handle(IPC.relaySnapshot, () => relay.getStatus());
  ipcMain.handle(IPC.variablesAll, () => variables.all());
  ipcMain.handle(IPC.variablesResetSession, () => variables.resetSession());
  ipcMain.handle(IPC.logSnapshot, () => logs.snapshot());
}

function registerAlerts(): void {
  alerts = new AlertsService();
  // Feed every relay event through the alert normalizer (it ignores non-alerts).
  relay.on('specterEvent', (event: string, data: Record<string, unknown>) => alerts.handleEvent(event, data));
  alerts.on('alert', (a) => broadcast(IPC.alert, a));
  ipcMain.handle(IPC.alertsSnapshot, () => alerts.snapshot());
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
    // Mirror Twitch's definitive online state into stream_status to correct a missed STREAM_OFFLINE event.
    if (s.reachable) variables.reconcileStreamStatus(s.online);
  });
  ipcMain.handle(IPC.twitchSnapshot, () => twitch.getStatus());
}

function registerChannelPoints(): void {
  channelPoints = new ChannelPointsService({
    getCredentials: (key) => specterApi.getCredentials(key),
    getApiKey: () => store.get('api_key') ?? ''
  });
  channelPoints.on('changed', (snap) => broadcast(IPC.channelPointsChanged, snap));
  ipcMain.handle(IPC.channelPointsSnapshot, () => channelPoints.snapshot());
  ipcMain.handle(IPC.channelPointsRefresh, () => channelPoints.refresh());
  ipcMain.handle(IPC.channelPointsCreateReward, (_e, input: ChannelRewardCreate) => channelPoints.createReward(input));
  ipcMain.handle(IPC.channelPointsImportReward, (_e, rewardId: string) => channelPoints.importReward(rewardId));
  ipcMain.handle(IPC.channelPointsUpdateReward, (_e, id: string, patch: ChannelRewardUpdate) => channelPoints.updateReward(id, patch));
  ipcMain.handle(IPC.channelPointsListRedemptions, (_e, rewardId: string) => channelPoints.listRedemptions(rewardId));
  ipcMain.handle(IPC.channelPointsSetRedemption, (_e, rewardId: string, redemptionId: string, status: 'FULFILLED' | 'CANCELED') => channelPoints.setRedemption(rewardId, redemptionId, status));

  // Reward groups: desktop-side grouping; a group toggle PATCHes is_enabled on each manageable member.
  rewardGroups = new RewardGroupsService({
    store,
    toggleReward: (rewardId, enabled) => channelPoints.updateReward(rewardId, { isEnabled: enabled })
  });
  rewardGroups.on('changed', (list) => broadcast(IPC.rewardGroupsChanged, list));
  ipcMain.handle(IPC.rewardGroupsList, () => rewardGroups.list());
  ipcMain.handle(IPC.rewardGroupsCreate, (_e, input: RewardGroupInput) => rewardGroups.create(input));
  ipcMain.handle(IPC.rewardGroupsUpdate, (_e, id: string, input: RewardGroupInput) => rewardGroups.update(id, input));
  ipcMain.handle(IPC.rewardGroupsDelete, (_e, id: string) => rewardGroups.delete(id));
  ipcMain.handle(IPC.rewardGroupsSetEnabled, (_e, id: string, enabled: boolean) => rewardGroups.setEnabled(id, enabled));
}

function registerCommands(): void {
  commands = new CommandsService({ getApiKey: () => store.get('api_key') ?? '' });
  commands.on('changed', (snap) => broadcast(IPC.commandsChanged, snap));
  ipcMain.handle(IPC.commandsSnapshot, () => commands.snapshot());
  ipcMain.handle(IPC.commandsRefresh, () => commands.refresh());
  ipcMain.handle(IPC.commandsUpdateBuiltin, (_e, name: string, patch: BuiltinCommandUpdate) => commands.updateBuiltin(name, patch));
}

function registerSoundboard(): void {
  soundboard = new SoundboardService({ getApiKey: () => store.get('api_key') ?? '' });
  soundboard.on('changed', (snap) => broadcast(IPC.soundboardChanged, snap));
  ipcMain.handle(IPC.soundboardSnapshot, () => soundboard.snapshot());
  ipcMain.handle(IPC.soundboardRefresh, () => soundboard.refresh());
  ipcMain.handle(IPC.soundboardPlay, (_e, sound: string) => soundboard.play(sound));
}

function registerTimers(): void {
  timers = new TimersService({ getApiKey: () => store.get('api_key') ?? '' });
  timers.on('changed', (snap) => broadcast(IPC.timersChanged, snap));
  ipcMain.handle(IPC.timersSnapshot, () => timers.snapshot());
  ipcMain.handle(IPC.timersRefresh, () => timers.refresh());
  ipcMain.handle(IPC.timersCreate, (_e, input: TimerInput) => timers.create(input));
  ipcMain.handle(IPC.timersUpdate, (_e, id: number, input: TimerInput) => timers.update(id, input));
  ipcMain.handle(IPC.timersToggle, (_e, id: number, enabled: boolean) => timers.toggle(id, enabled));
  ipcMain.handle(IPC.timersDelete, (_e, id: number) => timers.delete(id));
}

function registerRaffles(): void {
  raffles = new RafflesService({ getApiKey: () => store.get('api_key') ?? '' });
  raffles.on('changed', (snap) => broadcast(IPC.rafflesChanged, snap));
  ipcMain.handle(IPC.rafflesSnapshot, () => raffles.snapshot());
  ipcMain.handle(IPC.rafflesRefresh, () => raffles.refresh());
  ipcMain.handle(IPC.rafflesCreate, (_e, input: RaffleInput) => raffles.create(input));
  ipcMain.handle(IPC.rafflesUpdate, (_e, id: number, input: RaffleInput) => raffles.update(id, input));
  ipcMain.handle(IPC.rafflesStart, (_e, id: number) => raffles.start(id));
  ipcMain.handle(IPC.rafflesStop, (_e, id: number) => raffles.stop(id));
  ipcMain.handle(IPC.rafflesDraw, (_e, id: number) => raffles.draw(id));
  ipcMain.handle(IPC.rafflesDelete, (_e, id: number) => raffles.delete(id));
  ipcMain.handle(IPC.rafflesEntries, (_e, raffleId: number) => raffles.entries(raffleId));
  ipcMain.handle(IPC.rafflesWinners, (_e, raffleId: number) => raffles.winners(raffleId));
}

function registerPolls(): void {
  polls = new PollsService({
    getCredentials: (key) => specterApi.getCredentials(key),
    getApiKey: () => store.get('api_key') ?? ''
  });
  polls.on('changed', (snap) => broadcast(IPC.pollsChanged, snap));
  ipcMain.handle(IPC.pollsSnapshot, () => polls.snapshot());
  ipcMain.handle(IPC.pollsRefresh, () => polls.refresh());
  ipcMain.handle(IPC.pollsCreate, (_e, input: PollInput) => polls.create(input));
  ipcMain.handle(IPC.pollsEnd, (_e, id: string, status: PollEndStatus) => polls.end(id, status));
}

function registerPredictions(): void {
  predictions = new PredictionsService({
    getCredentials: (key) => specterApi.getCredentials(key),
    getApiKey: () => store.get('api_key') ?? ''
  });
  predictions.on('changed', (snap) => broadcast(IPC.predictionsChanged, snap));
  ipcMain.handle(IPC.predictionsSnapshot, () => predictions.snapshot());
  ipcMain.handle(IPC.predictionsRefresh, () => predictions.refresh());
  ipcMain.handle(IPC.predictionsCreate, (_e, input: PredictionInput) => predictions.create(input));
  ipcMain.handle(IPC.predictionsEnd, (_e, id: string, status: PredictionEndStatus, winningOutcomeId?: string) => predictions.end(id, status, winningOutcomeId));
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

function registerWheels(): WheelsService {
  const svc = new WheelsService({ store });
  wheels = svc;
  svc.on('changed', (snap) => {
    broadcast(IPC.wheelsChanged, snap);
    wheelOverlay?.broadcast(snap);
  });
  ipcMain.handle(IPC.wheelsSnapshot, () => svc.snapshot());
  ipcMain.handle(IPC.wheelsCreate, (_e, input: WheelInput) => svc.create(input));
  ipcMain.handle(IPC.wheelsUpdate, (_e, id: string, input: WheelInput) => svc.update(id, input));
  ipcMain.handle(IPC.wheelsDelete, (_e, id: string) => svc.delete(id));
  ipcMain.handle(IPC.wheelsSetActive, (_e, id: string) => svc.setActive(id));
  ipcMain.handle(IPC.wheelsSpin, (_e, id?: string) => svc.spin(id));
  ipcMain.handle(IPC.wheelsOpenOverlay, () => {
    const url = svc.snapshot().overlayUrl;
    if (url && isSafeExternalUrl(url)) void shell.openExternal(url);
    return url;
  });
  return svc;
}

function registerCameras(): CameraService {
  const binaryPath = resolveMediamtxPath({
    packaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
    appPath: app.getAppPath()
  });
  const svc = new CameraService({
    store,
    dataDir: join(app.getPath('userData'), 'mediamtx'),
    binaryPath,
    addBrowserSource: (name, url, w, h) => obs.addBrowserSource(name, url, w, h),
    obsHost: () => store.get('obs_host'),
    log: (level, message) => logs.add('CAM', level, message),
    registerSecret: (secret) => logs.registerSecret(secret),
    qrDataUrl: (text) => QRCode.toDataURL(text, { margin: 1, width: 320, errorCorrectionLevel: 'M' }),
    firewallTargets: [
      { label: 'app', path: process.platform === 'darwin' ? macAppBundle(process.execPath) : process.execPath },
      ...(binaryPath ? [{ label: 'camera server', path: binaryPath }] : [])
    ]
  });
  cameras = svc;
  svc.on('changed', (snap) => broadcast(IPC.camerasChanged, snap));
  ipcMain.handle(IPC.camerasSnapshot, () => svc.snapshot());
  ipcMain.handle(IPC.camerasSetEnabled, (_e, on: boolean) => svc.setEnabled(on === true));
  ipcMain.handle(IPC.camerasSetLanView, (_e, on: boolean) => svc.setLanView(on === true));
  ipcMain.handle(IPC.camerasSetHost, (_e, host: string) => svc.setHost(String(host)));
  ipcMain.handle(IPC.camerasSetPorts, (_e, ports: CameraPortsInput) => svc.setPorts(ports));
  ipcMain.handle(IPC.camerasRegenerateKey, () => svc.regenerateKey());
  ipcMain.handle(IPC.camerasAllowFirewall, () => svc.allowFirewall());
  ipcMain.handle(IPC.camerasAddToObs, (_e, id: string) => svc.addToObs(String(id)));
  ipcMain.handle(IPC.camerasOpenView, (_e, id: string) => {
    const url = svc.viewUrlFor(String(id));
    if (url && isSafeExternalUrl(url)) void shell.openExternal(url);
    return url;
  });
  return svc;
}

async function bootstrap(): Promise<void> {
  // macOS dock icon (Windows/Linux taskbar use BrowserWindow.icon); in dev this avoids the generic Electron mascot.
  if (process.platform === 'darwin' && app.dock) {
    try { app.dock.setIcon(APP_ICON_PATH); } catch { /* ignore — best-effort cosmetic */ }
  }

  store = new ConfigStore(join(app.getPath('userData'), 'config.json'));
  await migrateLegacyConfig(store, legacyConfigPath(app.getPath('appData')));
  registerIpc();
  registerObs();
  registerRelay();
  registerAlerts();
  registerChat();
  registerBotStatus();
  registerAuth();
  registerTwitch();
  registerChannelPoints();
  registerCommands();
  registerSoundboard();
  registerTimers();
  registerRaffles();
  registerPolls();
  registerPredictions();
  registerActions();
  registerAutomations();
  const wheelsSvc = registerWheels();
  try {
    wheelOverlay = await startWheelOverlay(() => wheelsSvc.snapshot());
    wheelsSvc.setOverlayUrl(wheelOverlay.url);
  } catch (err) {
    logs.add('APP', 'warn', `Wheel overlay not started: ${err instanceof Error ? err.message : String(err)}`);
  }

  const camerasSvc = registerCameras();
  void camerasSvc.init().catch((err) => {
    logs.add('CAM', 'err', `Camera server not started: ${err instanceof Error ? err.message : String(err)}`);
  });

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
  // Fetch commands on boot so the screen is ready; built-in fetches without auth, custom + user need an API key.
  void commands.refresh();
  // Soundboard list is per-user; only meaningful with a key (no-ops to idle otherwise).
  if (apiKey) void soundboard.refresh();
  // Timers are per-user; only fetch when there's a key.
  if (apiKey) void timers.refresh();
  // Raffles are per-user; only fetch when there's a key.
  if (apiKey) void raffles.refresh();
  // Channel-point rewards are per-broadcaster; only fetch when there's a key.
  if (apiKey) void channelPoints.refresh();
  // Twitch polls are per-broadcaster; only fetch when there's a key.
  if (apiKey) void polls.refresh();
  // Twitch predictions are per-broadcaster; only fetch when there's a key.
  if (apiKey) void predictions.refresh();

  createMainWindow();
}

app.whenReady().then(bootstrap);

let quitting = false;
app.on('before-quit', (e) => {
  if (quitting) return;
  quitting = true;
  wheels?.dispose();
  wheelOverlay?.close();
  // Stop MediaMTX before exiting so it never outlives the app and keeps port 1935 bound.
  if (cameras) {
    e.preventDefault();
    void cameras.dispose().finally(() => app.quit());
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
});
