import { EventEmitter } from 'events';
import type { Alert, AlertsSnapshot } from '@shared/ipc';
import { normalizeAlert } from '@shared/alert-events';

/**
 * Holds a rolling, newest-first buffer of alert events received on the relay
 * (follows, subs, cheers, raids, redemptions, donations, stream on/off). Pure
 * in-memory: the relay carries no history, so the feed only reflects what
 * arrived while connected, and it clears on restart.
 */
export class AlertsService extends EventEmitter {
  private buf: Alert[] = []; // newest-first

  constructor(private cap = 200) {
    super();
  }

  /** Feed a raw relay event. Non-alert events are ignored. Emits 'alert' on a match. */
  handleEvent(event: string, data: Record<string, unknown>): void {
    const alert = normalizeAlert(event, data);
    if (!alert) return;
    this.buf.unshift(alert);
    if (this.buf.length > this.cap) this.buf.length = this.cap;
    this.emit('alert', alert);
  }

  snapshot(): AlertsSnapshot {
    return { alerts: [...this.buf] };
  }
}
