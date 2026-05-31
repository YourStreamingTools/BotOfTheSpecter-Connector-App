// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { ChatService } from './chat-service';

const msg = (id: string, userId: string, text: string) => ({
  message_id: id, user_id: userId, username: 'u', display_name: 'U', message: text, badges: []
});
// isAction property is normalised in chat-events, asserted there — these tests focus on buffer/moderation behaviour.

describe('ChatService', () => {
  it('buffers and emits chat messages', () => {
    const svc = new ChatService();
    const seen: string[] = [];
    svc.on('message', (m: { text: string }) => seen.push(m.text));
    svc.handleChat(msg('1', 'a', 'hi'));
    expect(seen).toEqual(['hi']);
    expect(svc.snapshot().map((m) => m.text)).toEqual(['hi']);
  });

  it('clears the buffer on a clear moderation event', () => {
    const svc = new ChatService();
    svc.handleChat(msg('1', 'a', 'hi'));
    svc.handleModeration({ action: 'clear', moderator_user_name: 'M' });
    expect(svc.snapshot()).toEqual([]);
  });

  it('removes one message on delete and a user\'s messages on ban', () => {
    const svc = new ChatService();
    svc.handleChat(msg('1', 'a', 'one'));
    svc.handleChat(msg('2', 'b', 'two'));
    svc.handleChat(msg('3', 'a', 'three'));
    svc.handleModeration({ action: 'delete', moderator_user_name: 'M', delete: { message_id: '2' } });
    expect(svc.snapshot().map((m) => m.id)).toEqual(['1', '3']);
    svc.handleModeration({ action: 'ban', moderator_user_name: 'M', ban: { user_id: 'a' } });
    expect(svc.snapshot()).toEqual([]);
  });

  it('caps the buffer', () => {
    const svc = new ChatService(2);
    svc.handleChat(msg('1', 'a', 'a'));
    svc.handleChat(msg('2', 'a', 'b'));
    svc.handleChat(msg('3', 'a', 'c'));
    expect(svc.snapshot().map((m) => m.text)).toEqual(['b', 'c']);
  });

  it('emits moderation events', () => {
    const svc = new ChatService();
    const seen: string[] = [];
    svc.on('moderation', (m: { action: string }) => seen.push(m.action));
    svc.handleModeration({ action: 'ban', moderator_user_name: 'M', ban: { user_id: 'x', user_name: 'X' } });
    expect(seen).toEqual(['ban']);
  });
});
