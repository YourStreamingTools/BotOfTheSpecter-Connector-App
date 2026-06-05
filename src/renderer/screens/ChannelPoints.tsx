import React from 'react';
import { useChannelPoints } from '../state/useChannelPoints';
import { useRewardGroups } from '../state/useRewardGroups';
import type { ChannelReward, ChannelRewardCreate, ChannelRewardUpdate, RedemptionItem, RewardGroup } from '@shared/ipc';
import { IconPoints, IconRefresh, IconEdit, IconExternal, IconPlus, IconTrash, IconCopy } from '../icons';

const WEBSITE_REWARDS_URL = 'https://dashboard.botofthespecter.com/channel_rewards.php';

export function ScreenChannelPoints() {
  const snap = useChannelPoints();
  const groups = useRewardGroups();
  const [refreshing, setRefreshing] = React.useState(false);
  const [editing, setEditing] = React.useState<ChannelReward | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [groupEditor, setGroupEditor] = React.useState<RewardGroup | null | 'new'>(null);
  const [importDone, setImportDone] = React.useState<string | null>(null);

  const refresh = async () => {
    setRefreshing(true);
    try { await window.api.channelPoints.refresh(); } catch { /* surfaced via snap.state */ } finally { setRefreshing(false); }
  };

  const manageableCount = snap.rewards.filter((r) => r.manageable).length;

  return (
    <div className="screen">
      <div className="row" style={{ marginBottom: 14, gap: 10, alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Channel Points</h3>
        <span className="chip" style={{ marginLeft: 4 }}>{snap.rewards.length}</span>
        {snap.state === 'error' && <span className="chip warn" title={snap.error}>error</span>}
        <span className="dim" style={{ fontSize: 12, marginLeft: 'auto' }}>{manageableCount} managed by Specter</span>
        <button className="btn btn-sm" onClick={() => void refresh()} disabled={refreshing}>
          <IconRefresh size={11} />{refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
        <button className="btn btn-sm" onClick={() => setGroupEditor('new')}>
          <IconPlus size={12} />New Group
        </button>
        <button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}>
          <IconPlus size={12} />New Redemption
        </button>
      </div>

      {groups.length > 0 && (
        <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {groups.map((g) => <GroupChip key={g.id} group={g} onEdit={() => setGroupEditor(g)} />)}
        </div>
      )}

      {snap.state === 'idle' && <Empty title="No API key yet" hint="Add your BotOfTheSpecter API key in Settings to load your channel-point rewards." />}
      {snap.state === 'loading' && snap.rewards.length === 0 && <Empty title="Loading rewards…" />}
      {snap.state === 'error' && snap.rewards.length === 0 && <Empty title="Couldn’t load rewards" hint={snap.error ? `Error: ${snap.error}` : 'Channel points need an affiliate/partner channel and a valid Twitch token.'} />}
      {(snap.state === 'ok') && snap.rewards.length === 0 && <Empty title="No rewards yet" hint="Create channel-point rewards on Twitch or the BotOfTheSpecter website." />}

      {snap.rewards.length > 0 && (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, alignContent: 'start' }}>
          {snap.rewards.map((r) => <RewardCard key={r.id} reward={r} onEdit={() => setEditing(r)} onImported={setImportDone} />)}
        </div>
      )}

      {editing && <RewardEditor reward={editing} onClose={() => setEditing(null)} />}
      {creating && <RewardEditor reward={null} onClose={() => setCreating(false)} />}
      {groupEditor !== null && (
        <GroupEditor group={groupEditor === 'new' ? null : groupEditor} rewards={snap.rewards} onClose={() => setGroupEditor(null)} />
      )}
      {importDone && <ImportDoneModal original={importDone} onClose={() => setImportDone(null)} />}
    </div>
  );
}

function GroupChip({ group, onEdit }: { group: RewardGroup; onEdit: () => void }) {
  const setEnabled = (enabled: boolean) => void window.api.rewardGroups.setEnabled(group.id, enabled);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--bg-elev)', border: '1px solid var(--border-soft)' }}>
      <span style={{ fontSize: 12.5, fontWeight: 600 }}>{group.name}</span>
      <span className="dim mono" style={{ fontSize: 10.5 }}>{group.rewardIds.length}</span>
      <button className="btn btn-sm" title="Enable all in group" onClick={() => setEnabled(true)}>On</button>
      <button className="btn btn-sm" title="Disable all in group" onClick={() => setEnabled(false)}>Off</button>
      <button className="btn btn-sm btn-icon" title="Edit group" onClick={onEdit}><IconEdit size={11} /></button>
    </div>
  );
}

function GroupEditor({ group, rewards, onClose }: { group: RewardGroup | null; rewards: ChannelReward[]; onClose: () => void }) {
  const creating = group === null;
  const [name, setName] = React.useState(group?.name ?? '');
  const [selected, setSelected] = React.useState<Set<string>>(new Set(group?.rewardIds ?? []));
  const [busy, setBusy] = React.useState(false);
  const toggle = (id: string) => setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const save = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const input = { name: name.trim(), rewardIds: [...selected] };
    try {
      if (creating) await window.api.rewardGroups.create(input);
      else await window.api.rewardGroups.update(group.id, input);
      onClose();
    } finally { setBusy(false); }
  };

  const remove = async () => { if (group) { await window.api.rewardGroups.delete(group.id); onClose(); } };

  return (
    <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={onClose}>
      <div className="card" style={{ width: 'min(520px, 92vw)', maxHeight: '86vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="card-head"><h3>{creating ? 'New group' : 'Edit group'}</h3></div>
        <div className="col" style={{ gap: 14 }}>
          <div>
            <label className="label-row">Group name</label>
            <input className="input" value={name} placeholder="Group name" onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className="label-row">Rewards in this group</label>
            <div className="col" style={{ gap: 4, maxHeight: 280, overflowY: 'auto' }}>
              {rewards.length === 0 && <span className="dim" style={{ fontSize: 12 }}>No rewards loaded.</span>}
              {rewards.map((r) => (
                <label key={r.id} className="row" style={{ gap: 8, fontSize: 12.5, cursor: 'pointer', padding: '4px 2px' }}>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                  {!r.manageable && <span className="dim" style={{ fontSize: 10.5 }}>(not editable)</span>}
                </label>
              ))}
            </div>
            <div className="dim" style={{ fontSize: 11, marginTop: 6 }}>Toggling the group only affects Specter-managed rewards.</div>
          </div>
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            {!creating && <button className="btn btn-danger" style={{ marginRight: 'auto' }} onClick={() => void remove()}><IconTrash size={12} />Delete</button>}
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!name.trim() || busy} onClick={() => void save()}>{busy ? 'Saving…' : creating ? 'Create' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function RewardCard({ reward, onEdit, onImported }: { reward: ChannelReward; onEdit: () => void; onImported: (originalTitle: string) => void }) {
  const [showRedemptions, setShowRedemptions] = React.useState(false);
  const [importing, setImporting] = React.useState(false);
  const [importError, setImportError] = React.useState(false);
  const toggle = (patch: ChannelRewardUpdate) => void window.api.channelPoints.updateReward(reward.id, patch);

  const doImport = async () => {
    setImporting(true); setImportError(false);
    try {
      const ok = await window.api.channelPoints.importReward(reward.id);
      if (ok) onImported(reward.title); else setImportError(true);
    } catch { setImportError(true); } finally { setImporting(false); }
  };

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, opacity: reward.isEnabled ? 1 : 0.6 }}>
      <div className="row" style={{ gap: 10, alignItems: 'center' }}>
        <span style={{
          width: 36, height: 36, borderRadius: 8, flex: '0 0 36px', display: 'grid', placeItems: 'center',
          background: reward.backgroundColor || 'var(--bg-deep)', overflow: 'hidden'
        }}>
          {reward.imageUrl ? <img src={reward.imageUrl} alt="" width={36} height={36} /> : <IconPoints size={16} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{reward.title}</div>
          <div className="mono dim" style={{ fontSize: 11 }}>{reward.cost.toLocaleString()} pts</div>
        </div>
        {!reward.isEnabled && <span className="chip" title="Disabled">off</span>}
        {reward.isPaused && <span className="chip warn" title="Paused">paused</span>}
      </div>

      {reward.manageable ? (
        <>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <label className="row" style={{ gap: 6, fontSize: 12 }}>
              <span className="toggle" data-on={reward.isEnabled ? 'true' : 'false'} onClick={() => toggle({ isEnabled: !reward.isEnabled })} />
              Enabled
            </label>
            <label className="row" style={{ gap: 6, fontSize: 12 }}>
              <span className="toggle" data-on={reward.isPaused ? 'true' : 'false'} onClick={() => toggle({ isPaused: !reward.isPaused })} />
              Paused
            </label>
            <button className="btn btn-sm" style={{ marginLeft: 'auto' }} onClick={onEdit}><IconEdit size={11} />Edit</button>
          </div>
          <button className="btn btn-sm btn-ghost" onClick={() => setShowRedemptions((v) => !v)}>
            {showRedemptions ? 'Hide' : 'View'} pending redemptions
          </button>
          {showRedemptions && <RedemptionQueue rewardId={reward.id} />}
        </>
      ) : (
        <div className="col" style={{ gap: 6 }}>
          <button className="btn btn-sm btn-primary" disabled={importing} onClick={() => void doImport()} style={{ justifyContent: 'center' }}>
            <IconCopy size={11} />{importing ? 'Importing…' : 'Import to Specter'}
          </button>
          {importError && <div style={{ fontSize: 11, color: 'var(--error)', textAlign: 'center' }}>Import failed — a “Specter-…” copy may already exist.</div>}
          <a className="btn btn-sm btn-ghost" href={WEBSITE_REWARDS_URL} target="_blank" rel="noreferrer"
             style={{ textDecoration: 'none', justifyContent: 'center' }}>
            <IconExternal size={11} />Manage on the website
          </a>
        </div>
      )}
    </div>
  );
}

function RedemptionQueue({ rewardId }: { rewardId: string }) {
  const [items, setItems] = React.useState<RedemptionItem[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(() => {
    setLoading(true);
    let alive = true;
    void window.api.channelPoints.listRedemptions(rewardId)
      .then((r) => { if (alive) { setItems(r); setLoading(false); } })
      .catch(() => { if (alive) { setItems([]); setLoading(false); } });
    return () => { alive = false; };
  }, [rewardId]);

  React.useEffect(() => load(), [load]);

  const act = async (id: string, status: 'FULFILLED' | 'CANCELED') => {
    const ok = await window.api.channelPoints.setRedemption(rewardId, id, status).catch(() => false);
    if (ok) setItems((prev) => prev?.filter((r) => r.id !== id) ?? null); // drop the resolved one
  };

  if (loading && items === null) return <div className="dim" style={{ fontSize: 12, padding: '4px 2px' }}>Loading redemptions…</div>;
  if (!items || items.length === 0) return <div className="dim" style={{ fontSize: 12, padding: '4px 2px' }}>No pending redemptions.</div>;

  return (
    <div className="col" style={{ gap: 6 }}>
      {items.map((r) => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, background: 'var(--bg-elev)', border: '1px solid var(--border-soft)' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.userName}{r.userInput ? `: ${r.userInput}` : ''}</div>
          </div>
          <button className="btn btn-sm" title="Mark fulfilled" onClick={() => void act(r.id, 'FULFILLED')}>Fulfill</button>
          <button className="btn btn-sm btn-danger" title="Cancel and refund points" onClick={() => void act(r.id, 'CANCELED')}>Refund</button>
        </div>
      ))}
    </div>
  );
}

// reward === null → create mode (POST); otherwise edit mode (PATCH).
function RewardEditor({ reward, onClose }: { reward: ChannelReward | null; onClose: () => void }) {
  const creating = reward === null;
  const [title, setTitle] = React.useState(reward?.title ?? '');
  const [cost, setCost] = React.useState(String(reward?.cost ?? 100));
  const [prompt, setPrompt] = React.useState(reward?.prompt ?? '');
  const [userInput, setUserInput] = React.useState(reward?.isUserInputRequired ?? false);
  const [cdEnabled, setCdEnabled] = React.useState(reward?.globalCooldownEnabled ?? false);
  const [cdSeconds, setCdSeconds] = React.useState(String(reward?.globalCooldownSeconds || 60));
  const [maxEnabled, setMaxEnabled] = React.useState(reward?.maxPerStreamEnabled ?? false);
  const [maxPerStream, setMaxPerStream] = React.useState(String(reward?.maxPerStream || 1));
  const [busy, setBusy] = React.useState(false);

  const costNum = Number(cost);
  const error =
    !title.trim() || title.length > 45 ? 'Title must be 1–45 characters'
    : !Number.isInteger(costNum) || costNum < 1 ? 'Cost must be at least 1 point'
    : prompt.length > 200 ? 'Prompt is limited to 200 characters'
    : cdEnabled && Number(cdSeconds) < 1 ? 'Cooldown must be at least 1 second'
    : maxEnabled && Number(maxPerStream) < 1 ? 'Max per stream must be at least 1'
    : null;

  const save = async () => {
    if (error) return;
    setBusy(true);
    // create + update share the same field set (ChannelRewardUpdate ⊂ ChannelRewardCreate).
    const fields = {
      title: title.trim(), cost: costNum, prompt, isUserInputRequired: userInput,
      isGlobalCooldownEnabled: cdEnabled, globalCooldownSeconds: Number(cdSeconds),
      isMaxPerStreamEnabled: maxEnabled, maxPerStream: Number(maxPerStream)
    };
    try {
      if (creating) await window.api.channelPoints.createReward(fields as ChannelRewardCreate);
      else await window.api.channelPoints.updateReward(reward.id, fields as ChannelRewardUpdate);
      onClose();
    } finally { setBusy(false); }
  };

  return (
    <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={onClose}>
      <div className="card" style={{ width: 'min(520px, 92vw)', maxHeight: '86vh', overflowY: 'auto' }} onClick={(e) => e.stopPropagation()}>
        <div className="card-head"><h3>{creating ? 'New redemption' : 'Edit reward'}</h3></div>
        <div className="col" style={{ gap: 14 }}>
          <div>
            <label className="label-row">Title</label>
            <input className="input" value={title} maxLength={45} placeholder="Reward title" onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label-row">Cost (points)</label>
            <input className="input mono" type="number" min={1} value={cost} onChange={(e) => setCost(e.target.value)} />
          </div>
          <div>
            <label className="label-row">Prompt</label>
            <textarea className="input" rows={2} maxLength={200} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
          </div>
          <label className="row" style={{ gap: 8, fontSize: 12.5 }}>
            <span className="toggle" data-on={userInput ? 'true' : 'false'} onClick={() => setUserInput((v) => !v)} />
            Require viewer text input
          </label>
          <div>
            <label className="row" style={{ gap: 8, fontSize: 12.5 }}>
              <span className="toggle" data-on={cdEnabled ? 'true' : 'false'} onClick={() => setCdEnabled((v) => !v)} />
              Global cooldown
            </label>
            {cdEnabled && <input className="input mono" type="number" min={1} value={cdSeconds} style={{ marginTop: 6 }} onChange={(e) => setCdSeconds(e.target.value)} placeholder="seconds" />}
          </div>
          <div>
            <label className="row" style={{ gap: 8, fontSize: 12.5 }}>
              <span className="toggle" data-on={maxEnabled ? 'true' : 'false'} onClick={() => setMaxEnabled((v) => !v)} />
              Max redemptions per stream
            </label>
            {maxEnabled && <input className="input mono" type="number" min={1} value={maxPerStream} style={{ marginTop: 6 }} onChange={(e) => setMaxPerStream(e.target.value)} />}
          </div>
          {error && <div style={{ fontSize: 12, color: 'var(--error)' }}>{error}</div>}
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn" onClick={onClose}>Cancel</button>
            <button className="btn btn-primary" disabled={!!error || busy} onClick={() => void save()}>{busy ? 'Saving…' : creating ? 'Create' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Shown after a successful import: the new Specter-owned name plus the two manual Twitch steps.
function ImportDoneModal({ original, onClose }: { original: string; onClose: () => void }) {
  const copy = `Specter-${original}`.slice(0, 45);
  return (
    <div className="modal-backdrop" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={onClose}>
      <div className="card" style={{ width: 'min(460px, 92vw)' }} onClick={(e) => e.stopPropagation()}>
        <div className="card-head"><h3>Imported as “{copy}”</h3></div>
        <div className="col" style={{ gap: 12 }}>
          <p className="dim" style={{ fontSize: 13, lineHeight: 1.5, margin: 0 }}>
            “{copy}” is now managed by Specter and fully editable here. Two steps remain on Twitch:
          </p>
          <ol style={{ fontSize: 13, lineHeight: 1.6, margin: 0, paddingLeft: 18 }}>
            <li><strong>Delete the original</strong> “{original}” on Twitch — Specter can’t remove a reward it didn’t create.</li>
            <li><strong>Upload the reward image</strong> to the new reward on Twitch — the Twitch API can’t copy images.</li>
          </ol>
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="card" style={{ display: 'grid', placeItems: 'center', textAlign: 'center', padding: 40, minHeight: 220 }}>
      <div style={{ opacity: 0.5, marginBottom: 14 }}><IconPoints size={40} /></div>
      <h3 style={{ marginBottom: 6 }}>{title}</h3>
      {hint && <p className="dim" style={{ fontSize: 13, maxWidth: 420, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}
