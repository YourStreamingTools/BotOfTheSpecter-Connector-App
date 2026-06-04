import type { TimerInput } from './ipc';

const SHOUTOUT_VAR = /\(shoutout\.\w+\)/;

/** Validate a timer input (interval 5–480 min, min 60 if message uses a (shoutout.username) var; chat-line trigger >= 5); returns an error string or null when valid. Lives in @shared so main-process service and renderer form gate Save identically. */
export function validateTimerInput(input: TimerInput): string | null {
  const msg = (input?.message ?? '').trim();
  if (!msg) return 'Message is required';
  const needsInterval = input.triggerType === 'timer' || input.triggerType === 'both';
  const needsChat = input.triggerType === 'chat_lines' || input.triggerType === 'both';
  if (needsInterval) {
    const n = input.intervalCount;
    if (typeof n !== 'number' || !Number.isInteger(n)) return 'Interval (minutes) is required';
    const min = SHOUTOUT_VAR.test(msg) ? 60 : 5;
    if (n < min || n > 480) {
      return min === 60
        ? 'Interval must be at least 60 minutes when the message uses a (shoutout.username) variable'
        : 'Interval must be between 5 and 480 minutes';
    }
  }
  if (needsChat) {
    const n = input.chatLineTrigger;
    if (typeof n !== 'number' || !Number.isInteger(n)) return 'Chat line count is required';
    if (n < 5) return 'Chat line count must be at least 5';
  }
  return null;
}
