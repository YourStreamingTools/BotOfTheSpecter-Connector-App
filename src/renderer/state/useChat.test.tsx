import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useChat } from './useChat';
import type { ChatMessage } from '@shared/ipc';

let listeners: Record<string, (...a: unknown[]) => void>;
beforeEach(() => {
  listeners = {};
  window.api.on = vi.fn((c: string, cb: (...a: unknown[]) => void) => { listeners[c] = cb; return () => delete listeners[c]; });
  window.api.chat = { snapshot: vi.fn().mockResolvedValue([]) };
});

const chatMsg = (id: string, userId: string, text: string): ChatMessage => ({
  id, userId, login: 'u', displayName: 'U', text,
  isBroadcaster: false, isMod: false, isVip: false, isSubscriber: false, isAction: false, t: '00:00:00'
});

function Probe() {
  const items = useChat();
  return <div data-testid="feed">{items.map((it) => it.kind === 'msg' ? `M:${it.msg.text}` : `S:${it.text}`).join('|')}</div>;
}

describe('useChat', () => {
  it('appends messages and applies a clear', async () => {
    render(<Probe />);
    await act(async () => {});
    act(() => listeners['chat:message'](chatMsg('1', 'a', 'hi')));
    expect(screen.getByTestId('feed').textContent).toBe('M:hi');
    act(() => listeners['chat:moderation']({ action: 'clear', moderator: 'M', t: '00:00:00' }));
    expect(screen.getByTestId('feed').textContent).toBe('S:Chat cleared by M');
  });

  it('does not lose a live message that arrives before the snapshot resolves', async () => {
    let resolveSnap: (v: ChatMessage[]) => void = () => undefined;
    window.api.chat = { snapshot: vi.fn((): Promise<ChatMessage[]> => new Promise((r) => { resolveSnap = r; })) };
    render(<Probe />);
    act(() => listeners['chat:message'](chatMsg('live1', 'a', 'live')));
    await act(async () => { resolveSnap([chatMsg('hist1', 'b', 'history')]); });
    // History (snapshot) first, then the live message that arrived during the round-trip — neither dropped.
    expect(screen.getByTestId('feed').textContent).toBe('M:history|M:live');
  });

  it('drops a banned user\'s messages and adds a notice', async () => {
    render(<Probe />);
    await act(async () => {});
    act(() => { listeners['chat:message'](chatMsg('1', 'a', 'one')); listeners['chat:message'](chatMsg('2', 'b', 'two')); });
    act(() => listeners['chat:moderation']({ action: 'ban', moderator: 'M', targetUserId: 'a', targetUserName: 'A', t: '00:00:00' }));
    expect(screen.getByTestId('feed').textContent).toBe('M:two|S:A banned by M');
  });
});
