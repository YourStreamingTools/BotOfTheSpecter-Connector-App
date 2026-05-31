import { EventEmitter } from 'events';
import type { ChatMessage } from '@shared/ipc';
import { normalizeChatMessage, normalizeModeration } from './chat-events';

/**
 * Holds a rolling buffer of live chat and reflects observed moderation:
 * clear wipes the buffer, delete drops one message, ban/timeout drops the
 * target's messages — so a snapshot never replays moderated content.
 */
export class ChatService extends EventEmitter {
  private buf: ChatMessage[] = [];

  constructor(private cap = 300) {
    super();
  }

  handleChat(raw: Record<string, unknown>): void {
    const m = normalizeChatMessage(raw);
    if (!m) return;
    this.buf.push(m);
    if (this.buf.length > this.cap) this.buf.shift();
    this.emit('message', m);
  }

  handleModeration(raw: Record<string, unknown>): void {
    const mod = normalizeModeration(raw);
    if (!mod) return;
    if (mod.action === 'clear') {
      this.buf = [];
    } else if (mod.action === 'delete' && mod.messageId) {
      this.buf = this.buf.filter((m) => m.id !== mod.messageId);
    } else if ((mod.action === 'ban' || mod.action === 'timeout') && mod.targetUserId) {
      this.buf = this.buf.filter((m) => m.userId !== mod.targetUserId);
    }
    this.emit('moderation', mod);
  }

  snapshot(): ChatMessage[] {
    return [...this.buf];
  }
}
