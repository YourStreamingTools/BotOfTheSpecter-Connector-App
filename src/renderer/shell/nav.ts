import React from 'react';
import {
  IconDashboard, IconOBS, IconChat, IconAlerts, IconCommands, IconSoundboard,
  IconMusic, IconTimers, IconGiveaway, IconPoints, IconLogs, IconSettings,
  IconBolt,
  type IconProps
} from '../icons';
import { Placeholder } from '../screens/Placeholder';
import { ScreenDashboard } from '../screens/Dashboard';
import { ScreenObs } from '../screens/Obs';
import { ScreenLogs } from '../screens/Logs';
import { ScreenSettings } from '../screens/Settings';
import { ScreenVariables } from '../screens/Variables';
import { ScreenChannelPoints } from '../screens/ChannelPoints';
import { ScreenChat } from '../screens/Chat';
import { ScreenCommands } from '../screens/Commands';
import { ScreenAutomation } from '../screens/Automation';
import { ScreenActions } from '../screens/Actions';
import { ScreenSoundboard } from '../screens/Soundboard';

export type ScreenId =
  | 'dashboard' | 'obs' | 'chat' | 'alerts'
  | 'commands' | 'sound' | 'music' | 'timers' | 'giveaways' | 'points'
  | 'automation' | 'actions'
  | 'variables' | 'logs' | 'settings';

export type IconComponent = React.FC<IconProps>;

export interface NavItem {
  id: ScreenId;
  label: string;
  icon: IconComponent;
  badge?: 'obs';
}

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: 'Stream',
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: IconDashboard },
      { id: 'obs', label: 'OBS Control', icon: IconOBS, badge: 'obs' },
      { id: 'chat', label: 'Chat & Mod', icon: IconChat },
      { id: 'alerts', label: 'Alerts', icon: IconAlerts }
    ]
  },
  {
    label: 'Engagement',
    items: [
      { id: 'commands', label: 'Commands', icon: IconCommands },
      { id: 'sound', label: 'Soundboard', icon: IconSoundboard },
      { id: 'music', label: 'Song Requests', icon: IconMusic },
      { id: 'timers', label: 'Timers', icon: IconTimers },
      { id: 'giveaways', label: 'Giveaways', icon: IconGiveaway },
      { id: 'points', label: 'Channel Points', icon: IconPoints }
    ]
  },
  {
    label: 'Automation',
    items: [
      { id: 'automation', label: 'Automation', icon: IconBolt },
      { id: 'actions',    label: 'Actions',    icon: IconCommands }
    ]
  },
  {
    label: 'System',
    items: [
      { id: 'variables', label: 'Variables', icon: IconLogs },
      { id: 'logs', label: 'Logs', icon: IconLogs },
      { id: 'settings', label: 'Settings', icon: IconSettings }
    ]
  }
];

export const SCREEN_TITLES: Record<ScreenId, { t: string; s: string }> = {
  dashboard: { t: 'Dashboard', s: 'Bot, stream and channel at a glance' },
  obs: { t: 'OBS Control', s: 'WebSocket bridge to OBS Studio' },
  chat: { t: 'Chat & Mod', s: 'Live Twitch chat and moderation' },
  alerts: { t: 'Alerts', s: 'Follows, subs, bits and raids' },
  commands: { t: 'Commands', s: 'Built-in, custom and viewer commands' },
  sound: { t: 'Soundboard', s: 'Sound alerts and walk-ons' },
  music: { t: 'Song Requests', s: 'Spotify and !song queue' },
  timers: { t: 'Timers', s: 'Auto-messages on a schedule' },
  giveaways: { t: 'Giveaways', s: 'Polls, predictions and giveaways' },
  points: { t: 'Channel Points', s: 'Twitch reward redemptions and actions' },
  automation: { t: 'Automation', s: 'Connect triggers to actions' },
  actions: { t: 'Actions', s: 'Reusable building blocks for automations' },
  variables: { t: 'Variables', s: 'Real-time event data' },
  logs: { t: 'Logs', s: 'Event stream and debug' },
  settings: { t: 'Settings', s: 'Account, integrations, preferences' }
};

export const SCREENS: Record<ScreenId, { component: React.ComponentType }> = {
  dashboard: { component: ScreenDashboard },
  obs: { component: ScreenObs },
  logs: { component: ScreenLogs },
  settings: { component: ScreenSettings },
  variables: { component: ScreenVariables },
  points: { component: ScreenChannelPoints },
  chat: { component: ScreenChat },
  commands: { component: ScreenCommands },
  automation: { component: ScreenAutomation },
  actions: { component: ScreenActions },
  alerts: { component: () => React.createElement(Placeholder, { title: 'Alerts', icon: IconAlerts, hint: 'Follow / sub / bits / raid alerts with sound and message overlays. Needs the alerts backend.' }) },
  sound: { component: ScreenSoundboard },
  music: { component: () => React.createElement(Placeholder, { title: 'Song Requests', icon: IconMusic, hint: 'Spotify queue and chat-driven !songrequest. Needs the music backend.' }) },
  timers: { component: () => React.createElement(Placeholder, { title: 'Timers', icon: IconTimers, hint: 'Auto-messages on a cadence. Needs the bot timers API.' }) },
  giveaways: { component: () => React.createElement(Placeholder, { title: 'Giveaways · Polls · Predictions', icon: IconGiveaway, hint: 'Run a giveaway, poll or prediction. Needs the bot engagement API.' }) }
};
