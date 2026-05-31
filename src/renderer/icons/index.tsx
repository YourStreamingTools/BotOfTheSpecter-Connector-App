import React from 'react';

export type IconProps = {
  size?: number;
  stroke?: number;
  style?: React.CSSProperties;
};

type BaseProps = IconProps & {
  d?: string;
  fill?: string;
  viewBox?: string;
  children?: React.ReactNode;
};

const Icon = ({ d, size = 18, stroke = 1.6, fill = 'none', children, viewBox = '0 0 24 24', style }: BaseProps) => (
  <svg width={size} height={size} viewBox={viewBox} fill={fill} stroke="currentColor"
       strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={style}>
    {d ? <path d={d} /> : children}
  </svg>
);

export const IconSpecter = ({ size = 18, style }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style}>
    <path d="M12 2.5c-4.42 0-8 3.58-8 8v9.2c0 .94 1.05 1.5 1.83.97l1.5-1.02c.36-.25.85-.22 1.19.06l1.46 1.22a1 1 0 0 0 1.28 0l1.46-1.22a1 1 0 0 1 1.18-.06l1.47 1.02c.79.55 1.85-.03 1.85-.99V10.5c0-4.42-3.58-8-8-8Z" opacity=".95" />
    <circle cx="9.2" cy="11" r="1.4" fill="#0D0D0D" />
    <circle cx="14.8" cy="11" r="1.4" fill="#0D0D0D" />
  </svg>
);

export const IconDashboard = (p: IconProps) => <Icon {...p} d="M3.5 12a8.5 8.5 0 0 1 17 0M12 12l4.5-4.5M12 12v.01" />;
export const IconOBS = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="2.5" />
    <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
  </Icon>
);
export const IconChat = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 12a8 8 0 0 1-11.5 7.2L4 20l.9-4.9A8 8 0 1 1 21 12Z" />
    <path d="M8.5 11h.01M12 11h.01M15.5 11h.01" />
  </Icon>
);
export const IconCommands = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="4" width="18" height="16" rx="2.5" /><path d="M7 9l3 3-3 3M13 15h4" /></Icon>
);
export const IconAlerts = (p: IconProps) => (
  <Icon {...p}><path d="M6 8a6 6 0 1 1 12 0c0 6 3 7 3 7H3s3-1 3-7Z" /><path d="M10 19a2 2 0 0 0 4 0" /></Icon>
);
export const IconSoundboard = (p: IconProps) => (
  <Icon {...p}><path d="M11 5 6 9H3v6h3l5 4V5Z" /><path d="M16 9a4 4 0 0 1 0 6M19 6a8 8 0 0 1 0 12" /></Icon>
);
export const IconMusic = (p: IconProps) => (
  <Icon {...p}><path d="M9 18V5l11-2v13" /><circle cx="6.5" cy="18" r="2.5" /><circle cx="17.5" cy="16" r="2.5" /></Icon>
);
export const IconTimers = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l2.5 2.5M9 2h6M12 5v2" /></Icon>
);
export const IconGiveaway = (p: IconProps) => (
  <Icon {...p}><rect x="3" y="8" width="18" height="5" rx="1" /><path d="M5 13v8h14v-8M12 8v13M7.5 8a2.5 2.5 0 0 1 0-5c1.5 0 3 2 4.5 5-3 0-4.5 0-4.5 0ZM16.5 8a2.5 2.5 0 0 0 0-5c-1.5 0-3 2-4.5 5 3 0 4.5 0 4.5 0Z" /></Icon>
);
export const IconPoints = (p: IconProps) => (
  <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9 9h4.5a2 2 0 0 1 0 4H9M9 13h5a2 2 0 0 1 0 4H9" /></Icon>
);
export const IconLogs = (p: IconProps) => (
  <Icon {...p}><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M8 13h8M8 17h5" /></Icon>
);
export const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </Icon>
);
export const IconSearch = (p: IconProps) => <Icon {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></Icon>;
export const IconPlay = (p: IconProps) => <Icon {...p} d="M6 4v16l14-8L6 4Z" stroke={p.stroke ?? 0} fill="currentColor" />;
export const IconStop = (p: IconProps) => <Icon {...p}><rect x="6" y="6" width="12" height="12" rx="1.5" /></Icon>;
export const IconRecord = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="5" fill="currentColor" /><circle cx="12" cy="12" r="9" /></Icon>;
export const IconPause = (p: IconProps) => <Icon {...p}><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></Icon>;
export const IconMic = (p: IconProps) => <Icon {...p}><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" /></Icon>;
export const IconMicOff = (p: IconProps) => <Icon {...p}><path d="m4 4 16 16M9 9v2a3 3 0 0 0 5.1 2.1M15 13.4V6a3 3 0 0 0-6-.4M5 11a7 7 0 0 0 11 5.6M19 11a7 7 0 0 1-.4 2.4M12 18v3M8 21h8" /></Icon>;
export const IconCam = (p: IconProps) => <Icon {...p}><rect x="2" y="6" width="14" height="12" rx="2" /><path d="m16 10 6-3v10l-6-3z" /></Icon>;
export const IconCamOff = (p: IconProps) => <Icon {...p}><path d="m2 2 20 20M16 16H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2m4 0h2a2 2 0 0 1 2 2v2m6-3-6 3v6" /></Icon>;
export const IconEye = (p: IconProps) => <Icon {...p}><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" /></Icon>;
export const IconEyeOff = (p: IconProps) => <Icon {...p}><path d="M2 2l20 20M6.7 6.7C3.8 8.5 2 12 2 12s3.5 7 10 7c1.9 0 3.6-.4 5-1.2M9.9 5.1A11 11 0 0 1 12 5c6.5 0 10 7 10 7a18 18 0 0 1-3 3.7M9.9 9.9a3 3 0 0 0 4.2 4.2" /></Icon>;
export const IconLink = (p: IconProps) => <Icon {...p}><path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></Icon>;
export const IconLinkOff = (p: IconProps) => <Icon {...p}><path d="m2 2 20 20M9 17H7a5 5 0 0 1-3.5-8.5M17 7h2a5 5 0 0 1 3.5 8.5M8 12h2m4 0h2" /></Icon>;
export const IconChevronDown = (p: IconProps) => <Icon {...p} d="m6 9 6 6 6-6" />;
export const IconChevronRight = (p: IconProps) => <Icon {...p} d="m9 6 6 6-6 6" />;
export const IconChevronLeft = (p: IconProps) => <Icon {...p} d="m15 6-6 6 6 6" />;
export const IconPlus = (p: IconProps) => <Icon {...p} d="M12 5v14M5 12h14" />;
export const IconMore = (p: IconProps) => <Icon {...p}><circle cx="5" cy="12" r="1.4" fill="currentColor" /><circle cx="12" cy="12" r="1.4" fill="currentColor" /><circle cx="19" cy="12" r="1.4" fill="currentColor" /></Icon>;
export const IconFilter = (p: IconProps) => <Icon {...p} d="M3 5h18l-7 9v6l-4-2v-4L3 5Z" />;
export const IconRefresh = (p: IconProps) => <Icon {...p}><path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5" /></Icon>;
export const IconShield = (p: IconProps) => <Icon {...p}><path d="M12 3 4 6v6c0 5 3.5 8.5 8 9 4.5-.5 8-4 8-9V6l-8-3Z" /><path d="m9 12 2 2 4-4" /></Icon>;
export const IconBan = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="m5.5 5.5 13 13" /></Icon>;
export const IconClock = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.5 2" /></Icon>;
export const IconBolt = (p: IconProps) => <Icon {...p} d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />;
export const IconHeart = (p: IconProps) => <Icon {...p} d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 22l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />;
export const IconGift = (p: IconProps) => <Icon {...p}><rect x="3" y="8" width="18" height="5" rx="1" /><path d="M5 13v8h14v-8M12 8v13" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5c1.5 0 3 2 4.5 5M16.5 8a2.5 2.5 0 0 0 0-5c-1.5 0-3 2-4.5 5" /></Icon>;
export const IconStar = (p: IconProps) => <Icon {...p} d="m12 2 3.1 6.3 7 1-5 4.9 1.2 7L12 17.8 5.7 21l1.2-7-5-4.9 7-1L12 2Z" />;
export const IconDot = (p: IconProps) => <Icon {...p}><circle cx="12" cy="12" r="3" fill="currentColor" /></Icon>;
export const IconExternal = (p: IconProps) => <Icon {...p}><path d="M14 4h6v6M20 4 10 14M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" /></Icon>;
export const IconCopy = (p: IconProps) => <Icon {...p}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3" /></Icon>;
export const IconTwitch = ({ size = 18, style }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style}>
    <path d="M4.5 2 3 5.6v15h5V23h3l2.5-2.4h4L22 16V2H4.5Zm15.5 13-3 3h-5l-2.5 2.4V18H6V4h14v11Zm-4-7h-1.5v4.5H16V8Zm-4.5 0H10v4.5h1.5V8Z" />
  </svg>
);
export const IconKick = ({ size = 18, style }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style}>
    <path d="M4 3h4v6l3-3h4l-4 4V11h2l4 5h-4l-3-4-2 2v4H4V3Z" />
  </svg>
);
export const IconDiscord = ({ size = 18, style }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" style={style}>
    <path d="M19.3 5.3A17.5 17.5 0 0 0 15 4l-.2.4a16 16 0 0 0-5.5 0L9.2 4a17.5 17.5 0 0 0-4.4 1.3C2 9.5 1 13.7 1.5 17.7a17.6 17.6 0 0 0 5.4 2.7l1.1-1.6a11 11 0 0 1-1.8-.9l.4-.3a12.5 12.5 0 0 0 11 0l.4.3-1.8.9 1.1 1.6a17.5 17.5 0 0 0 5.4-2.7c.6-4.6-.6-8.8-3.4-12.4ZM8.5 15.2c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Zm7 0c-1 0-1.8-.9-1.8-2s.8-2 1.8-2 1.8.9 1.8 2-.8 2-1.8 2Z" />
  </svg>
);
export const IconWifi = (p: IconProps) => <Icon {...p}><path d="M5 12.5a10 10 0 0 1 14 0M8.5 16a5 5 0 0 1 7 0M2 9a14 14 0 0 1 20 0" /><circle cx="12" cy="19.5" r="1.2" fill="currentColor" /></Icon>;
export const IconCpu = (p: IconProps) => <Icon {...p}><rect x="6" y="6" width="12" height="12" rx="1.5" /><rect x="9" y="9" width="6" height="6" /><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" /></Icon>;
export const IconClose = (p: IconProps) => <Icon {...p} d="m6 6 12 12M6 18 18 6" />;
export const IconEdit = (p: IconProps) => (
  <Icon {...p}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></Icon>
);
export const IconBox = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <path d="m3.3 7 8.7 5 8.7-5M12 22V12" />
  </Icon>
);
export const IconUsers = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8" />
  </Icon>
);
export const IconTrash = (p: IconProps) => (
  <Icon {...p}><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6M10 11v6M14 11v6" /></Icon>
);
