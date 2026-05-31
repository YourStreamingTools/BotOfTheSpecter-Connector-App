// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { normalizeChatMessage, normalizeModeration, detectAction } from './chat-events';

// The relay's normalized flat CHAT_MESSAGE shape (message is a plain string).
const chatEvent = {
  channel_code: 'REDACTED', event: 'CHAT_MESSAGE',
  user_id: '7654321', username: 'testviewer', display_name: 'TestViewer',
  color: '#A1C53A',
  badges: [{ set_id: 'moderator', id: '1' }, { set_id: 'subscriber', id: '3036' }],
  message: 'hello world', message_id: 'msg-1', emotes: []
};

describe('normalizeChatMessage', () => {
  it('maps the relay CHAT_MESSAGE shape (user_id/username/display_name, message string)', () => {
    const m = normalizeChatMessage(chatEvent)!;
    expect(m).toMatchObject({
      id: 'msg-1', userId: '7654321', login: 'testviewer', displayName: 'TestViewer',
      text: 'hello world', color: '#A1C53A', isMod: true, isSubscriber: true, isVip: false, isBroadcaster: false
    });
    expect(m.t).toMatch(/^\d{2}:\d{2}:\d{2}/);
  });

  it('derives roles from various badge shapes', () => {
    expect(normalizeChatMessage({ ...chatEvent, badges: ['broadcaster', 'vip'] })!).toMatchObject({ isBroadcaster: true, isVip: true });
    expect(normalizeChatMessage({ ...chatEvent, badges: { broadcaster: '1', subscriber: '3036' } })!).toMatchObject({ isBroadcaster: true, isSubscriber: true });
  });

  it('tolerates the raw EventSub shape (message object, chatter_* fields)', () => {
    const m = normalizeChatMessage({ chatter_user_id: '1', chatter_user_name: 'X', message: { text: 'hi' }, message_id: 'm', badges: [] })!;
    expect(m).toMatchObject({ userId: '1', displayName: 'X', text: 'hi' });
  });

  it('handles fragment-only / empty messages, but skips ones with no message_id', () => {
    expect(normalizeChatMessage({ message: { fragments: [{ text: 'a' }, { text: 'b' }] }, message_id: 'm' })!.text).toBe('ab');
    expect(normalizeChatMessage({ message: null, message_id: 'm' })!.text).toBe('');
    expect(normalizeChatMessage({ message: 'hi' })).toBeNull(); // no message_id
  });

  it('treats /me action messages correctly across the wire formats we see', () => {
    // Plain non-action stays plain.
    expect(normalizeChatMessage({ ...chatEvent, message: 'hello' })!).toMatchObject({ text: 'hello', isAction: false });
    // Relay-mangled form: "ACTION - text" with the explicit dash.
    expect(normalizeChatMessage({ ...chatEvent, message: 'ACTION - waves at chat' })!).toMatchObject({ text: 'waves at chat', isAction: true });
    // Raw CTCP form: <0x01>ACTION text<0x01>.
    const CTCP = String.fromCharCode(1);
    expect(normalizeChatMessage({ ...chatEvent, message: `${CTCP}ACTION waves at chat${CTCP}` })!).toMatchObject({ text: 'waves at chat', isAction: true });
  });
});

describe('detectAction', () => {
  it('returns the text unchanged when there is no action prefix', () => {
    expect(detectAction('hello')).toEqual({ text: 'hello', isAction: false });
  });
  it('does NOT mangle innocent messages that start with the word "action"', () => {
    // Critical: real users say things like "action movie", "Action!" — keep them intact.
    expect(detectAction('action movie tonight')).toEqual({ text: 'action movie tonight', isAction: false });
    expect(detectAction('Action!')).toEqual({ text: 'Action!', isAction: false });
    expect(detectAction('Take action now')).toEqual({ text: 'Take action now', isAction: false });
  });
  it('matches relay-mangled form (ACTION followed by dash or colon)', () => {
    expect(detectAction('ACTION - waves')).toEqual({ text: 'waves', isAction: true });
    expect(detectAction('ACTION: waves')).toEqual({ text: 'waves', isAction: true });
  });
  it('matches CTCP-wrapped form', () => {
    const CTCP = String.fromCharCode(1);
    expect(detectAction(`${CTCP}ACTION waves${CTCP}`)).toEqual({ text: 'waves', isAction: true });
  });
});

describe('normalizeModeration', () => {
  it('maps a ban to its target + moderator', () => {
    const mod = normalizeModeration({
      action: 'ban', moderator_user_name: 'TestMod',
      ban: { user_id: '7654321', user_login: 'baduser', user_name: 'BadUser', reason: '' }
    })!;
    expect(mod).toMatchObject({ action: 'ban', moderator: 'TestMod', targetUserId: '7654321', targetUserName: 'BadUser' });
  });

  it('maps a delete to its message id', () => {
    const mod = normalizeModeration({
      action: 'delete', moderator_user_name: 'TestMod',
      delete: { user_id: '7654321', user_name: 'BadUser', message_id: 'msg-9', message_body: 'x' }
    })!;
    expect(mod).toMatchObject({ action: 'delete', messageId: 'msg-9', targetUserName: 'BadUser' });
  });

  it('maps a clear with no target', () => {
    const mod = normalizeModeration({ action: 'clear', moderator_user_name: 'TestMod' })!;
    expect(mod).toMatchObject({ action: 'clear', moderator: 'TestMod' });
    expect(mod.targetUserId).toBeUndefined();
  });
});
