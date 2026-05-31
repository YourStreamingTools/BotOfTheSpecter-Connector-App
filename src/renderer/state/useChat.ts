import React from 'react';
import { IPC, type ChatMessage, type ChatModeration } from '@shared/ipc';

export type ChatFeedItem =
  | { kind: 'msg'; key: string; msg: ChatMessage }
  | { kind: 'sys'; key: string; text: string };

const CAP = 300;

export function useChat(): ChatFeedItem[] {
  const [items, setItems] = React.useState<ChatFeedItem[]>([]);
  React.useEffect(() => {
    let alive = true;
    // Subscribe BEFORE requesting the snapshot so messages arriving during the
    // round-trip aren't dropped when the snapshot resolves.
    const offMsg = window.api.on(IPC.chatMessage, (m) => {
      const msg = m as ChatMessage;
      const item: ChatFeedItem = { kind: 'msg', key: msg.id, msg };
      setItems((prev) => [...prev, item].slice(-CAP));
    });
    const offMod = window.api.on(IPC.chatModeration, (m) =>
      setItems((prev) => applyModeration(prev, m as ChatModeration).slice(-CAP))
    );
    void window.api.chat.snapshot().then((msgs) => {
      if (!alive) return;
      const snap = msgs.map((m): ChatFeedItem => ({ kind: 'msg', key: m.id, msg: m }));
      // Merge instead of overwrite: snapshot (history) first, then any live items
      // that arrived during the round-trip and aren't already in the snapshot.
      setItems((live) => {
        const seen = new Set(snap.map((it) => it.key));
        return [...snap, ...live.filter((it) => !seen.has(it.key))].slice(-CAP);
      });
    });
    return () => { alive = false; offMsg(); offMod(); };
  }, []);
  return items;
}

// Mirror the moderation effect on the live feed (the service already does it for the
// snapshot) and append a system notice describing what happened.
function applyModeration(items: ChatFeedItem[], mod: ChatModeration): ChatFeedItem[] {
  let next = items;
  if (mod.action === 'clear') next = [];
  else if (mod.action === 'delete' && mod.messageId) next = items.filter((it) => !(it.kind === 'msg' && it.msg.id === mod.messageId));
  else if ((mod.action === 'ban' || mod.action === 'timeout') && mod.targetUserId) next = items.filter((it) => !(it.kind === 'msg' && it.msg.userId === mod.targetUserId));
  const text = describeMod(mod);
  if (text) {
    const sys: ChatFeedItem = { kind: 'sys', key: `sys-${mod.t}-${Math.random().toString(36).slice(2, 8)}`, text };
    next = [...next, sys];
  }
  return next;
}

function describeMod(mod: ChatModeration): string | null {
  const by = mod.moderator || 'a moderator';
  switch (mod.action) {
    case 'clear': return `Chat cleared by ${by}`;
    case 'delete': return `Message${mod.targetUserName ? ` from ${mod.targetUserName}` : ''} deleted by ${by}`;
    case 'ban': return `${mod.targetUserName ?? 'A user'} banned by ${by}`;
    case 'timeout': return `${mod.targetUserName ?? 'A user'} timed out by ${by}`;
    default: return null; // other mod actions aren't surfaced in the feed (v1)
  }
}
