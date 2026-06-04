import React from 'react';
import { useChat } from '../state/useChat';
import { useRelay } from '../state/useRelay';
import type { ChatMessage } from '@shared/ipc';

export function ScreenChat() {
  const items = useChat();
  const relay = useRelay();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = React.useState(true);

  // Keep the newest message in view while pinned to the bottom.
  React.useEffect(() => {
    if (pinned && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [items, pinned]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 40);
  };

  const connected = relay.status.state === 'connected';

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="card-head" style={{ flexShrink: 0 }}>
          <h3>Chat</h3>
          <span className={`chip ${connected ? 'good' : ''}`} style={{ marginLeft: 'auto' }}>{connected ? 'live' : 'relay offline'}</span>
        </div>

        <div ref={scrollRef} onScroll={onScroll} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          {items.length === 0 && (
            <div className="dim" style={{ fontSize: 12, padding: '8px 4px' }}>
              {connected ? 'Waiting for chat…' : 'Connect the bot relay to see chat.'}
            </div>
          )}
          {items.map((it) => it.kind === 'sys'
            ? <div key={it.key} className="dim" style={{ fontSize: 11.5, padding: '3px 4px', fontStyle: 'italic', textAlign: 'center' }}>— {it.text} —</div>
            : <ChatLine key={it.key} m={it.msg} />)}
        </div>

        {!pinned && (
          <button className="btn btn-sm" style={{ flexShrink: 0, marginTop: 8, alignSelf: 'center' }} onClick={() => setPinned(true)}>
            Jump to latest ↓
          </button>
        )}
      </div>
    </div>
  );
}

function ChatLine({ m }: { m: ChatMessage }) {
  // Twitch /me actions render italic with no colon and text in the user's name colour.
  const nameColor = m.color || 'var(--text)';
  return (
    <div style={{ padding: '3px 4px', fontSize: 13, lineHeight: 1.45, wordBreak: 'break-word', fontStyle: m.isAction ? 'italic' : undefined }}>
      {m.isBroadcaster && <RoleBadge label="HOST" color="var(--error)" />}
      {m.isMod && <RoleBadge label="MOD" color="var(--success)" />}
      {m.isVip && <RoleBadge label="VIP" color="var(--secondary)" />}
      {m.isSubscriber && <RoleBadge label="SUB" color="var(--primary)" />}
      {m.isAction
        ? <>
            <span style={{ fontWeight: 700, color: nameColor }}>{m.displayName}</span>
            <span style={{ color: nameColor }}> {m.text}</span>
          </>
        : <>
            <span style={{ fontWeight: 700, color: nameColor }}>{m.displayName}</span>
            <span className="dim">: </span>
            <span>{m.text}</span>
          </>}
      {m.bits ? <span style={{ color: 'var(--secondary)', marginLeft: 6, fontSize: 11, fontWeight: 600 }}>+{m.bits} bits</span> : null}
    </div>
  );
}

function RoleBadge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 9, fontWeight: 800, letterSpacing: '0.04em', color,
      border: `1px solid ${color}`, borderRadius: 4, padding: '0 4px', marginRight: 5, verticalAlign: '1px'
    }}>{label}</span>
  );
}
