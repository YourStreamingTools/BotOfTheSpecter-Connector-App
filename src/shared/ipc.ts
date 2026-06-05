// ---- Automation (Triggers/Actions/Automations) ----
// Actions: reusable, configured units of work an Automation runs when a Trigger fires.

export type ActionType =
  | 'call_webpage'        // make an HTTP request
  | 'change_variable'     // set a value on the variables store
  | 'trigger_command'     // run a bot command (e.g. !so)
  | 'play_sound'          // play a soundboard entry
  | 'tts'                // text-to-speech
  | 'toggle_automation'  // enable / disable another automation rule by id (UI label: "Enable/Disable Command")
  | 'send_webhook'             // outbound webhook
  // ---- Twitch Actions: execute via Twitch Helix API using the useable_access_token from /v2/account ----
  | 'toggle_redemption'        // Enable / Disable a specific Channel Points reward
  | 'run_ads'                  // start a Twitch ad break of a chosen length
  | 'create_marker'            // place a marker in the current VOD
  | 'start_end_poll'           // start a new poll OR end the currently-active poll
  | 'start_cancel_prediction'  // start a new prediction OR cancel the active one
  | 'toggle_slow_mode'         // turn chat slow mode on / off / toggle
  | 'create_clip';             // capture a clip from the live stream

export interface CallWebpageConfig {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers: Array<{ key: string; value: string }>;
  body: string;
}
export interface ChangeVariableConfig {
  name: string;
  value: string;
}
export interface TriggerCommandConfig {
  command: string; // bare command without the '!' prefix
}
export interface PlaySoundConfig {
  // Reference to a Soundboard entry.
  soundId: string;
  soundName: string; // cached display name so the row stays readable if the entry is missing
}

// TTS config (routes through the Soundboard pipeline).
export interface TtsConfig {
  text: string;
  voice: string; // optional — empty string means "default voice"
}

// Enable/disable another Automation rule by id. UI label: "Enable/Disable Command".
export interface ToggleAutomationConfig {
  targetAutomationId: string;
  mode: 'enable' | 'disable' | 'toggle';
}

// Outbound webhook — a POST-flavoured sibling of call_webpage.
export interface SendWebhookConfig {
  url: string;
  method: 'POST' | 'PUT';
  headers: Array<{ key: string; value: string }>;
  payload: string;
}

// ---- Twitch Action configs ----
// Twitch Actions execute against Helix with the streamer's useable_access_token.

// Toggle a specific Channel Points custom reward (rewardId is a Twitch UUID).
export interface ToggleRedemptionConfig {
  rewardId: string;
  rewardName: string; // cached display name so the row stays readable if the reward is removed
  mode: 'enable' | 'disable' | 'toggle';
}

// Twitch's POST /helix/channels/ads accepts a fixed set of ad lengths in seconds.
export interface RunAdsConfig {
  length: 30 | 60 | 90 | 120 | 150 | 180;
}

// Create a stream marker at the current timestamp (POST /helix/streams/markers); description optional, capped at 140 chars.
export interface CreateMarkerConfig {
  description: string;
}

// Start or end a poll. "End" operates on the channel's currently-active poll.
export interface StartEndPollConfig {
  mode: 'start' | 'end';
  // start-only fields (ignored on 'end'):
  title: string;                         // <= 60 chars per Twitch
  choices: string[];                     // 2–5 entries, each <= 25 chars
  durationSeconds: number;               // 15–1800
  channelPointsVotingEnabled: boolean;
  channelPointsPerVote: number;          // 1–1,000,000, ignored when voting disabled
}

// Start or cancel a prediction. "Cancel" operates on the active prediction.
export interface StartCancelPredictionConfig {
  mode: 'start' | 'cancel';
  // start-only fields (ignored on 'cancel'):
  title: string;                         // <= 45 chars per Twitch
  outcomes: string[];                    // 2–10 entries, each <= 25 chars
  predictionWindowSeconds: number;       // 30–1800
}

// Toggle chat slow mode. waitTimeSeconds (3–120) applies when mode='on'.
export interface ToggleSlowModeConfig {
  mode: 'on' | 'off' | 'toggle';
  waitTimeSeconds: number;
}

// Capture a clip via POST /helix/clips. hasDelay maps to Twitch's has_delay param.
export interface CreateClipConfig {
  hasDelay: boolean;
}

// Discriminated union so the right config type is enforced for each action.
export type ActionBody =
  | { type: 'call_webpage';    config: CallWebpageConfig }
  | { type: 'change_variable'; config: ChangeVariableConfig }
  | { type: 'trigger_command'; config: TriggerCommandConfig }
  | { type: 'play_sound';      config: PlaySoundConfig }
  | { type: 'tts';                config: TtsConfig }
  | { type: 'toggle_automation';  config: ToggleAutomationConfig }
  | { type: 'send_webhook';       config: SendWebhookConfig }
  | { type: 'toggle_redemption';        config: ToggleRedemptionConfig }
  | { type: 'run_ads';                  config: RunAdsConfig }
  | { type: 'create_marker';            config: CreateMarkerConfig }
  | { type: 'start_end_poll';           config: StartEndPollConfig }
  | { type: 'start_cancel_prediction';  config: StartCancelPredictionConfig }
  | { type: 'toggle_slow_mode';         config: ToggleSlowModeConfig }
  | { type: 'create_clip';              config: CreateClipConfig };

export interface Action {
  id: string;          // generated short id (e.g. 'act_<10 chars>')
  name: string;        // user-supplied label
  enabled: boolean;
  body: ActionBody;
  createdAt: string;   // ISO timestamp
  updatedAt: string;
}

export interface ActionInput {
  name: string;
  enabled?: boolean;
  body: ActionBody;
}

// ---- Automations (the rules engine) ----
// An Automation bundles Triggers + optional Checks + an Actions block, organised in nested Folders.

export type CheckOperator = 'eq' | 'ne' | 'gt' | 'lt' | 'contains' | 'regex';

export interface VariableCheck {
  type: 'variable';
  variable: string;     // variable name
  operator: CheckOperator;
  value: string;
}

export interface DataCheck {
  type: 'data';
  // Path into the firing trigger's payload, e.g. 'user.login', 'redemption.cost'.
  path: string;
  operator: CheckOperator;
  value: string;
}

export type Check = VariableCheck | DataCheck;
export type ChecksGate = 'AND' | 'OR';

// ---- Triggers — most have empty config; a few carry filter config to narrow which event fires.

// Fires on Twitch chat; optional `command` filter matches messages starting with `!<command>`.
export interface ChatMessageTriggerConfig { command?: string; }
export interface SubTriggerConfig { minTier?: 1 | 2 | 3; }
export interface BitsTriggerConfig { minBits?: number; }
export interface RaidTriggerConfig { minRaiders?: number; }
export interface ChannelPointRedemptionTriggerConfig { rewardId?: string; rewardName?: string; }
export interface ObsSceneSwitchTriggerConfig { sceneName?: string; }

export type Trigger =
  | { type: 'chat_message';             config: ChatMessageTriggerConfig }
  | { type: 'follow';                   config: Record<string, never> }
  | { type: 'sub';                      config: SubTriggerConfig }
  | { type: 'bits';                     config: BitsTriggerConfig }
  | { type: 'raid';                     config: RaidTriggerConfig }
  | { type: 'channel_point_redemption'; config: ChannelPointRedemptionTriggerConfig }
  | { type: 'stream_go_live';           config: Record<string, never> }
  | { type: 'stream_end';               config: Record<string, never> }
  | { type: 'obs_scene_switch';         config: ObsSceneSwitchTriggerConfig }
  | { type: 'obs_stream_start_stop';    config: Record<string, never> }
  | { type: 'manual_fire';              config: Record<string, never> }
  | { type: 'public_api_webhook';       config: Record<string, never> };

export type TriggerType = Trigger['type'];

// ---- Action block — references library actions by id; mode controls how they run.

export interface ActionRef { actionId: string; }

export type ActionMode = 'standard' | 'random' | 'toggle' | 'sequence' | 'if_else' | 'switch_case';

// Inline check that drives If/Else — same shape as VariableCheck but lives inside the block.
export interface IfElseInlineCheck {
  variable: string;
  operator: CheckOperator;
  value: string;
}

export interface IfElseBlock {
  inlineCheck: IfElseInlineCheck;
  thenActions: ActionRef[];
  elseActions: ActionRef[];
}

export interface SwitchCaseBlock {
  source: { kind: 'trigger_field'; path: string } | { kind: 'variable'; name: string };
  cases: Array<{ value: string; actions: ActionRef[] }>;
  defaultActions: ActionRef[];
}

// One block per Automation; only the active mode's field is populated.
export interface AutomationActions {
  mode: ActionMode;
  refs?: ActionRef[];          // used for standard | random | toggle | sequence
  ifElse?: IfElseBlock;        // used for if_else
  switchCase?: SwitchCaseBlock; // used for switch_case
}

// ---- Folders — tree organisation. parentId === null means root.

export interface Folder {
  id: string;              // 'fld_' + 10 alphanum
  name: string;
  parentId: string | null;
  order: number;           // sort order within siblings (smaller first)
}

export interface FolderInput {
  name: string;
  parentId?: string | null;
}

// ---- Automation — the unit.

export interface Automation {
  id: string;              // 'auto_' + 10 alphanum
  name: string;
  enabled: boolean;
  folderId: string | null; // null = root level
  order: number;           // sort order within folder
  queue: string | null;    // null = "No Queue" (fire-and-forget, no serialisation)
  triggers: Trigger[];
  checks: Check[];
  checksGate: ChecksGate;
  actions: AutomationActions;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationInput {
  name: string;
  enabled?: boolean;
  folderId?: string | null;
  queue?: string | null;
  triggers?: Trigger[];
  checks?: Check[];
  checksGate?: ChecksGate;
  actions?: AutomationActions;
}

export type ReorderDirection = 'up' | 'down';

// Persisted config shape; api_key/obs_*/log_expanded/variables stay compatible with the legacy PyQt config.json.
export interface AppConfig {
  api_key?: string;
  obs_host?: string;
  obs_port?: number;
  obs_password?: string;
  autoConnectObs?: boolean;
  log_expanded?: boolean;
  theme?: 'system' | 'dark' | 'light';
  density?: 'compact' | 'regular' | 'comfy';
  sidebarExpanded?: boolean;
  variables?: {
    values: Record<string, unknown>;
    counters: Record<string, number>;
  };
  actions?: Action[];
  folders?: Folder[];
  automations?: Automation[];
  rewardGroups?: RewardGroup[];
  // OBS stream output count; scales the drifted outputDuration so LIVE matches wall-clock. 0/undefined = auto-detect.
  streamOutputCount?: number;
}

// ---- OBS integration ----
export type ObsConnectionState = 'connected' | 'connecting' | 'disconnected' | 'error';

export interface ObsStatus {
  state: ObsConnectionState;
  url?: string;
  obsVersion?: string;
  rpcVersion?: number;
  eventsForwarded: number;
  error?: string;
}

export interface ObsOutputs {
  streaming: boolean;
  recording: boolean;
  recordingPaused: boolean;
  replayBuffer: boolean;
  streamTimecode: string;
  recordTimecode: string;
  recordPath?: string;
  // Stream health from GetStreamStatus; streamCongestion 0–1 (>~0.4 ≈ viewer drops).
  streamReconnecting: boolean;
  streamCongestion: number;
}

export interface ObsStats {
  streamBitrateKbps: number;
  recordBitrateKbps: number;
  cpuUsage: number;
  memoryMb: number;
  activeFps: number;
  droppedFrames: number;          // encoder-output skipped frames (from GetStats.outputSkippedFrames)
  // Expanded fields (from GetStats — added for disk warnings + render-lag % + drop %)
  availableDiskSpaceMb: number;
  renderSkippedFrames: number;    // render pipeline skipped (pre-encoder)
  renderTotalFrames: number;
  outputTotalFrames: number;      // pairs with droppedFrames → drop rate %
}

// Live audio meter for one input. peakDb = loudest channel peak (dBFS), floored at -100 for silence.
export interface ObsAudioMeter {
  name: string;
  peakDb: number;
}

export type ObsSourceType = 'video' | 'audio' | 'browser' | 'image' | 'other';

export interface ObsSource {
  id: number;
  name: string;
  enabled: boolean;
  type: ObsSourceType;
}

export interface ObsScenes {
  current: string;
  scenes: string[];
  sources: Record<string, ObsSource[]>;
}

// A filter attached to a source (e.g. Color Correction, Sharpen); listed via GetSourceFilterList, toggled via SetSourceFilterEnabled.
export interface ObsSourceFilter {
  name: string;
  kind: string;     // OBS's internal filter kind id, e.g. 'color_correction_filter_v2'
  enabled: boolean;
  index: number;    // OBS stacking order (smaller renders first)
}

// An audio mixer input (global/special or scene input) with its live mute + level.
export interface ObsAudioSource {
  name: string;
  kind: string;
  muted: boolean;
  volumeDb: number; // floored at -100 (treated as −∞) since JSON can't carry -Infinity
}

export interface ObsLogEntry {
  t: string;
  type: string;
  message: string;
  direction: 'in' | 'out' | 'info';
}

export interface ObsConnectParams {
  host: string;
  port: number;
  password: string;
}

// Full current OBS state, fetched on mount so a screen renders before the next push.
export interface ObsSnapshot {
  status: ObsStatus;
  outputs: ObsOutputs | null;
  stats: ObsStats | null;
  scenes: ObsScenes | null;
  audio: ObsAudioSource[] | null;
  audioMeters: ObsAudioMeter[];
}

// ---- Relay / Variables / Logs ----
export type RelayConnectionState = 'connected' | 'connecting' | 'disconnected' | 'error';

export interface RelayStatus {
  state: RelayConnectionState;
  url?: string;
  registered: boolean;
  locked: boolean;
  hasApiKey: boolean;
  error?: string;
}

export interface VariablesSnapshot {
  values: Record<string, unknown>;
  counters: Record<string, number>;
}

export type LogSource = 'OBS' | 'TWITCH' | 'WS' | 'BOT' | 'APP';
export type LogLevel = 'info' | 'ok' | 'warn' | 'err' | 'evt';

export interface LogEntry {
  t: string;
  src: LogSource;
  level: LogLevel;
  message: string;
}

// Live chat line (SpecterWS CHAT_MESSAGE → Twitch EventSub channel.chat.message).
export interface ChatMessage {
  id: string;
  userId: string;
  login: string;
  displayName: string;
  text: string;
  color?: string;
  isBroadcaster: boolean;
  isMod: boolean;
  isVip: boolean;
  isSubscriber: boolean;
  isAction: boolean; // /me messages — render italic, "* name text" instead of "name: text"
  bits?: number;
  t: string;
}

// Observed moderation activity (SpecterWS MODERATION → Twitch EventSub channel.moderate).
export interface ChatModeration {
  action: string;          // clear | delete | ban | timeout | ...
  moderator: string;       // display name of who performed it
  targetUserId?: string;
  targetUserName?: string;
  messageId?: string;      // present for delete
  t: string;
}

// Bot process status from the BotOfTheSpecter API (/v2/bot/status).
export interface BotStatus {
  running: boolean;
  reachable: boolean; // did the status request succeed
  pid?: number;
  version?: string;
  botType?: string;
  outdated?: boolean;
  latestVersion?: string;
}

// Live Twitch channel status from Helix (/streams for live state + viewers, /channels for game/title), derived in the main process.
export interface TwitchStatus {
  reachable: boolean; // could we reach Twitch with valid credentials
  online: boolean;
  game?: string;
  title?: string;
  viewers?: number;
  startedAt?: string;
}

// Result of validating an API key against the BotOfTheSpecter API (/v2/checkkey).
export interface ValidateResult {
  valid: boolean;
  username?: string;
  message: string;
}

// ---- Commands (bot command catalog) ----

// A built-in bot command from GET /commands/info (usage = the API's `syntax`); enabled/forceLevel mirror the streamer-side state.
export interface BuiltinCommand {
  name: string;          // e.g. 'songrequest'
  description: string;
  usage: string[];       // always normalised to an array, even when the API sends a single string
  aliases: string[];     // e.g. ['sr']
  forceLevel?: string;   // permission token: 'everyone' | 'vip' | 'mod' | 'broadcaster' | ...
  enabled: boolean;      // current streamer-side Enabled/Disabled state
}

// Payload for PUT /v2/builtin-commands/update — both fields required by the API.
export interface BuiltinCommandUpdate {
  status: 'Enabled' | 'Disabled';
  permission: string;
}

// A streamer-defined custom command from GET /v2/custom-commands (X-API-KEY).
export interface CustomCommand {
  name: string;          // already includes the bare name without '!'
  response: string;
  enabled: boolean;
  cooldown: number;      // seconds
  permission: string;    // 'everyone' | 'mod' | 'broadcaster' | ...
}

// A viewer-defined personal command from GET /v2/user-commands/get/all (X-API-KEY); the API groups by owner login, flattened here with the owner attached.
export interface UserCommand {
  name: string;
  response: string;
  enabled: boolean;
  cooldown: number;
  ownerLogin: string;            // the viewer who owns the command
  ownerProfileImage?: string;    // CDN URL when present in the response
}

export type CommandsLoadState = 'idle' | 'loading' | 'ok' | 'error';

export interface CommandsSnapshot {
  builtin: BuiltinCommand[];
  custom: CustomCommand[];
  user: UserCommand[];
  state: CommandsLoadState;
  error?: string;
  fetchedAt?: string;
}

// ---- Soundboard (sound alerts) ----
// The streamer's sound-alert filenames from GET /sound-alerts; read-only (play triggers via the overlay).
export type SoundboardLoadState = 'idle' | 'loading' | 'ok' | 'error';

export interface SoundboardSnapshot {
  sounds: string[];          // e.g. ['airhorn.mp3', 'yay.wav']
  state: SoundboardLoadState;
  error?: string;
  fetchedAt?: string;
}

// ---- Timers (bot timed messages) ----
// Bot timed messages via GET/POST/PUT/DELETE /timers; triggerType = timer | chat_lines | both.
export type TimerTriggerType = 'timer' | 'chat_lines' | 'both';
export type TimersLoadState = 'idle' | 'loading' | 'ok' | 'error';

export interface Timer {
  id: number;
  triggerType: TimerTriggerType;
  intervalCount: number | null;   // minutes (5–480; min 60 if message uses a (shoutout.x) var). null when chat-only.
  chatLineTrigger: number | null; // messages between posts (>=5). null when timer-only.
  message: string;
  enabled: boolean;
}

// Create/update payload from the renderer. id is omitted on create.
export interface TimerInput {
  triggerType: TimerTriggerType;
  intervalCount?: number | null;
  chatLineTrigger?: number | null;
  message: string;
  enabled?: boolean;
}

export interface TimersSnapshot {
  timers: Timer[];
  state: TimersLoadState;
  error?: string;
  fetchedAt?: string;
}

// ---- Giveaways / Raffles (bot raffles) ----
// Channel raffles via GET/POST/PUT/DELETE /raffles; entries are viewer-driven (!joinraffle), edit only while 'scheduled'.
export type RaffleStatus = 'scheduled' | 'running' | 'ended';
export type RaffleFollowUnit = 'days' | 'weeks' | 'months' | 'years';
export type RafflesLoadState = 'idle' | 'loading' | 'ok' | 'error';

export interface Raffle {
  id: number;
  name: string;
  prize: string;
  numberOfWinners: number;
  status: RaffleStatus;
  isWeighted: boolean;
  weightSubT1: number | null;
  weightSubT2: number | null;
  weightSubT3: number | null;
  weightVip: number | null;
  excludeMods: boolean;
  subscribersOnly: boolean;
  followersOnly: boolean;
  followersMinEnabled: boolean;
  followersMinValue: number;
  followersMinUnit: string;
  createdAt: string | null;
  entryCount: number;
  winnerCount: number;
  winners: string[];   // winner usernames, from the list endpoint
}

// Create/update payload from the renderer; id omitted on create, and the API only allows updating a raffle while 'scheduled'.
export interface RaffleInput {
  name: string;
  prize?: string;
  numberOfWinners: number;
  isWeighted: boolean;
  weightSubT1: number;
  weightSubT2: number;
  weightSubT3: number;
  weightVip: number;
  excludeMods: boolean;
  subscribersOnly: boolean;
  followersOnly: boolean;
  followersMinEnabled: boolean;
  followersMinValue: number;
  followersMinUnit: RaffleFollowUnit;
}

export interface RaffleEntry {
  id: number;
  raffleId: number;
  userId: string | null;
  username: string | null;
  weight: number;
  source: string | null;
  enteredAt: string | null;
}

export interface RaffleWinner {
  id: number;
  raffleId: number;
  entryId: number;
  userId: string | null;
  username: string | null;
  source: string | null;
  wonAt: string | null;
}

export interface RafflesSnapshot {
  raffles: Raffle[];
  state: RafflesLoadState;
  error?: string;
  fetchedAt?: string;
}

// ---- Polls (Twitch polls) ----
// Twitch polls via direct Helix (GET/POST/PATCH helix/polls); one ACTIVE at a time, re-fetched on an interval for live counts.
export type PollStatus = 'ACTIVE' | 'COMPLETED' | 'TERMINATED' | 'ARCHIVED' | 'MODERATED' | 'INVALID';
export type PollEndStatus = 'TERMINATED' | 'ARCHIVED';
export type PollsLoadState = 'idle' | 'loading' | 'ok' | 'error';

export interface PollChoice {
  id: string;
  title: string;
  votes: number;
  channelPointsVotes: number;
}

export interface Poll {
  id: string;
  title: string;
  choices: PollChoice[];
  status: PollStatus;
  duration: number;                 // seconds
  channelPointsVotingEnabled: boolean;
  channelPointsPerVote: number;
  startedAt: string;
  endedAt: string | null;
}

// Create payload from the renderer.
export interface PollInput {
  title: string;
  choices: string[];                // 2–5 non-empty choice titles, each <= 25 chars
  duration: number;                 // 15–1800 seconds
  channelPointsVotingEnabled: boolean;
  channelPointsPerVote: number;     // 1–1,000,000; used only when voting is enabled
}

export interface PollsSnapshot {
  polls: Poll[];
  state: PollsLoadState;
  error?: string;
  fetchedAt?: string;
}

// ---- Predictions (Twitch Channel Points predictions) ----
// Twitch predictions via direct Helix; one at a time, requires the channel:manage:predictions scope, re-fetched on an interval for live stakes.
export type PredictionStatus = 'ACTIVE' | 'LOCKED' | 'RESOLVED' | 'CANCELED';
export type PredictionEndStatus = 'LOCKED' | 'RESOLVED' | 'CANCELED';
export type PredictionsLoadState = 'idle' | 'loading' | 'ok' | 'error';

export interface PredictionOutcome {
  id: string;
  title: string;
  users: number;
  channelPoints: number;
  color: string;              // 'BLUE' | 'PINK'
}

export interface Prediction {
  id: string;
  title: string;
  outcomes: PredictionOutcome[];
  winningOutcomeId: string | null;
  predictionWindow: number;   // seconds
  status: PredictionStatus;
  createdAt: string;
  endedAt: string | null;
  lockedAt: string | null;
}

// Create payload from the renderer.
export interface PredictionInput {
  title: string;
  outcomes: string[];         // 2–10 non-empty outcome titles, each <= 25 chars
  predictionWindow: number;   // 30–1800 seconds
}

export interface PredictionsSnapshot {
  predictions: Prediction[];
  state: PredictionsLoadState;
  error?: string;
  fetchedAt?: string;
}

// ---- Alerts (live event feed) ----
// Read-only feed of relay alert events (follow/sub/cheer/raid/redemption/donation/stream), stamped with receivedAt, in-memory only.
export type AlertKind =
  | 'follow' | 'sub' | 'cheer' | 'raid' | 'redemption' | 'donation' | 'stream';
export type AlertPlatform = 'twitch' | 'fourthwall' | 'kofi' | 'patreon';

export interface Alert {
  id: string;                 // generated 'alt_' + counter/random
  kind: AlertKind;
  platform: AlertPlatform;
  who?: string;               // actor display name (absent for stream on/off)
  amount?: number;            // bits / viewers / months / money — meaning given by `unit`
  unit?: string;              // 'bits' | 'viewers' | 'months' | a currency code
  tier?: string;              // sub tier label ('Tier 1' | 'Prime' | …)
  rewardTitle?: string;       // channel-point reward title
  message?: string;           // user_input / donation message
  detail?: string;            // pre-formatted human summary line for the row
  online?: boolean;           // for kind:'stream' — true=went live, false=went offline
  receivedAt: number;         // Date.now() at arrival (the wire carries no timestamp)
}

export interface AlertsSnapshot {
  alerts: Alert[];            // newest-first
}

// ---- Channel Points (Twitch custom rewards + redemptions) ----
// Direct Helix (broadcaster token + Specter Client-Id); manageable = Specter-created, so editable here.
export type ChannelPointsLoadState = 'idle' | 'loading' | 'ok' | 'error';

export interface ChannelReward {
  id: string;
  title: string;
  cost: number;
  prompt: string;
  backgroundColor?: string;
  isEnabled: boolean;
  isPaused: boolean;
  isInStock: boolean;
  isUserInputRequired: boolean;
  // Cooldown / per-stream caps (flattened from the Helix *_setting objects).
  globalCooldownEnabled: boolean;
  globalCooldownSeconds: number;
  maxPerStreamEnabled: boolean;
  maxPerStream: number;
  maxPerUserPerStreamEnabled: boolean;
  maxPerUserPerStream: number;
  imageUrl?: string;            // image.url_2x ?? default_image.url_2x
  manageable: boolean;          // editable by this app (Specter-created)
}

// Patch body for PATCH /channel_points/custom_rewards; only changed fields sent (all optional), mirrors the Helix update body in camelCase.
export interface ChannelRewardUpdate {
  title?: string;
  cost?: number;
  prompt?: string;
  backgroundColor?: string;
  isEnabled?: boolean;
  isPaused?: boolean;
  isUserInputRequired?: boolean;
  isGlobalCooldownEnabled?: boolean;
  globalCooldownSeconds?: number;
  isMaxPerStreamEnabled?: boolean;
  maxPerStream?: number;
  isMaxPerUserPerStreamEnabled?: boolean;
  maxPerUserPerStream?: number;
}

// Create body for POST /channel_points/custom_rewards. title + cost are required.
export interface ChannelRewardCreate {
  title: string;
  cost: number;
  prompt?: string;
  backgroundColor?: string;
  isEnabled?: boolean;
  isUserInputRequired?: boolean;
  isGlobalCooldownEnabled?: boolean;
  globalCooldownSeconds?: number;
  isMaxPerStreamEnabled?: boolean;
  maxPerStream?: number;
  isMaxPerUserPerStreamEnabled?: boolean;
  maxPerUserPerStream?: number;
  shouldRedemptionsSkipRequestQueue?: boolean;
}

export type RedemptionStatus = 'UNFULFILLED' | 'FULFILLED' | 'CANCELED';

export interface RedemptionItem {
  id: string;
  rewardId: string;
  rewardTitle: string;
  rewardCost: number;
  userName: string;
  userInput: string;
  redeemedAt: string;          // RFC3339
  status: RedemptionStatus;
}

export interface ChannelPointsSnapshot {
  rewards: ChannelReward[];
  state: ChannelPointsLoadState;
  error?: string;
  fetchedAt?: string;
}

// Desktop-side grouping of rewards (no Twitch equivalent); toggling applies is_enabled to every manageable member.
export interface RewardGroup {
  id: string;            // 'grp_' + 10 alphanum
  name: string;
  rewardIds: string[];   // Twitch reward ids
}

export interface RewardGroupInput {
  name: string;
  rewardIds?: string[];
}

// Display-only subset of /v2/account; tokens (access/refresh/spotify/discord/api_key) are stripped in main, never exposed to the renderer.
export interface AccountInfo {
  id: number;
  username: string;
  displayName: string;
  twitchUserId: string;
  profileImage?: string;
  isAdmin: boolean;
  betaAccess: boolean;
  isTechnical: boolean;
}

// IPC channel names.
export const IPC = {
  configGet: 'config:get',
  configSet: 'config:set',
  configAll: 'config:all',
  windowMinimize: 'window:minimize',
  windowMaximize: 'window:maximize',
  windowClose: 'window:close',
  obsConnect: 'obs:connect',
  obsDisconnect: 'obs:disconnect',
  obsSetScene: 'obs:setScene',
  obsSetSourceEnabled: 'obs:setSourceEnabled',
  obsStartStream: 'obs:startStream',
  obsStopStream: 'obs:stopStream',
  obsStartRecord: 'obs:startRecord',
  obsStopRecord: 'obs:stopRecord',
  obsSaveReplay: 'obs:saveReplay',
  obsStartReplay: 'obs:startReplay',
  obsStopReplay: 'obs:stopReplay',
  obsToggleVcam: 'obs:toggleVcam',
  obsRefreshScenes: 'obs:refreshScenes',
  obsRefreshAudio: 'obs:refreshAudio',
  obsSetInputMute: 'obs:setInputMute',
  obsListSourceFilters: 'obs:listSourceFilters',
  obsSetSourceFilterEnabled: 'obs:setSourceFilterEnabled',
  obsSnapshot: 'obs:snapshot',
  obsStatus: 'obs:status',
  obsOutputs: 'obs:outputs',
  obsStats: 'obs:stats',
  obsScenes: 'obs:scenes',
  obsAudio: 'obs:audio',
  obsAudioMeters: 'obs:audioMeters',
  obsEvent: 'obs:event',
  relayStatus: 'relay:status',
  relaySetLock: 'relay:setLock',
  relaySetApiKey: 'relay:setApiKey',
  relayConnect: 'relay:connect',
  relayDisconnect: 'relay:disconnect',
  relaySnapshot: 'relay:snapshot',
  variablesAll: 'variables:all',
  variablesResetSession: 'variables:resetSession',
  variablesChanged: 'variables:changed',
  logLine: 'log:line',
  logSnapshot: 'log:snapshot',
  chatMessage: 'chat:message',
  chatModeration: 'chat:moderation',
  chatSnapshot: 'chat:snapshot',
  botStatus: 'bot:status',
  botSnapshot: 'bot:snapshot',
  authValidateKey: 'auth:validateKey',
  authAccount: 'auth:account',
  twitchStatus: 'twitch:status',
  twitchSnapshot: 'twitch:snapshot',
  commandsSnapshot: 'commands:snapshot',
  commandsRefresh: 'commands:refresh',
  commandsChanged: 'commands:changed',
  commandsUpdateBuiltin: 'commands:updateBuiltin',
  soundboardSnapshot: 'soundboard:snapshot',
  soundboardRefresh: 'soundboard:refresh',
  soundboardPlay: 'soundboard:play',
  soundboardChanged: 'soundboard:changed',
  timersSnapshot: 'timers:snapshot',
  timersRefresh: 'timers:refresh',
  timersCreate: 'timers:create',
  timersUpdate: 'timers:update',
  timersToggle: 'timers:toggle',
  timersDelete: 'timers:delete',
  timersChanged: 'timers:changed',
  rafflesSnapshot: 'raffles:snapshot',
  rafflesRefresh: 'raffles:refresh',
  rafflesCreate: 'raffles:create',
  rafflesUpdate: 'raffles:update',
  rafflesStart: 'raffles:start',
  rafflesStop: 'raffles:stop',
  rafflesDraw: 'raffles:draw',
  rafflesDelete: 'raffles:delete',
  rafflesEntries: 'raffles:entries',
  rafflesWinners: 'raffles:winners',
  rafflesChanged: 'raffles:changed',
  pollsSnapshot: 'polls:snapshot',
  pollsRefresh: 'polls:refresh',
  pollsCreate: 'polls:create',
  pollsEnd: 'polls:end',
  pollsChanged: 'polls:changed',
  predictionsSnapshot: 'predictions:snapshot',
  predictionsRefresh: 'predictions:refresh',
  predictionsCreate: 'predictions:create',
  predictionsEnd: 'predictions:end',
  predictionsChanged: 'predictions:changed',
  alertsSnapshot: 'alerts:snapshot',
  alert: 'alerts:alert',
  channelPointsSnapshot: 'channelPoints:snapshot',
  channelPointsRefresh: 'channelPoints:refresh',
  channelPointsCreateReward: 'channelPoints:createReward',
  channelPointsImportReward: 'channelPoints:importReward',
  channelPointsUpdateReward: 'channelPoints:updateReward',
  channelPointsListRedemptions: 'channelPoints:listRedemptions',
  channelPointsSetRedemption: 'channelPoints:setRedemption',
  channelPointsChanged: 'channelPoints:changed',
  rewardGroupsList: 'rewardGroups:list',
  rewardGroupsCreate: 'rewardGroups:create',
  rewardGroupsUpdate: 'rewardGroups:update',
  rewardGroupsDelete: 'rewardGroups:delete',
  rewardGroupsSetEnabled: 'rewardGroups:setEnabled',
  rewardGroupsChanged: 'rewardGroups:changed',
  actionsList: 'actions:list',
  actionsCreate: 'actions:create',
  actionsUpdate: 'actions:update',
  actionsDelete: 'actions:delete',
  actionsChanged: 'actions:changed',
  foldersList:            'folders:list',
  foldersCreate:          'folders:create',
  foldersUpdate:          'folders:update',
  foldersDelete:          'folders:delete',
  foldersReorder:         'folders:reorder',
  foldersChanged:         'folders:changed',
  automationsList:        'automations:list',
  automationsCreate:      'automations:create',
  automationsUpdate:      'automations:update',
  automationsDelete:      'automations:delete',
  automationsReorder:     'automations:reorder',
  automationsTestFire:    'automations:testFire',
  automationsChanged:     'automations:changed'
} as const;

// The exact surface exposed on window.api by the preload bridge.
export interface BridgeApi {
  config: {
    get<K extends keyof AppConfig>(key: K): Promise<AppConfig[K] | undefined>;
    set<K extends keyof AppConfig>(key: K, value: AppConfig[K]): Promise<void>;
    all(): Promise<AppConfig>;
  };
  window: {
    minimize(): Promise<void>;
    maximize(): Promise<void>;
    close(): Promise<void>;
  };
  obs: {
    connect(params: ObsConnectParams): Promise<void>;
    disconnect(): Promise<void>;
    setScene(sceneName: string): Promise<void>;
    setSourceEnabled(sceneName: string, sceneItemId: number, enabled: boolean): Promise<void>;
    startStream(): Promise<void>;
    stopStream(): Promise<void>;
    startRecord(): Promise<void>;
    stopRecord(): Promise<void>;
    saveReplay(): Promise<void>;
    startReplayBuffer(): Promise<void>;
    stopReplayBuffer(): Promise<void>;
    toggleVcam(): Promise<void>;
    refreshScenes(): Promise<void>;
    refreshAudio(): Promise<void>;
    setInputMute(name: string, muted: boolean): Promise<void>;
    listSourceFilters(sourceName: string): Promise<ObsSourceFilter[]>;
    setSourceFilterEnabled(sourceName: string, filterName: string, enabled: boolean): Promise<void>;
    snapshot(): Promise<ObsSnapshot>;
  };
  relay: {
    setLock(locked: boolean): Promise<void>;
    setApiKey(key: string): Promise<void>;
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    snapshot(): Promise<RelayStatus>;
  };
  variables: {
    all(): Promise<VariablesSnapshot>;
    resetSession(): Promise<void>;
  };
  logs: {
    snapshot(): Promise<LogEntry[]>;
  };
  chat: {
    snapshot(): Promise<ChatMessage[]>;
  };
  bot: {
    snapshot(): Promise<BotStatus>;
  };
  auth: {
    validateKey(key: string): Promise<ValidateResult>;
    account(key: string): Promise<AccountInfo | null>;
  };
  twitch: {
    snapshot(): Promise<TwitchStatus>;
  };
  commands: {
    snapshot(): Promise<CommandsSnapshot>;
    refresh(): Promise<void>;
    updateBuiltin(name: string, patch: BuiltinCommandUpdate): Promise<boolean>;
  };
  soundboard: {
    snapshot(): Promise<SoundboardSnapshot>;
    refresh(): Promise<void>;
    play(sound: string): Promise<boolean>;
  };
  timers: {
    snapshot(): Promise<TimersSnapshot>;
    refresh(): Promise<void>;
    create(input: TimerInput): Promise<boolean>;
    update(id: number, input: TimerInput): Promise<boolean>;
    toggle(id: number, enabled: boolean): Promise<boolean>;
    delete(id: number): Promise<boolean>;
  };
  raffles: {
    snapshot(): Promise<RafflesSnapshot>;
    refresh(): Promise<void>;
    create(input: RaffleInput): Promise<boolean>;
    update(id: number, input: RaffleInput): Promise<boolean>;
    start(id: number): Promise<boolean>;
    stop(id: number): Promise<boolean>;
    draw(id: number): Promise<string[] | null>;   // winner usernames, or null on failure
    delete(id: number): Promise<boolean>;
    entries(raffleId: number): Promise<RaffleEntry[]>;
    winners(raffleId: number): Promise<RaffleWinner[]>;
  };
  polls: {
    snapshot(): Promise<PollsSnapshot>;
    refresh(): Promise<void>;
    create(input: PollInput): Promise<boolean>;
    end(id: string, status: PollEndStatus): Promise<boolean>;
  };
  predictions: {
    snapshot(): Promise<PredictionsSnapshot>;
    refresh(): Promise<void>;
    create(input: PredictionInput): Promise<boolean>;
    end(id: string, status: PredictionEndStatus, winningOutcomeId?: string): Promise<boolean>;
  };
  alerts: {
    snapshot(): Promise<AlertsSnapshot>;
  };
  channelPoints: {
    snapshot(): Promise<ChannelPointsSnapshot>;
    refresh(): Promise<void>;
    createReward(input: ChannelRewardCreate): Promise<boolean>;
    importReward(rewardId: string): Promise<boolean>;
    updateReward(id: string, patch: ChannelRewardUpdate): Promise<boolean>;
    listRedemptions(rewardId: string): Promise<RedemptionItem[]>;
    setRedemption(rewardId: string, redemptionId: string, status: 'FULFILLED' | 'CANCELED'): Promise<boolean>;
  };
  rewardGroups: {
    list(): Promise<RewardGroup[]>;
    create(input: RewardGroupInput): Promise<RewardGroup>;
    update(id: string, input: RewardGroupInput): Promise<RewardGroup | null>;
    delete(id: string): Promise<boolean>;
    /** Enable/disable every manageable reward in the group. Returns how many were toggled. */
    setEnabled(id: string, enabled: boolean): Promise<number>;
  };
  actions: {
    list(): Promise<Action[]>;
    create(input: ActionInput): Promise<Action>;
    update(id: string, input: ActionInput): Promise<Action | null>;
    delete(id: string): Promise<boolean>;
  };
  folders: {
    list(): Promise<Folder[]>;
    create(input: FolderInput): Promise<Folder>;
    update(id: string, input: FolderInput): Promise<Folder | null>;
    delete(id: string): Promise<boolean>;
    reorder(id: string, direction: ReorderDirection): Promise<boolean>;
  };
  automations: {
    list(): Promise<Automation[]>;
    create(input: AutomationInput): Promise<Automation>;
    update(id: string, input: AutomationInput): Promise<Automation | null>;
    delete(id: string): Promise<boolean>;
    reorder(id: string, direction: ReorderDirection): Promise<boolean>;
    testFire(id: string): Promise<boolean>;
  };
  /** Host platform from process.platform, e.g. 'win32' | 'darwin' | 'linux'. */
  platform: NodeJS.Platform;
  /** Subscribe to a main→renderer push channel. Returns an unsubscribe fn. */
  on(channel: string, listener: (...args: unknown[]) => void): () => void;
}
