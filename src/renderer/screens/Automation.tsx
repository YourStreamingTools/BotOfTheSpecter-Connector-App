import React from 'react';
import { useAutomations } from '../state/useAutomations';
import { useActions } from '../state/useActions';
import type {
  Action,
  ActionMode,
  ActionRef,
  ActionType,
  Automation,
  AutomationActions,
  AutomationInput,
  Check,
  ChecksGate,
  CheckOperator,
  DataCheck,
  Folder,
  FolderInput,
  IfElseBlock,
  ReorderDirection,
  SwitchCaseBlock,
  Trigger,
  TriggerType,
  VariableCheck
} from '@shared/ipc';
import {
  IconChevronRight,
  IconPlus,
  IconTrash,
  IconPlay,
  IconBox
} from '../icons';

// ============================================================================
// ScreenAutomation — Streamer.bot-style folder tree + automation cards.
// The whole screen lives in this file. It's long; the small inline helper
// components below carry their own responsibilities and aren't reused outside
// the Automation surface so there's no win to extracting them.
// ============================================================================

// ---------- labels & defaults ----------

const TRIGGER_LABEL: Record<TriggerType, string> = {
  chat_message: 'Chat Message',
  follow: 'Follow',
  sub: 'Subscription',
  bits: 'Bits',
  raid: 'Raid',
  channel_point_redemption: 'Channel Point Redemption',
  stream_go_live: 'Stream Goes Live',
  stream_end: 'Stream Ends',
  obs_scene_switch: 'OBS Scene Switch',
  obs_stream_start_stop: 'OBS Stream Start/Stop',
  manual_fire: 'Manual Fire',
  public_api_webhook: 'Public API Webhook'
};

const TRIGGER_TYPES: TriggerType[] = [
  'chat_message',
  'follow',
  'sub',
  'bits',
  'raid',
  'channel_point_redemption',
  'stream_go_live',
  'stream_end',
  'obs_scene_switch',
  'obs_stream_start_stop',
  'manual_fire',
  'public_api_webhook'
];

const OPERATOR_LABEL: Record<CheckOperator, string> = {
  eq: '=',
  ne: '≠',
  gt: '>',
  lt: '<',
  contains: 'contains',
  regex: 'regex'
};

const OPERATORS: CheckOperator[] = ['eq', 'ne', 'gt', 'lt', 'contains', 'regex'];

const MODE_LABEL: Record<ActionMode, string> = {
  standard: 'Standard',
  random: 'Random',
  toggle: 'Toggle',
  sequence: 'Sequence',
  if_else: 'If/Else',
  switch_case: 'Switch/Case'
};

const MODES: ActionMode[] = ['standard', 'random', 'toggle', 'sequence', 'if_else', 'switch_case'];

const TWITCH_ACTION_TYPES: ReadonlySet<ActionType> = new Set<ActionType>([
  'toggle_redemption',
  'run_ads',
  'create_marker',
  'start_end_poll',
  'start_cancel_prediction',
  'toggle_slow_mode',
  'create_clip'
]);

function defaultTriggerFor(t: TriggerType): Trigger {
  switch (t) {
    case 'chat_message':             return { type: t, config: {} };
    case 'follow':                   return { type: t, config: {} };
    case 'sub':                      return { type: t, config: {} };
    case 'bits':                     return { type: t, config: {} };
    case 'raid':                     return { type: t, config: {} };
    case 'channel_point_redemption': return { type: t, config: {} };
    case 'stream_go_live':           return { type: t, config: {} };
    case 'stream_end':               return { type: t, config: {} };
    case 'obs_scene_switch':         return { type: t, config: {} };
    case 'obs_stream_start_stop':    return { type: t, config: {} };
    case 'manual_fire':              return { type: t, config: {} };
    case 'public_api_webhook':       return { type: t, config: {} };
  }
}

function defaultActionsBlock(): AutomationActions {
  return { mode: 'standard', refs: [] };
}

function defaultIfElse(): IfElseBlock {
  return { inlineCheck: { variable: '', operator: 'eq', value: '' }, thenActions: [], elseActions: [] };
}

function defaultSwitchCase(): SwitchCaseBlock {
  return {
    source: { kind: 'trigger_field', path: '' },
    cases: [],
    defaultActions: []
  };
}

// ---------- screen ----------

export function ScreenAutomation() {
  const {
    folders,
    automations,
    createFolder,
    updateFolder,
    deleteFolder,
    reorderFolder,
    createAutomation,
    updateAutomation,
    deleteAutomation,
    reorderAutomation,
    testFire
  } = useAutomations();
  const { actions } = useActions();

  // Track which folders + automation cards are expanded. Sets keyed by id.
  const [expandedFolders, setExpandedFolders] = React.useState<Set<string>>(new Set());
  const [expandedCards, setExpandedCards] = React.useState<Set<string>>(new Set());

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleCard = (id: string) => {
    setExpandedCards((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const availableQueues = React.useMemo(() => {
    const set = new Set<string>();
    for (const a of automations) if (a.queue) set.add(a.queue);
    return Array.from(set).sort();
  }, [automations]);

  const onAddAutomation = async () => {
    await createAutomation({
      name: 'New Command',
      enabled: true,
      folderId: null,
      queue: null,
      triggers: [],
      checks: [],
      checksGate: 'AND',
      actions: defaultActionsBlock()
    });
  };

  const onAddFolder = async () => {
    await createFolder({ name: 'New Folder', parentId: null });
  };

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div className="card-head" style={{ flexShrink: 0, gap: 10, alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Automation</h3>
          <button
            className="btn btn-sm"
            onClick={onAddAutomation}
            style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <IconPlus size={14} /> Add Command
          </button>
          <button
            className="btn btn-sm"
            onClick={onAddFolder}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
          >
            <IconPlus size={14} /> Add Folder
          </button>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', paddingRight: 4 }}>
          <Tree
            folders={folders}
            automations={automations}
            actions={actions}
            expandedFolders={expandedFolders}
            expandedCards={expandedCards}
            toggleFolder={toggleFolder}
            toggleCard={toggleCard}
            availableQueues={availableQueues}
            createFolder={createFolder}
            updateFolder={updateFolder}
            deleteFolder={deleteFolder}
            reorderFolder={reorderFolder}
            createAutomation={createAutomation}
            updateAutomation={updateAutomation}
            deleteAutomation={deleteAutomation}
            reorderAutomation={reorderAutomation}
            testFire={testFire}
          />
        </div>
      </div>
    </div>
  );
}

// ---------- tree ----------

interface TreeProps {
  folders: Folder[];
  automations: Automation[];
  actions: Action[];
  expandedFolders: Set<string>;
  expandedCards: Set<string>;
  toggleFolder: (id: string) => void;
  toggleCard: (id: string) => void;
  availableQueues: string[];
  createFolder: (input: FolderInput) => Promise<Folder>;
  updateFolder: (id: string, input: FolderInput) => Promise<Folder | null>;
  deleteFolder: (id: string) => Promise<boolean>;
  reorderFolder: (id: string, direction: ReorderDirection) => Promise<boolean>;
  createAutomation: (input: AutomationInput) => Promise<Automation>;
  updateAutomation: (id: string, input: AutomationInput) => Promise<Automation | null>;
  deleteAutomation: (id: string) => Promise<boolean>;
  reorderAutomation: (id: string, direction: ReorderDirection) => Promise<boolean>;
  testFire: (id: string) => Promise<boolean>;
}

function Tree(props: TreeProps) {
  const { folders, automations } = props;
  const rootFolders = folders.filter((f) => f.parentId === null).sort((a, b) => a.order - b.order);
  const rootAutomations = automations.filter((a) => a.folderId === null).sort((a, b) => a.order - b.order);

  if (rootFolders.length === 0 && rootAutomations.length === 0) {
    return (
      <div
        className="dim"
        style={{
          fontSize: 12.5,
          padding: '20px 16px',
          border: '1px dashed var(--border)',
          borderRadius: 10,
          textAlign: 'center',
          lineHeight: 1.55
        }}
      >
        No automations yet. Click <b>+ Add Command</b> to create your first rule, or <b>+ Add Folder</b> to group them.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {rootFolders.map((f) => (
        <FolderNode key={f.id} folder={f} level={0} {...props} />
      ))}
      {rootAutomations.map((a) => (
        <AutomationCard key={a.id} automation={a} level={0} {...props} />
      ))}
    </div>
  );
}

// ---------- folder node ----------

interface FolderNodeProps extends TreeProps {
  folder: Folder;
  level: number;
}

function FolderNode({ folder, level, ...rest }: FolderNodeProps) {
  const { folders, automations, expandedFolders, toggleFolder, updateFolder, deleteFolder, reorderFolder } = rest;
  const expanded = expandedFolders.has(folder.id);
  const [name, setName] = React.useState(folder.name);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  // Re-seed when the folder name changes upstream (push from another window/save).
  React.useEffect(() => { setName(folder.name); }, [folder.name]);

  const childFolders = folders.filter((f) => f.parentId === folder.id).sort((a, b) => a.order - b.order);
  const childAutomations = automations.filter((a) => a.folderId === folder.id).sort((a, b) => a.order - b.order);

  const commitName = async () => {
    if (name.trim() && name !== folder.name) {
      await updateFolder(folder.id, { name: name.trim(), parentId: folder.parentId });
    } else if (!name.trim()) {
      setName(folder.name);
    }
  };

  const onDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    await deleteFolder(folder.id);
  };

  return (
    <div>
      <div
        style={{
          marginLeft: level * 16,
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px',
          background: 'var(--bg-elev, rgba(255,255,255,0.025))',
          border: '1px solid var(--border)',
          borderRadius: 10
        }}
      >
        <button
          onClick={() => toggleFolder(folder.id)}
          title={expanded ? 'Collapse' : 'Expand'}
          style={iconBtnStyle()}
        >
          <IconChevronRight
            size={14}
            style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .12s ease' }}
          />
        </button>
        <IconBox size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
          style={{ flex: 1, fontWeight: 700, fontSize: 13, height: 30 }}
        />
        <ReorderButtons
          onUp={() => { void reorderFolder(folder.id, 'up'); }}
          onDown={() => { void reorderFolder(folder.id, 'down'); }}
        />
        <button
          onClick={onDelete}
          title={confirmDelete ? 'Click again to confirm' : 'Delete folder'}
          style={{ ...iconBtnStyle(), color: confirmDelete ? 'var(--error)' : 'var(--text-dim)' }}
        >
          <IconTrash size={14} />
        </button>
      </div>

      {expanded && (
        <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {childFolders.map((f) => (
            <FolderNode key={f.id} folder={f} level={level + 1} {...rest} />
          ))}
          {childAutomations.map((a) => (
            <AutomationCard key={a.id} automation={a} level={level + 1} {...rest} />
          ))}
          {childFolders.length === 0 && childAutomations.length === 0 && (
            <div
              className="dim"
              style={{
                marginLeft: (level + 1) * 16,
                fontSize: 11.5,
                padding: '8px 12px',
                border: '1px dashed var(--border)',
                borderRadius: 8
              }}
            >
              Empty folder
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------- automation card ----------

interface AutomationCardProps extends TreeProps {
  automation: Automation;
  level: number;
}

function AutomationCard({ automation, level, ...rest }: AutomationCardProps) {
  const {
    actions,
    expandedCards,
    toggleCard,
    availableQueues,
    updateAutomation,
    deleteAutomation,
    reorderAutomation,
    testFire
  } = rest;
  const expanded = expandedCards.has(automation.id);

  // Local mirror of the automation so inline edits feel snappy. We push to the
  // service on commit (blur / explicit change) and let the push refresh sync.
  const [draft, setDraft] = React.useState<Automation>(automation);
  React.useEffect(() => { setDraft(automation); }, [automation]);

  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [fired, setFired] = React.useState(false);
  // Hold the "Fired" reset timer so it can't fire setState after unmount.
  const firedTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  React.useEffect(() => () => { if (firedTimer.current) clearTimeout(firedTimer.current); }, []);

  const persist = React.useCallback(async (next: Partial<AutomationInput>) => {
    const input: AutomationInput = {
      name: next.name ?? draft.name,
      enabled: next.enabled ?? draft.enabled,
      folderId: 'folderId' in next ? next.folderId : draft.folderId,
      queue: 'queue' in next ? next.queue : draft.queue,
      triggers: next.triggers ?? draft.triggers,
      checks: next.checks ?? draft.checks,
      checksGate: next.checksGate ?? draft.checksGate,
      actions: next.actions ?? draft.actions
    };
    await updateAutomation(draft.id, input);
  }, [draft, updateAutomation]);

  const onToggleEnabled = async () => {
    const nextEnabled = !draft.enabled;
    setDraft((d) => ({ ...d, enabled: nextEnabled }));
    await persist({ enabled: nextEnabled });
  };

  const commitName = async () => {
    const trimmed = draft.name.trim();
    if (!trimmed) { setDraft((d) => ({ ...d, name: automation.name })); return; }
    if (trimmed !== automation.name) await persist({ name: trimmed });
  };

  const onTestFire = async () => {
    await testFire(draft.id);
    setFired(true);
    if (firedTimer.current) clearTimeout(firedTimer.current);
    firedTimer.current = setTimeout(() => setFired(false), 1500);
  };

  const onDelete = async () => {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    await deleteAutomation(draft.id);
  };

  const setTriggers = async (triggers: Trigger[]) => {
    setDraft((d) => ({ ...d, triggers }));
    await persist({ triggers });
  };
  const setChecks = async (checks: Check[]) => {
    setDraft((d) => ({ ...d, checks }));
    await persist({ checks });
  };
  const setChecksGate = async (checksGate: ChecksGate) => {
    setDraft((d) => ({ ...d, checksGate }));
    await persist({ checksGate });
  };
  const setActions = async (next: AutomationActions) => {
    setDraft((d) => ({ ...d, actions: next }));
    await persist({ actions: next });
  };
  const setQueue = async (queue: string | null) => {
    setDraft((d) => ({ ...d, queue }));
    await persist({ queue });
  };

  return (
    <div
      style={{
        marginLeft: level * 16,
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--surface-2, rgba(255,255,255,0.03))',
        overflow: 'hidden'
      }}
    >
      {/* Title bar */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px',
          borderBottom: expanded ? '1px solid var(--border)' : '0'
        }}
      >
        <ReorderButtons
          onUp={() => { void reorderAutomation(draft.id, 'up'); }}
          onDown={() => { void reorderAutomation(draft.id, 'down'); }}
        />
        <button
          onClick={() => { void onToggleEnabled(); }}
          className={`chip ${draft.enabled ? 'good' : ''}`}
          style={{ cursor: 'pointer', border: '1px solid ' + (draft.enabled ? 'var(--success)' : 'var(--border)') }}
          title={draft.enabled ? 'Disable' : 'Enable'}
        >
          {draft.enabled ? 'Enabled' : 'Disabled'}
        </button>
        {expanded ? (
          <input
            className="input"
            value={draft.name}
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            onBlur={commitName}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
            style={{ flex: 1, fontWeight: 700, fontSize: 13, height: 30 }}
          />
        ) : (
          <div style={{ flex: 1, fontWeight: 700, fontSize: 13, color: 'var(--text)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {draft.name}
          </div>
        )}
        <QueuePicker
          value={draft.queue}
          available={availableQueues}
          onChange={(q) => { void setQueue(q); }}
        />
        <span title="Layers" style={{ color: 'var(--text-dim)', display: 'inline-flex', alignItems: 'center' }}>
          <IconBox size={14} />
        </span>
        <button onClick={() => { void onTestFire(); }} title="Test Fire" style={iconBtnStyle()}>
          <IconPlay size={12} />
        </button>
        {fired && <span className="chip good" style={{ fontSize: 10 }}>Fired</span>}
        <button
          onClick={onDelete}
          title={confirmDelete ? 'Click again to confirm' : 'Delete automation'}
          style={{ ...iconBtnStyle(), color: confirmDelete ? 'var(--error)' : 'var(--text-dim)' }}
        >
          <IconTrash size={14} />
        </button>
        <button onClick={() => toggleCard(draft.id)} title={expanded ? 'Collapse' : 'Expand'} style={iconBtnStyle()}>
          <IconChevronRight
            size={14}
            style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform .12s ease' }}
          />
        </button>
      </div>

      {expanded && (
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <TriggersSection triggers={draft.triggers} onChange={(t) => { void setTriggers(t); }} />
          <ChecksSection
            checks={draft.checks}
            gate={draft.checksGate}
            onChangeChecks={(c) => { void setChecks(c); }}
            onChangeGate={(g) => { void setChecksGate(g); }}
          />
          <ActionsSection
            block={draft.actions}
            actions={actions}
            onChange={(b) => { void setActions(b); }}
          />
        </div>
      )}
    </div>
  );
}

// ---------- queue picker ----------

function QueuePicker({
  value,
  available,
  onChange
}: { value: string | null; available: string[]; onChange: (q: string | null) => void }) {
  const [newName, setNewName] = React.useState('');
  const onSelect = (v: string) => {
    if (v === '__none__') onChange(null);
    else onChange(v);
  };
  const addNew = () => {
    const t = newName.trim();
    if (!t) return;
    onChange(t);
    setNewName('');
  };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
      <select
        className="input"
        value={value ?? '__none__'}
        onChange={(e) => onSelect(e.target.value)}
        style={{ height: 28, fontSize: 11, padding: '0 8px', width: 'auto', minWidth: 110 }}
      >
        <option value="__none__">No Queue</option>
        {available.map((q) => <option key={q} value={q}>{q}</option>)}
        {value && !available.includes(value) && <option value={value}>{value}</option>}
      </select>
      <input
        className="input"
        value={newName}
        onChange={(e) => setNewName(e.target.value)}
        placeholder="Add queue…"
        style={{ height: 28, fontSize: 11, padding: '0 8px', width: 90 }}
      />
      <button onClick={addNew} disabled={!newName.trim()} style={{ ...iconBtnStyle(), fontSize: 11, padding: '0 6px', width: 'auto', height: 28 }}>
        + Use
      </button>
    </span>
  );
}

// ---------- triggers section ----------

function TriggersSection({
  triggers,
  onChange
}: { triggers: Trigger[]; onChange: (t: Trigger[]) => void }) {
  const [addType, setAddType] = React.useState<TriggerType | ''>('');

  const updateAt = (idx: number, next: Trigger) => onChange(triggers.map((t, i) => i === idx ? next : t));
  const removeAt = (idx: number) => onChange(triggers.filter((_, i) => i !== idx));
  const addNew = () => {
    if (!addType) return;
    onChange([...triggers, defaultTriggerFor(addType)]);
    setAddType('');
  };

  return (
    <Section
      title="Triggers"
      hint="A command will not do anything without triggers, unless triggered via Manual fire or Public API."
    >
      {triggers.length === 0 && (
        <EmptyHint text="No triggers yet. Add one below — without triggers this rule only fires via Manual fire or Public API." />
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {triggers.map((t, idx) => (
          <TriggerRow key={idx} trigger={t} onChange={(next) => updateAt(idx, next)} onRemove={() => removeAt(idx)} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8, alignItems: 'center' }}>
        <select
          className="input"
          value={addType}
          onChange={(e) => setAddType(e.target.value as TriggerType | '')}
          style={{ height: 30, fontSize: 12, padding: '0 10px', flex: 1 }}
        >
          <option value="">+ New Trigger…</option>
          {TRIGGER_TYPES.map((t) => <option key={t} value={t}>{TRIGGER_LABEL[t]}</option>)}
        </select>
        <button
          onClick={addNew}
          disabled={!addType}
          className="btn btn-sm"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <IconPlus size={12} /> Add
        </button>
      </div>
    </Section>
  );
}

function TriggerRow({
  trigger,
  onChange,
  onRemove
}: { trigger: Trigger; onChange: (t: Trigger) => void; onRemove: () => void }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 8px',
        background: 'var(--bg-elev, rgba(255,255,255,0.025))',
        border: '1px solid var(--border)',
        borderRadius: 8
      }}
    >
      <span className="chip primary" style={{ fontSize: 10, flexShrink: 0 }}>{TRIGGER_LABEL[trigger.type]}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <TriggerInlineForm trigger={trigger} onChange={onChange} />
      </div>
      <button onClick={onRemove} title="Remove trigger" style={iconBtnStyle()}>
        <IconTrash size={12} />
      </button>
    </div>
  );
}

function TriggerInlineForm({
  trigger,
  onChange
}: { trigger: Trigger; onChange: (t: Trigger) => void }) {
  switch (trigger.type) {
    case 'chat_message': {
      const cfg = trigger.config;
      return (
        <input
          className="input mono"
          value={cfg.command ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ type: 'chat_message', config: v ? { command: v } : {} });
          }}
          placeholder="Specific command (e.g. so) — leave blank for any message"
          style={{ height: 28, fontSize: 12 }}
        />
      );
    }
    case 'sub': {
      const cfg = trigger.config;
      return (
        <select
          className="input"
          value={cfg.minTier ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) onChange({ type: 'sub', config: {} });
            else onChange({ type: 'sub', config: { minTier: Number(v) as 1 | 2 | 3 } });
          }}
          style={{ height: 28, fontSize: 12 }}
        >
          <option value="">Any tier</option>
          <option value="1">Tier 1</option>
          <option value="2">Tier 2</option>
          <option value="3">Tier 3</option>
        </select>
      );
    }
    case 'bits': {
      const cfg = trigger.config;
      return (
        <input
          className="input"
          type="number"
          value={cfg.minBits ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) onChange({ type: 'bits', config: {} });
            else onChange({ type: 'bits', config: { minBits: Number(v) } });
          }}
          placeholder="Any"
          style={{ height: 28, fontSize: 12 }}
        />
      );
    }
    case 'raid': {
      const cfg = trigger.config;
      return (
        <input
          className="input"
          type="number"
          value={cfg.minRaiders ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) onChange({ type: 'raid', config: {} });
            else onChange({ type: 'raid', config: { minRaiders: Number(v) } });
          }}
          placeholder="Any"
          style={{ height: 28, fontSize: 12 }}
        />
      );
    }
    case 'channel_point_redemption': {
      const cfg = trigger.config;
      return (
        <input
          className="input mono"
          value={cfg.rewardId ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            const next: Trigger = v
              ? { type: 'channel_point_redemption', config: { rewardId: v, rewardName: cfg.rewardName } }
              : { type: 'channel_point_redemption', config: {} };
            onChange(next);
          }}
          placeholder="Any specific reward"
          style={{ height: 28, fontSize: 12 }}
        />
      );
    }
    case 'obs_scene_switch': {
      const cfg = trigger.config;
      return (
        <input
          className="input"
          value={cfg.sceneName ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            onChange(v
              ? { type: 'obs_scene_switch', config: { sceneName: v } }
              : { type: 'obs_scene_switch', config: {} });
          }}
          placeholder="Any scene"
          style={{ height: 28, fontSize: 12 }}
        />
      );
    }
    default:
      return <span className="dim" style={{ fontSize: 11 }}>(no config)</span>;
  }
}

// ---------- checks section ----------

function ChecksSection({
  checks,
  gate,
  onChangeChecks,
  onChangeGate
}: {
  checks: Check[];
  gate: ChecksGate;
  onChangeChecks: (c: Check[]) => void;
  onChangeGate: (g: ChecksGate) => void;
}) {
  const updateAt = (idx: number, next: Check) => onChangeChecks(checks.map((c, i) => i === idx ? next : c));
  const removeAt = (idx: number) => onChangeChecks(checks.filter((_, i) => i !== idx));

  const addVariable = () => {
    const v: VariableCheck = { type: 'variable', variable: '', operator: 'eq', value: '' };
    onChangeChecks([...checks, v]);
  };
  const addData = () => {
    const d: DataCheck = { type: 'data', path: '', operator: 'eq', value: '' };
    onChangeChecks([...checks, d]);
  };

  return (
    <Section
      title="Checks"
      hint="Optional gates that must pass before actions run. Switch between AND (all pass) and OR (any pass)."
      headerRight={
        <span style={{ display: 'inline-flex', gap: 4 }}>
          <GatePill active={gate === 'AND'} onClick={() => onChangeGate('AND')}>AND</GatePill>
          <GatePill active={gate === 'OR'} onClick={() => onChangeGate('OR')}>OR</GatePill>
        </span>
      }
    >
      {checks.length === 0 && <EmptyHint text="No checks — the actions will always run when triggered." />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {checks.map((c, idx) => (
          <CheckRow key={idx} check={c} onChange={(next) => updateAt(idx, next)} onRemove={() => removeAt(idx)} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
        <button onClick={addVariable} style={addBtnStyle('var(--error)')}>
          <IconPlus size={12} /> Variable Check
        </button>
        <button onClick={addData} style={addBtnStyle('var(--info)')}>
          <IconPlus size={12} /> Data Check
        </button>
      </div>
    </Section>
  );
}

function CheckRow({
  check,
  onChange,
  onRemove
}: { check: Check; onChange: (c: Check) => void; onRemove: () => void }) {
  if (check.type === 'variable') {
    return (
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '6px 8px',
          background: 'var(--error-soft)',
          border: '1px solid var(--error)',
          borderRadius: 8
        }}
      >
        <span className="chip live" style={{ fontSize: 10, flexShrink: 0 }}>Variable</span>
        <input
          className="input mono"
          value={check.variable}
          onChange={(e) => onChange({ ...check, variable: e.target.value })}
          placeholder="variable_name"
          style={{ height: 28, fontSize: 12, flex: 1 }}
        />
        <select
          className="input"
          value={check.operator}
          onChange={(e) => onChange({ ...check, operator: e.target.value as CheckOperator })}
          style={{ height: 28, fontSize: 12, width: 80 }}
        >
          {OPERATORS.map((op) => <option key={op} value={op}>{OPERATOR_LABEL[op]}</option>)}
        </select>
        <input
          className="input"
          value={check.value}
          onChange={(e) => onChange({ ...check, value: e.target.value })}
          placeholder="value"
          style={{ height: 28, fontSize: 12, flex: 1 }}
        />
        <button onClick={onRemove} title="Remove check" style={iconBtnStyle()}>
          <IconTrash size={12} />
        </button>
      </div>
    );
  }
  // data check
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 8px',
        background: 'var(--info-soft)',
        border: '1px solid var(--info)',
        borderRadius: 8
      }}
    >
      <span className="chip info" style={{ fontSize: 10, flexShrink: 0 }}>Data</span>
      <input
        className="input mono"
        value={check.path}
        onChange={(e) => onChange({ ...check, path: e.target.value })}
        placeholder="user.login"
        style={{ height: 28, fontSize: 12, flex: 1 }}
      />
      <select
        className="input"
        value={check.operator}
        onChange={(e) => onChange({ ...check, operator: e.target.value as CheckOperator })}
        style={{ height: 28, fontSize: 12, width: 80 }}
      >
        {OPERATORS.map((op) => <option key={op} value={op}>{OPERATOR_LABEL[op]}</option>)}
      </select>
      <input
        className="input"
        value={check.value}
        onChange={(e) => onChange({ ...check, value: e.target.value })}
        placeholder="value"
        style={{ height: 28, fontSize: 12, flex: 1 }}
      />
      <button onClick={onRemove} title="Remove check" style={iconBtnStyle()}>
        <IconTrash size={12} />
      </button>
    </div>
  );
}

// ---------- actions section ----------

function ActionsSection({
  block,
  actions,
  onChange
}: {
  block: AutomationActions;
  actions: Action[];
  onChange: (b: AutomationActions) => void;
}) {
  const setMode = (mode: ActionMode) => {
    if (mode === block.mode) return;
    // Switching mode reshapes the block so only the relevant field is populated.
    if (mode === 'if_else') {
      onChange({ mode, ifElse: block.ifElse ?? defaultIfElse() });
    } else if (mode === 'switch_case') {
      onChange({ mode, switchCase: block.switchCase ?? defaultSwitchCase() });
    } else {
      onChange({ mode, refs: block.refs ?? [] });
    }
  };

  return (
    <Section
      title="Actions"
      hint="What this rule runs when triggered. Pick a mode then build the block — actions come from the Actions library."
    >
      <div className="tabstrip" style={{ marginBottom: 12 }}>
        {MODES.map((m) => (
          <button
            key={m}
            className="tab"
            data-active={block.mode === m}
            onClick={() => setMode(m)}
          >
            {MODE_LABEL[m]}
          </button>
        ))}
      </div>
      <ActionsBlockBody block={block} actions={actions} onChange={onChange} />
    </Section>
  );
}

function ActionsBlockBody({
  block,
  actions,
  onChange
}: {
  block: AutomationActions;
  actions: Action[];
  onChange: (b: AutomationActions) => void;
}) {
  switch (block.mode) {
    case 'standard':
    case 'random':
    case 'toggle':
    case 'sequence': {
      const refs = block.refs ?? [];
      return (
        <RefsList
          refs={refs}
          actions={actions}
          onChange={(next) => onChange({ mode: block.mode, refs: next })}
        />
      );
    }
    case 'if_else': {
      const ie = block.ifElse ?? defaultIfElse();
      const setIfElse = (next: IfElseBlock) => onChange({ mode: 'if_else', ifElse: next });
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <SectionLabel>Inline Check</SectionLabel>
            <div
              style={{
                display: 'flex', gap: 6, alignItems: 'center',
                padding: '6px 8px',
                background: 'var(--error-soft)',
                border: '1px solid var(--error)',
                borderRadius: 8
              }}
            >
              <input
                className="input mono"
                value={ie.inlineCheck.variable}
                onChange={(e) => setIfElse({ ...ie, inlineCheck: { ...ie.inlineCheck, variable: e.target.value } })}
                placeholder="variable_name"
                style={{ height: 28, fontSize: 12, flex: 1 }}
              />
              <select
                className="input"
                value={ie.inlineCheck.operator}
                onChange={(e) => setIfElse({ ...ie, inlineCheck: { ...ie.inlineCheck, operator: e.target.value as CheckOperator } })}
                style={{ height: 28, fontSize: 12, width: 80 }}
              >
                {OPERATORS.map((op) => <option key={op} value={op}>{OPERATOR_LABEL[op]}</option>)}
              </select>
              <input
                className="input"
                value={ie.inlineCheck.value}
                onChange={(e) => setIfElse({ ...ie, inlineCheck: { ...ie.inlineCheck, value: e.target.value } })}
                placeholder="value"
                style={{ height: 28, fontSize: 12, flex: 1 }}
              />
            </div>
          </div>
          <div>
            <SectionLabel>Then Actions</SectionLabel>
            <RefsList
              refs={ie.thenActions}
              actions={actions}
              onChange={(thenActions) => setIfElse({ ...ie, thenActions })}
            />
          </div>
          <div>
            <SectionLabel>Else Actions</SectionLabel>
            <RefsList
              refs={ie.elseActions}
              actions={actions}
              onChange={(elseActions) => setIfElse({ ...ie, elseActions })}
            />
          </div>
        </div>
      );
    }
    case 'switch_case': {
      const sc = block.switchCase ?? defaultSwitchCase();
      const setSwitch = (next: SwitchCaseBlock) => onChange({ mode: 'switch_case', switchCase: next });
      const addCase = () => setSwitch({ ...sc, cases: [...sc.cases, { value: '', actions: [] }] });
      const removeCase = (idx: number) => setSwitch({ ...sc, cases: sc.cases.filter((_, i) => i !== idx) });
      const updateCase = (idx: number, next: { value: string; actions: ActionRef[] }) =>
        setSwitch({ ...sc, cases: sc.cases.map((c, i) => i === idx ? next : c) });
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <SectionLabel>Source</SectionLabel>
            <div style={{ display: 'flex', gap: 6 }}>
              <select
                className="input"
                value={sc.source.kind}
                onChange={(e) => {
                  const kind = e.target.value as 'trigger_field' | 'variable';
                  if (kind === 'trigger_field') setSwitch({ ...sc, source: { kind, path: sc.source.kind === 'trigger_field' ? sc.source.path : '' } });
                  else setSwitch({ ...sc, source: { kind, name: sc.source.kind === 'variable' ? sc.source.name : '' } });
                }}
                style={{ height: 30, fontSize: 12, width: 160 }}
              >
                <option value="trigger_field">Trigger Field</option>
                <option value="variable">Variable</option>
              </select>
              {sc.source.kind === 'trigger_field' ? (
                <input
                  className="input mono"
                  value={sc.source.path}
                  onChange={(e) => setSwitch({ ...sc, source: { kind: 'trigger_field', path: e.target.value } })}
                  placeholder="user.login"
                  style={{ height: 30, fontSize: 12, flex: 1 }}
                />
              ) : (
                <input
                  className="input mono"
                  value={sc.source.name}
                  onChange={(e) => setSwitch({ ...sc, source: { kind: 'variable', name: e.target.value } })}
                  placeholder="variable_name"
                  style={{ height: 30, fontSize: 12, flex: 1 }}
                />
              )}
            </div>
          </div>
          <div>
            <SectionLabel>Cases</SectionLabel>
            {sc.cases.length === 0 && <EmptyHint text="No cases yet — add one below." />}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sc.cases.map((c, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '8px 10px',
                    border: '1px solid var(--border)',
                    borderRadius: 8,
                    background: 'var(--bg-elev, rgba(255,255,255,0.025))'
                  }}
                >
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
                    <span className="chip" style={{ fontSize: 10 }}>Case</span>
                    <input
                      className="input"
                      value={c.value}
                      onChange={(e) => updateCase(idx, { ...c, value: e.target.value })}
                      placeholder="matches value"
                      style={{ height: 28, fontSize: 12, flex: 1 }}
                    />
                    <button onClick={() => removeCase(idx)} className="btn btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                      <IconTrash size={12} /> Remove case
                    </button>
                  </div>
                  <RefsList
                    refs={c.actions}
                    actions={actions}
                    onChange={(refs) => updateCase(idx, { ...c, actions: refs })}
                  />
                </div>
              ))}
            </div>
            <button onClick={addCase} className="btn btn-sm" style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <IconPlus size={12} /> Add case
            </button>
          </div>
          <div>
            <SectionLabel>Default Actions</SectionLabel>
            <RefsList
              refs={sc.defaultActions}
              actions={actions}
              onChange={(defaultActions) => setSwitch({ ...sc, defaultActions })}
            />
          </div>
        </div>
      );
    }
  }
}

// ---------- action refs list (used by every block kind) ----------

function RefsList({
  refs,
  actions,
  onChange
}: { refs: ActionRef[]; actions: Action[]; onChange: (r: ActionRef[]) => void }) {
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const moveUp = (idx: number) => {
    if (idx === 0) return;
    const next = refs.slice();
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onChange(next);
  };
  const moveDown = (idx: number) => {
    if (idx >= refs.length - 1) return;
    const next = refs.slice();
    [next[idx + 1], next[idx]] = [next[idx], next[idx + 1]];
    onChange(next);
  };
  const removeAt = (idx: number) => onChange(refs.filter((_, i) => i !== idx));
  const addRef = (actionId: string) => {
    onChange([...refs, { actionId }]);
    setPickerOpen(false);
  };

  return (
    <div>
      {refs.length === 0 ? (
        <div
          className="dim"
          style={{
            fontSize: 11.5,
            padding: '10px 12px',
            border: '1px dashed var(--border)',
            borderRadius: 8,
            lineHeight: 1.45
          }}
        >
          This block has no actions,&nbsp;
          <button
            onClick={() => setPickerOpen(true)}
            style={{
              background: 'transparent', border: 0, color: 'var(--primary)',
              cursor: 'pointer', fontWeight: 600, padding: 0, fontSize: 11.5
            }}
          >
            + click here to add an action
          </button>
          &nbsp;or pick from the library.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {refs.map((r, idx) => (
            <ActionRefRow
              key={idx}
              refItem={r}
              actions={actions}
              onUp={() => moveUp(idx)}
              onDown={() => moveDown(idx)}
              onRemove={() => removeAt(idx)}
              isFirst={idx === 0}
              isLast={idx === refs.length - 1}
            />
          ))}
        </div>
      )}
      {refs.length > 0 && (
        <button
          onClick={() => setPickerOpen(true)}
          className="btn btn-sm"
          style={{ marginTop: 8, display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <IconPlus size={12} /> Add action
        </button>
      )}
      {pickerOpen && (
        <ActionPicker
          actions={actions}
          onPick={addRef}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  );
}

function ActionRefRow({
  refItem,
  actions,
  onUp,
  onDown,
  onRemove,
  isFirst,
  isLast
}: {
  refItem: ActionRef;
  actions: Action[];
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const found = actions.find((a) => a.id === refItem.actionId);
  const isTwitch = found && TWITCH_ACTION_TYPES.has(found.body.type);
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 8px',
        background: 'var(--bg-elev, rgba(255,255,255,0.025))',
        border: '1px solid var(--border)',
        borderRadius: 8
      }}
    >
      <button onClick={onUp} disabled={isFirst} title="Move up" style={{ ...iconBtnStyle(), opacity: isFirst ? 0.4 : 1 }}>
        ▲
      </button>
      <button onClick={onDown} disabled={isLast} title="Move down" style={{ ...iconBtnStyle(), opacity: isLast ? 0.4 : 1 }}>
        ▼
      </button>
      <div style={{ flex: 1, fontSize: 12, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {found ? found.name : <span className="dim">(unknown action)</span>}
      </div>
      <span className="chip" style={{ fontSize: 10 }}>{isTwitch ? 'Twitch' : 'App'}</span>
      <button onClick={onRemove} title="Remove action" style={iconBtnStyle()}>
        <IconTrash size={12} />
      </button>
    </div>
  );
}

// ---------- action picker (inline popover) ----------

function ActionPicker({
  actions,
  onPick,
  onClose
}: { actions: Action[]; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = React.useState('');
  const filtered = React.useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return actions;
    return actions.filter((a) => a.name.toLowerCase().includes(s));
  }, [actions, q]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-panel)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 16,
          width: 'min(480px, 92vw)',
          maxHeight: '80vh',
          display: 'flex', flexDirection: 'column', gap: 10
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3 style={{ margin: 0 }}>Pick an Action</h3>
          <button onClick={onClose} className="btn btn-sm" style={{ marginLeft: 'auto' }}>Close</button>
        </div>
        <input
          className="input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search actions…"
        />
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {filtered.length === 0 && <div className="dim" style={{ fontSize: 12, padding: 10 }}>No actions found. Create one in the Actions screen.</div>}
          {filtered.map((a) => {
            const isTwitch = TWITCH_ACTION_TYPES.has(a.body.type);
            return (
              <button
                key={a.id}
                onClick={() => onPick(a.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px',
                  background: 'var(--bg-elev, rgba(255,255,255,0.03))',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  textAlign: 'left', cursor: 'pointer',
                  color: 'var(--text)'
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, fontSize: 12 }}>{a.name}</div>
                </div>
                <span className="chip" style={{ fontSize: 10 }}>{isTwitch ? 'Twitch' : 'App'}</span>
                <span className={`chip ${a.enabled ? 'good' : ''}`} style={{ fontSize: 10 }}>{a.enabled ? 'On' : 'Off'}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- small reusable bits ----------

function Section({
  title,
  hint,
  headerRight,
  children
}: { title: string; hint: string; headerRight?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-mute)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
          {title}
        </div>
        <span title={hint} style={{
          width: 16, height: 16, borderRadius: 8,
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 10, fontWeight: 700,
          background: 'var(--bg-elev)', color: 'var(--text-dim)',
          border: '1px solid var(--border)', cursor: 'help'
        }}>?</span>
        {headerRight && <span style={{ marginLeft: 'auto' }}>{headerRight}</span>}
      </div>
      <div className="dim" style={{ fontSize: 11, marginBottom: 8, padding: '0 2px', lineHeight: 1.45 }}>{hint}</div>
      {children}
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="dim" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.02em', marginBottom: 6, padding: '0 2px' }}>{children}</div>;
}

function EmptyHint({ text }: { text: string }) {
  return (
    <div
      className="dim"
      style={{
        fontSize: 11.5,
        padding: '8px 12px',
        border: '1px dashed var(--border)',
        borderRadius: 8,
        lineHeight: 1.45,
        marginBottom: 6
      }}
    >
      {text}
    </div>
  );
}

function GatePill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 10, fontWeight: 700,
        padding: '3px 10px',
        borderRadius: 6,
        border: '1px solid ' + (active ? 'var(--primary)' : 'var(--border)'),
        background: active ? 'var(--primary-soft)' : 'transparent',
        color: active ? 'var(--text)' : 'var(--text-dim)',
        cursor: 'pointer'
      }}
    >{children}</button>
  );
}

function ReorderButtons({ onUp, onDown }: { onUp: () => void; onDown: () => void }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 2, flexShrink: 0 }}>
      <button onClick={onUp} title="Move up" style={{ ...iconBtnStyle(), height: 16, width: 18, fontSize: 9, padding: 0 }}>▲</button>
      <button onClick={onDown} title="Move down" style={{ ...iconBtnStyle(), height: 16, width: 18, fontSize: 9, padding: 0 }}>▼</button>
    </span>
  );
}

function iconBtnStyle(): React.CSSProperties {
  return {
    height: 28, width: 28, padding: 0,
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 6,
    color: 'var(--text-dim)',
    cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    flexShrink: 0
  };
}

function addBtnStyle(color: string): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '6px 12px',
    fontSize: 12, fontWeight: 600,
    background: 'color-mix(in oklab, ' + color + ' 18%, transparent)',
    border: '1px solid ' + color,
    borderRadius: 8,
    color,
    cursor: 'pointer'
  };
}
