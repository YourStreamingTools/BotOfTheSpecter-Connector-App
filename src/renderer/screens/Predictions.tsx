import React from 'react';
import { usePredictions } from '../state/usePredictions';
import { validatePredictionInput } from '@shared/predictions';
import type { Prediction, PredictionInput, PredictionEndStatus } from '@shared/ipc';
import { IconStar, IconPlus, IconRefresh, IconPause, IconBan, IconClose, IconClock, IconDot } from '../icons';

type PredDraft = {
  title: string;
  outcomes: string[];
  window: string;             // seconds, kept as string so the field can be cleared
};

const NEW_PRED: PredDraft = { title: '', outcomes: ['', ''], window: '120' };
const WINDOW_PRESETS = [60, 120, 300, 600];

const draftToInput = (d: PredDraft): PredictionInput => ({
  title: d.title.trim(),
  outcomes: d.outcomes.map((o) => o.trim()).filter((o) => o.length > 0),
  predictionWindow: Number(d.window)
});

const outcomeColor = (color: string): string => (color === 'PINK' ? '#f550c8' : '#387aff');

export function ScreenPredictions() {
  const snap = usePredictions();
  const [creating, setCreating] = React.useState<PredDraft | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);

  const openPrediction = snap.predictions.find((p) => p.status === 'ACTIVE' || p.status === 'LOCKED') ?? null;
  const hasOpen = openPrediction !== null;
  const pastPredictions = snap.predictions.filter((p) => p.status !== 'ACTIVE' && p.status !== 'LOCKED');

  // Predictions have no live event feed, so re-fetch on an interval while one is open.
  React.useEffect(() => {
    if (!hasOpen) return;
    const t = setInterval(() => { void window.api.predictions.refresh(); }, 5000);
    return () => clearInterval(t);
  }, [hasOpen]);

  const refresh = async () => {
    setRefreshing(true);
    try { await window.api.predictions.refresh(); } catch { /* surfaced via snap.state */ } finally { setRefreshing(false); }
  };

  const create = async () => {
    if (!creating) return;
    setBusy(true);
    try {
      const ok = await window.api.predictions.create(draftToInput(creating));
      if (ok) setCreating(null);
    } finally {
      setBusy(false);
    }
  };

  const lockOrCancel = (p: Prediction, status: Extract<PredictionEndStatus, 'LOCKED' | 'CANCELED'>) =>
    void window.api.predictions.end(p.id, status);
  const resolve = (p: Prediction, winningOutcomeId: string) =>
    void window.api.predictions.end(p.id, 'RESOLVED', winningOutcomeId);

  return (
    <div>
      <div className="row" style={{ marginBottom: 14, gap: 10, alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Predictions</h3>
        {snap.state === 'error' && <span className="chip warn" title={snap.error}>error</span>}
        <span style={{ marginLeft: 'auto' }} />
        <button className="btn btn-sm" onClick={() => void refresh()} disabled={refreshing}>
          <IconRefresh size={11} />{refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button className="btn btn-sm btn-primary" onClick={() => setCreating({ ...NEW_PRED, outcomes: ['', ''] })}
                disabled={hasOpen} title={hasOpen ? 'A prediction is already running — only one at a time' : 'Start a new prediction'}>
          <IconPlus size={12} />New prediction
        </button>
      </div>

      {snap.state === 'idle' && (
        <Empty title="No API key yet" hint="Add your BotOfTheSpecter API key in Settings to run Channel Points predictions." />
      )}
      {snap.state === 'error' && (
        <Empty title="Can’t load predictions" hint={snap.error ?? 'Something went wrong.'} />
      )}
      {snap.state === 'loading' && snap.predictions.length === 0 && <Empty title="Loading predictions…" />}
      {snap.state === 'ok' && snap.predictions.length === 0 && (
        <Empty title="No predictions yet" hint="Start a prediction and viewers stake Channel Points on an outcome. Only one runs at a time." />
      )}

      {snap.predictions.length > 0 && (
        <div className="col" style={{ gap: 12 }}>
          {openPrediction && <PredictionCard prediction={openPrediction} onLockOrCancel={lockOrCancel} onResolve={resolve} />}
          {pastPredictions.length > 0 && (
            <>
              {openPrediction && <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>Recent predictions</div>}
              {pastPredictions.map((p) => <PredictionCard key={p.id} prediction={p} onLockOrCancel={lockOrCancel} onResolve={resolve} />)}
            </>
          )}
        </div>
      )}

      {creating && (
        <PredictionEditor draft={creating} busy={busy} onChange={setCreating} onCreate={() => void create()} onCancel={() => setCreating(null)} />
      )}
    </div>
  );
}

const STATUS_TONE: Record<Prediction['status'], string> = {
  ACTIVE: 'var(--accent)', LOCKED: 'var(--text)', RESOLVED: 'var(--text-dim)', CANCELED: 'var(--text-dim)'
};

function PredictionCard({
  prediction: p, onLockOrCancel, onResolve
}: {
  prediction: Prediction;
  onLockOrCancel: (p: Prediction, status: 'LOCKED' | 'CANCELED') => void;
  onResolve: (p: Prediction, winningOutcomeId: string) => void;
}) {
  const [winnerId, setWinnerId] = React.useState('');
  const totalPoints = p.outcomes.reduce((sum, o) => sum + o.channelPoints, 0);
  const totalUsers = p.outcomes.reduce((sum, o) => sum + o.users, 0);
  const open = p.status === 'ACTIVE' || p.status === 'LOCKED';

  return (
    <div className="card" style={{ color: 'var(--text)' }}>
      <div className="row" style={{ alignItems: 'center', gap: 10 }}>
        <IconStar size={16} />
        <div style={{ fontWeight: 600, fontSize: 14 }}>{p.title}</div>
        <span className="chip" style={{ color: STATUS_TONE[p.status] }}>{p.status}</span>
        <span style={{ marginLeft: 'auto', fontSize: 12 }} className="dim">
          {totalPoints.toLocaleString()} pts · {totalUsers} player{totalUsers === 1 ? '' : 's'}
        </span>
      </div>

      <div className="col" style={{ gap: 8, marginTop: 10 }}>
        {p.outcomes.map((o) => {
          const pct = totalPoints > 0 ? Math.round((o.channelPoints / totalPoints) * 100) : 0;
          const won = p.status === 'RESOLVED' && p.winningOutcomeId === o.id;
          return (
            <div key={o.id}>
              <div className="row" style={{ justifyContent: 'space-between', fontSize: 13, marginBottom: 3, alignItems: 'center' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: won ? 700 : 400 }}>
                  <span style={{ color: outcomeColor(o.color), display: 'inline-flex' }}><IconDot size={12} /></span>
                  {o.title}{won ? ' — winner' : ''}
                </span>
                <span className="dim">{o.channelPoints.toLocaleString()} pts · {o.users} · {pct}%</span>
              </div>
              <div style={{ height: 8, borderRadius: 4, background: 'var(--bg-elev)', overflow: 'hidden' }}>
                <div style={{ width: `${pct}%`, height: '100%', background: outcomeColor(o.color), opacity: won || p.status !== 'RESOLVED' ? 1 : 0.4 }} />
              </div>
            </div>
          );
        })}
      </div>

      {open && (
        <div className="row" style={{ gap: 8, marginTop: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          {p.status === 'ACTIVE' && (
            <ConfirmButton label="Lock" icon={IconPause} onConfirm={() => onLockOrCancel(p, 'LOCKED')} />
          )}
          <ConfirmButton label="Cancel" icon={IconBan} danger onConfirm={() => onLockOrCancel(p, 'CANCELED')} />
          <span style={{ marginLeft: 'auto' }} />
          <select className="input" value={winnerId} onChange={(e) => setWinnerId(e.target.value)} style={{ maxWidth: 180 }}>
            <option value="">Winner…</option>
            {p.outcomes.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
          </select>
          <ConfirmButton label="Resolve" icon={IconStar} disabled={!winnerId} onConfirm={() => onResolve(p, winnerId)} />
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

function PredictionEditor({
  draft, busy, onChange, onCreate, onCancel
}: { draft: PredDraft; busy: boolean; onChange: (d: PredDraft) => void; onCreate: () => void; onCancel: () => void }) {
  const error = validatePredictionInput(draftToInput(draft));
  const patch = (p: Partial<PredDraft>) => onChange({ ...draft, ...p });
  const setOutcome = (i: number, v: string) => { const next = [...draft.outcomes]; next[i] = v; patch({ outcomes: next }); };
  const addOutcome = () => { if (draft.outcomes.length < 10) patch({ outcomes: [...draft.outcomes, ''] }); };
  const removeOutcome = (i: number) => { if (draft.outcomes.length > 2) patch({ outcomes: draft.outcomes.filter((_, idx) => idx !== i) }); };

  return (
    <div className="modal-backdrop" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 50
    }} onClick={onCancel}>
      <div className="card" style={{ width: 'min(560px, 92vw)', maxHeight: '86vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="card-head"><h3>New prediction</h3></div>
        <div className="col" style={{ gap: 14 }}>
          <div>
            <label className="label-row">Question</label>
            <input className="input" value={draft.title} placeholder="Prediction question" maxLength={45}
                   onChange={(e) => patch({ title: e.target.value })} />
          </div>

          <div>
            <label className="label-row">Outcomes (2–10)</label>
            <div className="col" style={{ gap: 6 }}>
              {draft.outcomes.map((o, i) => (
                <div key={i} className="row" style={{ gap: 6, alignItems: 'center' }}>
                  <input className="input" value={o} placeholder={`Outcome ${i + 1}`} maxLength={25}
                         onChange={(e) => setOutcome(i, e.target.value)} />
                  {draft.outcomes.length > 2 && (
                    <button className="btn btn-sm btn-icon" title="Remove outcome" onClick={() => removeOutcome(i)}><IconClose size={12} /></button>
                  )}
                </div>
              ))}
            </div>
            {draft.outcomes.length < 10 && (
              <button className="btn btn-sm" style={{ marginTop: 6 }} onClick={addOutcome}><IconPlus size={11} />Add outcome</button>
            )}
          </div>

          <div>
            <label className="label-row"><IconClock size={11} /> Prediction window (seconds)</label>
            <input className="input mono" type="number" min={30} max={1800} value={draft.window}
                   onChange={(e) => patch({ window: e.target.value })} style={{ maxWidth: 140 }} />
            <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              {WINDOW_PRESETS.map((s) => (
                <button key={s} className={`btn btn-sm ${Number(draft.window) === s ? 'btn-primary' : ''}`}
                        onClick={() => patch({ window: String(s) })}>{s >= 60 ? `${s / 60}m` : `${s}s`}</button>
              ))}
            </div>
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
      <div style={{ opacity: 0.5, marginBottom: 14 }}><IconStar size={40} /></div>
      <h3 style={{ marginBottom: 6 }}>{title}</h3>
      {hint && <p className="dim" style={{ fontSize: 13, maxWidth: 460, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}
