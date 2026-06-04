import React from 'react';
import { usePolls } from '../state/usePolls';
import { validatePollInput } from '@shared/polls';
import type { Poll, PollInput, PollEndStatus } from '@shared/ipc';
import { IconBolt, IconPlus, IconRefresh, IconStop, IconTrash, IconClose, IconClock } from '../icons';

type PollDraft = {
  title: string;
  choices: string[];
  duration: string;             // seconds, kept as string so the field can be cleared
  channelPointsVotingEnabled: boolean;
  channelPointsPerVote: string;
};

const NEW_POLL: PollDraft = {
  title: '', choices: ['', ''], duration: '120',
  channelPointsVotingEnabled: false, channelPointsPerVote: '100'
};

const DURATION_PRESETS = [30, 60, 120, 300, 600];

const draftToInput = (d: PollDraft): PollInput => ({
  title: d.title.trim(),
  choices: d.choices.map((c) => c.trim()).filter((c) => c.length > 0),
  duration: Number(d.duration),
  channelPointsVotingEnabled: d.channelPointsVotingEnabled,
  channelPointsPerVote: Number(d.channelPointsPerVote) || 0
});

export function ScreenPolls() {
  const snap = usePolls();
  const [creating, setCreating] = React.useState<PollDraft | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const activePoll = snap.polls.find((p) => p.status === 'ACTIVE') ?? null;
  const hasActive = activePoll !== null;
  const pastPolls = snap.polls.filter((p) => p.status !== 'ACTIVE');

  // Polls have no live event feed, so re-fetch on an interval while one is running.
  React.useEffect(() => {
    if (!hasActive) return;
    const t = setInterval(() => { void window.api.polls.refresh(); }, 5000);
    return () => clearInterval(t);
  }, [hasActive]);

  const refresh = async () => {
    setRefreshing(true);
    try { await window.api.polls.refresh(); } catch { /* surfaced via snap.state */ } finally { setRefreshing(false); }
  };

  const create = async () => {
    if (!creating) return;
    setBusy(true);
    try {
      const ok = await window.api.polls.create(draftToInput(creating));
      if (ok) setCreating(null);
    } finally {
      setBusy(false);
    }
  };

  const end = (p: Poll, status: PollEndStatus) => void window.api.polls.end(p.id, status);

  return (
    <div>
      <div className="row" style={{ marginBottom: 14, gap: 10, alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Polls</h3>
        {snap.state === 'error' && <span className="chip warn" title={snap.error}>error</span>}
        <span style={{ marginLeft: 'auto' }} />
        <button className="btn btn-sm" onClick={() => void refresh()} disabled={refreshing}>
          <IconRefresh size={11} />{refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button className="btn btn-sm btn-primary" onClick={() => setCreating({ ...NEW_POLL, choices: ['', ''] })}
                disabled={hasActive} title={hasActive ? 'A poll is already running — only one at a time' : 'Start a new poll'}>
          <IconPlus size={12} />New poll
        </button>
      </div>

      {snap.state === 'idle' && (
        <Empty title="No API key yet" hint="Add your BotOfTheSpecter API key in Settings to run Twitch polls." />
      )}
      {snap.state === 'loading' && snap.polls.length === 0 && <Empty title="Loading polls…" />}
      {(snap.state === 'ok' || snap.polls.length > 0) && snap.polls.length === 0 && (
        <Empty title="No polls yet" hint="Start a poll and viewers vote right in chat. Only one poll runs at a time." />
      )}

      {snap.polls.length > 0 && (
        <div className="col" style={{ gap: 12 }}>
          {activePoll && <PollCard poll={activePoll} live onEnd={end} />}
          {pastPolls.length > 0 && (
            <>
              {activePoll && <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>Recent polls</div>}
              {pastPolls.map((p) => <PollCard key={p.id} poll={p} live={false} onEnd={end} />)}
            </>
          )}
        </div>
      )}

      {creating && (
        <PollEditor draft={creating} busy={busy} onChange={setCreating} onCreate={() => void create()} onCancel={() => setCreating(null)} />
      )}
    </div>
  );
}

const STATUS_TONE: Record<Poll['status'], string> = {
  ACTIVE: 'var(--accent)', COMPLETED: 'var(--text-dim)', TERMINATED: 'var(--text-dim)',
  ARCHIVED: 'var(--text-dim)', MODERATED: 'var(--text-dim)', INVALID: 'var(--text-dim)'
};

function PollCard({ poll, live, onEnd }: { poll: Poll; live: boolean; onEnd: (p: Poll, s: PollEndStatus) => void }) {
  const total = poll.choices.reduce((sum, c) => sum + c.votes, 0);
  const leader = poll.choices.reduce((m, c) => Math.max(m, c.votes), 0);
  return (
    <div className="card" style={{ color: 'var(--text)' }}>
      <div className="row" style={{ alignItems: 'center', gap: 10 }}>
        <IconBolt size={16} />
        <div style={{ fontWeight: 600, fontSize: 14 }}>{poll.title}</div>
        <span className="chip" style={{ color: STATUS_TONE[poll.status] }}>{poll.status}</span>
        {poll.channelPointsVotingEnabled && <span className="chip">+{poll.channelPointsPerVote} pts/vote</span>}
        <span style={{ marginLeft: 'auto', fontSize: 12 }} className="dim">{total} vote{total === 1 ? '' : 's'}</span>
      </div>

      <div className="col" style={{ gap: 8, marginTop: 10 }}>
        {poll.choices.map((c) => {
          const pct = total > 0 ? Math.round((c.votes / total) * 100) : 0;
          const winning = c.votes === leader && leader > 0;
          const pointsNote = poll.channelPointsVotingEnabled && c.channelPointsVotes > 0 ? ` · ${c.channelPointsVotes} via points` : '';
          return (
            <div key={c.id}>
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, marginBottom: 3 }}>
                <span style={{ fontWeight: winning ? 600 : 400 }}>{c.title}</span>
                <span className="dim">{c.votes} votes{pointsNote} · {pct}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-elev)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: winning ? 'var(--accent)' : 'var(--border-strong, #888)' }} />
              </div>
            </div>
          );
        })}
      </div>

      {live && poll.status === 'ACTIVE' && (
        <div className="row" style={{ gap: 8, marginTop: 12 }}>
          <ConfirmButton label="End poll" icon={IconStop} danger onConfirm={() => onEnd(poll, 'TERMINATED')} />
          <ConfirmButton label="End & hide" icon={IconTrash} danger onConfirm={() => onEnd(poll, 'ARCHIVED')} />
        </div>
      )}
    </div>
  );
}

function ConfirmButton({
  label, icon: Icon, danger, disabled, onConfirm
}: { label: string; icon: React.ComponentType<{ size?: number }>; danger?: boolean; disabled?: boolean; onConfirm: () => void }) {
  const [armed, setArmed] = React.useState(false);
  return (
    <button
      className={`btn btn-sm ${armed ? (danger ? 'btn-danger' : 'btn-primary') : ''}`}
      disabled={disabled}
      title={armed ? 'Click again to confirm' : label}
      onClick={() => { if (armed) { setArmed(false); onConfirm(); } else setArmed(true); }}
      onMouseLeave={() => setArmed(false)}
    >
      <Icon size={12} />{armed ? 'Confirm' : label}
    </button>
  );
}

function PollEditor({
  draft, busy, onChange, onCreate, onCancel
}: { draft: PollDraft; busy: boolean; onChange: (d: PollDraft) => void; onCreate: () => void; onCancel: () => void }) {
  const error = validatePollInput(draftToInput(draft));
  const patch = (p: Partial<PollDraft>) => onChange({ ...draft, ...p });
  const setChoice = (i: number, v: string) => { const next = [...draft.choices]; next[i] = v; patch({ choices: next }); };
  const addChoice = () => { if (draft.choices.length < 5) patch({ choices: [...draft.choices, ''] }); };
  const removeChoice = (i: number) => { if (draft.choices.length > 2) patch({ choices: draft.choices.filter((_, idx) => idx !== i) }); };

  return (
    <div className="modal-backdrop" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 50
    }} onClick={onCancel}>
      <div className="card" style={{ width: 'min(560px, 92vw)', maxHeight: '86vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="card-head"><h3>New poll</h3></div>
        <div className="col" style={{ gap: 14 }}>
          <div>
            <label className="label-row">Question</label>
            <input className="input" value={draft.title} placeholder="Poll question" maxLength={60}
                   onChange={(e) => patch({ title: e.target.value })} />
          </div>

          <div>
            <label className="label-row">Choices (2–5)</label>
            <div className="col" style={{ gap: 6 }}>
              {draft.choices.map((c, i) => (
                <div key={i} className="row" style={{ gap: 6, alignItems: 'center' }}>
                  <input className="input" value={c} placeholder={`Choice ${i + 1}`} maxLength={25}
                         onChange={(e) => setChoice(i, e.target.value)} />
                  {draft.choices.length > 2 && (
                    <button className="btn btn-sm btn-icon" title="Remove choice" onClick={() => removeChoice(i)}><IconClose size={12} /></button>
                  )}
                </div>
              ))}
            </div>
            {draft.choices.length < 5 && (
              <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={addChoice}><IconPlus size={11} />Add choice</button>
            )}
          </div>

          <div>
            <label className="label-row"><IconClock size={11} /> Duration (seconds)</label>
            <input className="input mono" type="number" min={15} max={1800} value={draft.duration}
                   onChange={(e) => patch({ duration: e.target.value })} style={{ maxWidth: 140 }} />
            <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {DURATION_PRESETS.map((s) => (
                <button key={s} className={`btn btn-sm ${Number(draft.duration) === s ? 'btn-primary' : ''}`}
                        onClick={() => patch({ duration: String(s) })}>{s >= 60 ? `${s / 60}m` : `${s}s`}</button>
              ))}
            </div>
          </div>

          <div className="col" style={{ gap: 8 }}>
            <label className="row" style={{ gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
              <input type="checkbox" checked={draft.channelPointsVotingEnabled}
                     onChange={(e) => patch({ channelPointsVotingEnabled: e.target.checked })} />
              Let viewers buy extra votes with Channel Points
            </label>
            {draft.channelPointsVotingEnabled && (
              <div style={{ paddingLeft: 6 }}>
                <label className="label-row">Channel Points per extra vote</label>
                <input className="input mono" type="number" min={1} max={1000000} value={draft.channelPointsPerVote}
                       onChange={(e) => patch({ channelPointsPerVote: e.target.value })} style={{ maxWidth: 160 }} />
              </div>
            )}
          </div>

          {error && <div style={{ fontSize: 12, color: 'var(--error)' }}>{error}</div>}

          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onCancel}>Cancel</button>
            <button className="btn btn-primary" disabled={!!error || busy} onClick={onCreate}>
              {busy ? 'Starting…' : 'Create'}
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
      <div style={{ opacity: 0.5, marginBottom: 14 }}><IconBolt size={40} /></div>
      <h3 style={{ marginBottom: 6 }}>{title}</h3>
      {hint && <p className="dim" style={{ fontSize: 13, maxWidth: 420, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}
