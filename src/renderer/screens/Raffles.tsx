import React from 'react';
import { useRaffles } from '../state/useRaffles';
import { validateRaffleInput } from '@shared/raffles';
import type { Raffle, RaffleInput, RaffleEntry, RaffleFollowUnit } from '@shared/ipc';
import {
  IconGiveaway, IconGift, IconUsers, IconPlus, IconEdit, IconTrash, IconRefresh,
  IconPlay, IconStop, IconStar
} from '../icons';

type Draft = {
  id: number | null;
  name: string;
  prize: string;
  numberOfWinners: string;     // kept as string so the field can be cleared without NaN
  isWeighted: boolean;
  weightSubT1: string;
  weightSubT2: string;
  weightSubT3: string;
  weightVip: string;
  excludeMods: boolean;
  subscribersOnly: boolean;
  followersOnly: boolean;
  followersMinEnabled: boolean;
  followersMinValue: string;
  followersMinUnit: RaffleFollowUnit;
};

const NEW_DRAFT: Draft = {
  id: null, name: '', prize: '', numberOfWinners: '1', isWeighted: false,
  weightSubT1: '2', weightSubT2: '3', weightSubT3: '4', weightVip: '1.5',
  excludeMods: false, subscribersOnly: false, followersOnly: false,
  followersMinEnabled: false, followersMinValue: '0', followersMinUnit: 'days'
};

const draftFromRaffle = (r: Raffle): Draft => ({
  id: r.id,
  name: r.name,
  prize: r.prize,
  numberOfWinners: String(r.numberOfWinners),
  isWeighted: r.isWeighted,
  weightSubT1: String(r.weightSubT1 ?? 2),
  weightSubT2: String(r.weightSubT2 ?? 3),
  weightSubT3: String(r.weightSubT3 ?? 4),
  weightVip: String(r.weightVip ?? 1.5),
  excludeMods: r.excludeMods,
  subscribersOnly: r.subscribersOnly,
  followersOnly: r.followersOnly,
  followersMinEnabled: r.followersMinEnabled,
  followersMinValue: String(r.followersMinValue ?? 0),
  followersMinUnit: (['days', 'weeks', 'months', 'years'].includes(r.followersMinUnit) ? r.followersMinUnit : 'days') as RaffleFollowUnit
});

const draftToInput = (d: Draft): RaffleInput => ({
  name: d.name.trim(),
  prize: d.prize.trim(),
  numberOfWinners: Number(d.numberOfWinners),
  isWeighted: d.isWeighted,
  weightSubT1: Number(d.weightSubT1),
  weightSubT2: Number(d.weightSubT2),
  weightSubT3: Number(d.weightSubT3),
  weightVip: Number(d.weightVip),
  excludeMods: d.excludeMods,
  subscribersOnly: d.subscribersOnly,
  followersOnly: d.followersOnly,
  followersMinEnabled: d.followersOnly && d.followersMinEnabled,
  followersMinValue: Number(d.followersMinValue) || 0,
  followersMinUnit: d.followersMinUnit
});

export function ScreenRaffles() {
  const snap = useRaffles();
  const [editing, setEditing] = React.useState<Draft | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [refreshing, setRefreshing] = React.useState(false);
  const [openEntries, setOpenEntries] = React.useState<number | null>(null);
  const [entries, setEntries] = React.useState<RaffleEntry[]>([]);
  const [entriesLoading, setEntriesLoading] = React.useState(false);

  const refresh = async () => {
    setRefreshing(true);
    try { await window.api.raffles.refresh(); } catch { /* surfaced via snap.state */ } finally { setRefreshing(false); }
  };

  const save = async () => {
    if (!editing) return;
    const input = draftToInput(editing);
    setBusy(true);
    try {
      if (editing.id == null) await window.api.raffles.create(input);
      else await window.api.raffles.update(editing.id, input);
      setEditing(null);
    } finally {
      setBusy(false);
    }
  };

  const showEntries = async (r: Raffle) => {
    if (openEntries === r.id) { setOpenEntries(null); return; }
    setOpenEntries(r.id);
    setEntriesLoading(true);
    try {
      setEntries(await window.api.raffles.entries(r.id));
    } finally {
      setEntriesLoading(false);
    }
  };

  const start = (r: Raffle) => void window.api.raffles.start(r.id);
  const stop = (r: Raffle) => void window.api.raffles.stop(r.id);
  const draw = (r: Raffle) => void window.api.raffles.draw(r.id);
  const remove = (r: Raffle) => void window.api.raffles.delete(r.id);

  return (
    <div>
      <div className="row" style={{ marginBottom: 14, gap: 10, alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Giveaways</h3>
        <span className="chip" style={{ marginLeft: 4 }}>{snap.raffles.length}</span>
        {snap.state === 'error' && <span className="chip warn" title={snap.error}>error</span>}
        <span style={{ marginLeft: 'auto' }} />
        <button className="btn btn-sm" onClick={() => void refresh()} disabled={refreshing}>
          <IconRefresh size={11} />{refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button className="btn btn-sm btn-primary" onClick={() => setEditing({ ...NEW_DRAFT })}>
          <IconPlus size={12} />New giveaway
        </button>
      </div>

      {snap.state === 'idle' && (
        <Empty title="No API key yet" hint="Add your BotOfTheSpecter API key in Settings to run giveaways." />
      )}
      {snap.state === 'loading' && snap.raffles.length === 0 && <Empty title="Loading giveaways…" />}
      {(snap.state === 'ok' || snap.raffles.length > 0) && snap.raffles.length === 0 && (
        <Empty title="No giveaways yet" hint="Create a raffle, then start it so viewers can enter with !joinraffle." />
      )}

      {snap.raffles.length > 0 && (
        <div className="col" style={{ gap: 10 }}>
          {snap.raffles.map((r) => (
            <RaffleCard
              key={r.id} raffle={r}
              entriesOpen={openEntries === r.id} entries={entries} entriesLoading={entriesLoading}
              onEdit={() => setEditing(draftFromRaffle(r))}
              onStart={() => start(r)} onStop={() => stop(r)} onDraw={() => draw(r)}
              onDelete={() => remove(r)} onToggleEntries={() => void showEntries(r)}
            />
          ))}
        </div>
      )}

      {editing && (
        <RaffleEditor draft={editing} busy={busy} onChange={setEditing} onSave={() => void save()} onCancel={() => setEditing(null)} />
      )}
    </div>
  );
}

const STATUS_LABEL: Record<Raffle['status'], string> = {
  scheduled: 'scheduled', running: 'running', ended: 'ended'
};

function RaffleCard({
  raffle: r, entriesOpen, entries, entriesLoading,
  onEdit, onStart, onStop, onDraw, onDelete, onToggleEntries
}: {
  raffle: Raffle; entriesOpen: boolean; entries: RaffleEntry[]; entriesLoading: boolean;
  onEdit: () => void; onStart: () => void; onStop: () => void; onDraw: () => void;
  onDelete: () => void; onToggleEntries: () => void;
}) {
  const restrictions = [
    r.excludeMods && 'No mods',
    r.subscribersOnly && 'Subs only',
    r.followersOnly && (r.followersMinEnabled && r.followersMinValue > 0
      ? `Followers (${r.followersMinValue} ${r.followersMinUnit})` : 'Followers only')
  ].filter(Boolean) as string[];

  return (
    <div className="card" style={{ color: 'var(--text)' }}>
      <div className="row" style={{ alignItems: 'center', gap: 10 }}>
        <IconGiveaway size={16} />
        <div style={{ fontWeight: 600, fontSize: 14 }}>{r.name}</div>
        <span className="chip" title={`Status: ${r.status}`} style={{ color: r.status === 'running' ? 'var(--accent)' : 'var(--text-dim)' }}>
          {STATUS_LABEL[r.status]}
        </span>
        {r.isWeighted && <span className="chip">weighted</span>}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
          <IconUsers size={12} />{r.entryCount} entries
        </span>
      </div>

      <div className="row" style={{ gap: 14, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {r.prize && (
          <span className="dim" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <IconGift size={12} />{r.prize}
          </span>
        )}
        <span className="dim" style={{ fontSize: 12 }}>{r.numberOfWinners} winner{r.numberOfWinners === 1 ? '' : 's'}</span>
        {restrictions.map((x) => <span key={x} className="chip">{x}</span>)}
      </div>

      {r.winners.length > 0 && (
        <div className="row" style={{ gap: 6, marginTop: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <IconStar size={12} />
          <span style={{ fontSize: 12 }}>{r.winners.join(', ')}</span>
        </div>
      )}

      <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
        {r.status === 'scheduled' && (
          <>
            <button className="btn btn-sm btn-primary" onClick={onStart}><IconPlay size={12} />Start</button>
            <button className="btn btn-sm" onClick={onEdit}><IconEdit size={12} />Edit</button>
          </>
        )}
        {r.status === 'running' && (
          <>
            <ConfirmButton label="Draw winners" icon={IconStar} danger onConfirm={onDraw} disabled={r.entryCount === 0} />
            <ConfirmButton label="Stop" icon={IconStop} onConfirm={onStop} />
          </>
        )}
        {(r.status === 'running' || r.status === 'ended') && (
          <button className="btn btn-sm" onClick={onToggleEntries}><IconUsers size={12} />Entries</button>
        )}
        <ConfirmButton label="Delete" icon={IconTrash} danger onConfirm={onDelete} />
      </div>

      {entriesOpen && (
        <div style={{ marginTop: 10, borderTop: '1px solid var(--border-soft)', paddingTop: 10 }}>
          {entriesLoading
            ? <span className="dim" style={{ fontSize: 12 }}>Loading entries…</span>
            : entries.length === 0
              ? <span className="dim" style={{ fontSize: 12 }}>No entries yet.</span>
              : (
                <div className="col" style={{ gap: 4 }}>
                  {entries.map((e) => (
                    <div key={e.id} className="row" style={{ gap: 8, fontSize: 12, alignItems: 'center' }}>
                      <span>{e.username ?? '(unknown)'}</span>
                      {e.weight !== 100 && <span className="muted mono" style={{ fontSize: 10.5 }}>×{(e.weight / 100).toFixed(2)}</span>}
                    </div>
                  ))}
                </div>
              )}
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

function RaffleEditor({
  draft, busy, onChange, onSave, onCancel
}: { draft: Draft; busy: boolean; onChange: (d: Draft) => void; onSave: () => void; onCancel: () => void }) {
  const error = validateRaffleInput(draftToInput(draft));
  const patch = (p: Partial<Draft>) => onChange({ ...draft, ...p });
  const Check = ({ checked, onChange: onCheck, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
    <label className="row" style={{ gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 13 }}>
      <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} />
      {label}
    </label>
  );

  return (
    <div className="modal-backdrop" style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 50
    }} onClick={onCancel}>
      <div className="card" style={{ width: 'min(560px, 92vw)', maxHeight: '86vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="card-head"><h3>{draft.id == null ? 'New giveaway' : 'Edit giveaway'}</h3></div>
        <div className="col" style={{ gap: 14 }}>
          <div>
            <label className="label-row">Name</label>
            <input className="input" value={draft.name} placeholder="Giveaway name"
                   onChange={(e) => patch({ name: e.target.value })} />
          </div>
          <div>
            <label className="label-row">Prize</label>
            <textarea className="input" rows={2} value={draft.prize} placeholder="What are they winning?"
                      onChange={(e) => patch({ prize: e.target.value })} />
          </div>
          <div>
            <label className="label-row">Number of winners</label>
            <input className="input mono" type="number" min={1} value={draft.numberOfWinners}
                   onChange={(e) => patch({ numberOfWinners: e.target.value })} style={{ maxWidth: 120 }} />
          </div>

          <div className="col" style={{ gap: 8 }}>
            <Check checked={draft.isWeighted} onChange={(v) => patch({ isWeighted: v })} label="Weighted (subs & VIPs get better odds)" />
            {draft.isWeighted && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingLeft: 6 }}>
                <WeightField label="Tier 1 sub" value={draft.weightSubT1} onChange={(v) => patch({ weightSubT1: v })} />
                <WeightField label="Tier 2 sub" value={draft.weightSubT2} onChange={(v) => patch({ weightSubT2: v })} />
                <WeightField label="Tier 3 sub" value={draft.weightSubT3} onChange={(v) => patch({ weightSubT3: v })} />
                <WeightField label="VIP" value={draft.weightVip} onChange={(v) => patch({ weightVip: v })} />
              </div>
            )}
          </div>

          <div className="col" style={{ gap: 8 }}>
            <Check checked={draft.excludeMods} onChange={(v) => patch({ excludeMods: v })} label="Exclude moderators" />
            <Check checked={draft.subscribersOnly} onChange={(v) => patch({ subscribersOnly: v })} label="Subscribers only" />
            <Check checked={draft.followersOnly} onChange={(v) => patch({ followersOnly: v })} label="Followers only" />
            {draft.followersOnly && (
              <div style={{ paddingLeft: 6 }} className="col">
                <Check checked={draft.followersMinEnabled} onChange={(v) => patch({ followersMinEnabled: v })} label="Require a minimum follow time" />
                {draft.followersMinEnabled && (
                  <div className="row" style={{ gap: 8, alignItems: 'center', marginTop: 6 }}>
                    <input className="input mono" type="number" min={0} value={draft.followersMinValue}
                           onChange={(e) => patch({ followersMinValue: e.target.value })} style={{ maxWidth: 100 }} />
                    <select className="input" value={draft.followersMinUnit}
                            onChange={(e) => patch({ followersMinUnit: e.target.value as RaffleFollowUnit })} style={{ maxWidth: 140 }}>
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                      <option value="years">Years</option>
                    </select>
                  </div>
                )}
              </div>
            )}
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

function WeightField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="label-row" style={{ fontSize: 11 }}>{label}</label>
      <input className="input mono" type="number" min={1} step={0.01} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card" style={{ display: 'grid', placeItems: 'center', textAlign: 'center', padding: 40, minHeight: 220 }}>
      <div style={{ opacity: 0.5, marginBottom: 14 }}><IconGiveaway size={40} /></div>
      <h3 style={{ marginBottom: 6 }}>{title}</h3>
      {hint && <p className="dim" style={{ fontSize: 13, maxWidth: 420, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}
