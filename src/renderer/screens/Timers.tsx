import React from 'react';
import { useTimers } from '../state/useTimers';
import { validateTimerInput } from '@shared/timers';
import type { Timer, TimerInput, TimerTriggerType } from '@shared/ipc';
import { IconTimers, IconClock, IconChat, IconPlus, IconEdit, IconTrash, IconRefresh } from '../icons';

type Draft = {
  id: number | null;
  triggerType: TimerTriggerType;
  message: string;
  intervalCount: string;     // kept as string so the field can be cleared without NaN
  chatLineTrigger: string;
  enabled: boolean;
};

const NEW_DRAFT: Draft = { id: null, triggerType: 'timer', message: '', intervalCount: '30', chatLineTrigger: '10', enabled: true };

const draftFromTimer = (t: Timer): Draft => ({
  id: t.id,
  triggerType: t.triggerType,
  message: t.message,
  intervalCount: t.intervalCount != null ? String(t.intervalCount) : '30',
  chatLineTrigger: t.chatLineTrigger != null ? String(t.chatLineTrigger) : '10',
  enabled: t.enabled
});

// Build the TimerInput a draft represents (only the fields its triggerType needs).
const draftToInput = (d: Draft): TimerInput => ({
  triggerType: d.triggerType,
  message: d.message.trim(),
  intervalCount: d.triggerType !== 'chat_lines' ? Number(d.intervalCount) : undefined,
  chatLineTrigger: d.triggerType !== 'timer' ? Number(d.chatLineTrigger) : undefined,
  enabled: d.enabled
});

export function ScreenTimers() {
  const snap = useTimers();
  const [editing, setEditing] = React.useState<Draft | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try { await window.api.timers.refresh(); } catch { /* surfaced via snap.state */ } finally { setRefreshing(false); }
  };

  const save = async () => {
    if (!editing) return;
    const input = draftToInput(editing);
    setBusy(true);
    try {
      if (editing.id == null) await window.api.timers.create(input);
      else await window.api.timers.update(editing.id, input);
      setEditing(null);
    } finally {
      setBusy(false);
    }
  };

  const toggle = (t: Timer) => void window.api.timers.toggle(t.id, !t.enabled);
  const remove = (t: Timer) => void window.api.timers.delete(t.id);

  // The two timer kinds the user thinks in terms of. 'both' shows in both groups.
  const chatTimers = snap.timers.filter((t) => t.triggerType === 'chat_lines' || t.triggerType === 'both');
  const messageTimers = snap.timers.filter((t) => t.triggerType === 'timer' || t.triggerType === 'both');

  return (
    <div className="screen">
      <div className="row" style={{ marginBottom: 14, gap: 10, alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Timers</h3>
        <span className="chip" style={{ marginLeft: 4 }}>{snap.timers.length}</span>
        {snap.state === 'error' && <span className="chip warn" title={snap.error}>error</span>}
        <span style={{ marginLeft: 'auto' }} />
        <button className="btn btn-sm" onClick={() => void refresh()} disabled={refreshing}>
          <IconRefresh size={11} />{refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button className="btn btn-sm btn-primary" onClick={() => setEditing({ ...NEW_DRAFT })}>
          <IconPlus size={12} />New timer
        </button>
      </div>

      {snap.state === 'idle' && (
        <Empty title="No API key yet" hint="Add your BotOfTheSpecter API key in Settings to manage your timed messages." />
      )}
      {snap.state === 'loading' && snap.timers.length === 0 && <Empty title="Loading timers…" />}
      {(snap.state === 'ok' || snap.timers.length > 0) && snap.timers.length === 0 && (
        <Empty title="No timers yet" hint="Create a timed message that posts on an interval or every N chat lines." />
      )}

      {snap.timers.length > 0 && (
        <div className="col" style={{ gap: 18 }}>
          <Section icon={IconClock} title="Message timers" subtitle="Post on a time interval"
                   timers={messageTimers} onEdit={(t) => setEditing(draftFromTimer(t))} onToggle={toggle} onRemove={remove} />
          <Section icon={IconChat} title="Chat-line timers" subtitle="Post every N chat messages"
                   timers={chatTimers} onEdit={(t) => setEditing(draftFromTimer(t))} onToggle={toggle} onRemove={remove} />
        </div>
      )}

      {editing && (
        <TimerEditor draft={editing} busy={busy} onChange={setEditing} onSave={() => void save()} onCancel={() => setEditing(null)} />
      )}
    </div>
  );
}

function Section({
  icon: Icon, title, subtitle, timers, onEdit, onToggle, onRemove
}: {
  icon: React.ComponentType<{ size?: number }>; title: string; subtitle: string;
  timers: Timer[]; onEdit: (t: Timer) => void; onToggle: (t: Timer) => void; onRemove: (t: Timer) => void;
}) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="card-head" style={{ flexShrink: 0 }}>
        <Icon size={15} />
        <h3 style={{ margin: '0 0 0 8px' }}>{title}</h3>
        <span className="dim" style={{ fontSize: 12, marginLeft: 8 }}>{subtitle}</span>
        <span className="chip" style={{ marginLeft: 'auto' }}>{timers.length}</span>
      </div>
      {timers.length === 0
        ? <span className="dim" style={{ fontSize: 12, padding: '6px 2px' }}>None yet.</span>
        : (
          <div className="col" style={{ gap: 8 }}>
            {timers.map((t) => (
              <TimerRow key={t.id} timer={t} onEdit={() => onEdit(t)} onToggle={() => onToggle(t)} onRemove={() => onRemove(t)} />
            ))}
          </div>
        )}
    </div>
  );
}

function TimerRow({ timer, onEdit, onToggle, onRemove }: { timer: Timer; onEdit: () => void; onToggle: () => void; onRemove: () => void }) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const cadence = timer.triggerType === 'both'
    ? `${timer.intervalCount} min · ${timer.chatLineTrigger} lines`
    : timer.triggerType === 'timer' ? `every ${timer.intervalCount} min` : `every ${timer.chatLineTrigger} lines`;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8,
      background: 'var(--bg-elev)', border: '1px solid var(--border-soft)', opacity: timer.enabled ? 1 : 0.55, color: 'var(--text)'
    }}>
      <span className="toggle" data-on={timer.enabled ? 'true' : 'false'} onClick={onToggle} title={timer.enabled ? 'Disable' : 'Enable'} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{timer.message}</div>
        <div className="muted mono" style={{ fontSize: 10.5 }}>{cadence}</div>
      </div>
      <button className="btn btn-sm btn-icon" title="Edit" onClick={onEdit}><IconEdit size={12} /></button>
      <button className={`btn btn-sm btn-icon ${confirmDelete ? 'btn-danger' : ''}`} title={confirmDelete ? 'Click again to confirm' : 'Delete'}
              onClick={() => { if (confirmDelete) onRemove(); else setConfirmDelete(true); }}
              onMouseLeave={() => setConfirmDelete(false)}>
        <IconTrash size={12} />
      </button>
    </div>
  );
}

function TimerEditor({
  draft, busy, onChange, onSave, onCancel
}: { draft: Draft; busy: boolean; onChange: (d: Draft) => void; onSave: () => void; onCancel: () => void }) {
  const error = validateTimerInput(draftToInput(draft));
  const showInterval = draft.triggerType !== 'chat_lines';
  const showChat = draft.triggerType !== 'timer';
  const patch = (p: Partial<Draft>) => onChange({ ...draft, ...p });

  return (
    <div className="modal-backdrop" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 50
    }} onClick={onCancel}>
      <div className="card" style={{ width: 'min(520px, 92vw)', maxHeight: '86vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="card-head"><h3>{draft.id == null ? 'New timer' : 'Edit timer'}</h3></div>
        <div className="col" style={{ gap: 14 }}>
          <div>
            <label className="label-row">Trigger type</label>
            <div className="row" style={{ gap: 8 }}>
              {(['timer', 'chat_lines', 'both'] as const).map((tt) => (
                <button key={tt} className={`btn btn-sm ${draft.triggerType === tt ? 'btn-primary' : ''}`}
                        onClick={() => patch({ triggerType: tt })}>
                  {tt === 'timer' ? 'Timer' : tt === 'chat_lines' ? 'Chat lines' : 'Both'}
                </button>
              ))}
            </div>
          </div>

          {showInterval && (
            <div>
              <label className="label-row">Interval (minutes)</label>
              <input className="input mono" type="number" min={5} max={480} value={draft.intervalCount}
                     onChange={(e) => patch({ intervalCount: e.target.value })} />
            </div>
          )}
          {showChat && (
            <div>
              <label className="label-row">Every N chat lines</label>
              <input className="input mono" type="number" min={5} value={draft.chatLineTrigger}
                     onChange={(e) => patch({ chatLineTrigger: e.target.value })} />
            </div>
          )}

          <div>
            <label className="label-row">Message</label>
            <textarea className="input" rows={3} value={draft.message} placeholder="What the bot will post…"
                      onChange={(e) => patch({ message: e.target.value })} />
          </div>

          {error && <div style={{ fontSize: 12, color: 'var(--error)' }}>{error}</div>}

          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onCancel}>Cancel</button>
            <button className="btn btn-primary" disabled={!!error || busy} onClick={onSave}>
              {busy ? 'Saving…' : draft.id == null ? 'Create' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card" style={{ display: 'grid', placeItems: 'center', textAlign: 'center', padding: 40, minHeight: 220 }}>
      <div style={{ opacity: 0.5, marginBottom: 14 }}><IconTimers size={40} /></div>
      <h3 style={{ marginBottom: 6 }}>{title}</h3>
      {hint && <p className="dim" style={{ fontSize: 13, maxWidth: 420, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}
