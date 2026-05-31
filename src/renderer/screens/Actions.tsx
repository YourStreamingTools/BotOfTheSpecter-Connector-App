import React from 'react';
import { useActions } from '../state/useActions';
import type { Action, ActionBody, ActionInput, ActionType } from '@shared/ipc';
import { IconChevronLeft, IconChevronRight, IconPlus, IconTrash, IconSearch } from '../icons';

// ---- Internal "router" — mirrors Commands.tsx pattern. Actions has a flat list →
// new/edit form stack so the header can show a Back pill without coupling the body to its history.

type View =
  | { kind: 'list' }
  | { kind: 'new' }
  | { kind: 'edit'; id: string };

const TYPE_LABEL: Record<ActionType, string> = {
  call_webpage: 'Call Webpage',
  change_variable: 'Change Global Variable Value',
  trigger_command: 'Trigger Command',
  play_sound: 'Play Sound',
  tts: 'TTS',
  toggle_automation: 'Enable/Disable Command',
  send_webhook: 'Send Webhook',
  toggle_redemption: 'Enable/Disable Channel Points Redemption',
  run_ads: 'Run Ads',
  create_marker: 'Create Stream Marker',
  start_end_poll: 'Start/End Poll',
  start_cancel_prediction: 'Start/Cancel Predictions',
  toggle_slow_mode: 'Slow Mode On/Off',
  create_clip: 'Create Clip'
};

const APP_ACTION_OPTIONS: ActionType[] = [
  'call_webpage',
  'change_variable',
  'trigger_command',
  'play_sound',
  'tts',
  'toggle_automation',
  'send_webhook'
];

const TWITCH_ACTION_OPTIONS: ActionType[] = [
  'toggle_redemption',
  'run_ads',
  'create_marker',
  'start_end_poll',
  'start_cancel_prediction',
  'toggle_slow_mode',
  'create_clip'
];

const TWITCH_ACTION_SET: ReadonlySet<ActionType> = new Set(TWITCH_ACTION_OPTIONS);

function defaultConfig(t: ActionType): ActionBody {
  switch (t) {
    case 'call_webpage':             return { type: t, config: { url: '', method: 'GET', headers: [], body: '' } };
    case 'change_variable':          return { type: t, config: { name: '', value: '' } };
    case 'trigger_command':          return { type: t, config: { command: '' } };
    case 'play_sound':               return { type: t, config: { soundId: '', soundName: '' } };
    case 'tts':                      return { type: t, config: { text: '', voice: '' } };
    case 'toggle_automation':        return { type: t, config: { targetAutomationId: '', mode: 'toggle' } };
    case 'send_webhook':             return { type: t, config: { url: '', method: 'POST', headers: [], payload: '' } };
    case 'toggle_redemption':        return { type: t, config: { rewardId: '', rewardName: '', mode: 'toggle' } };
    case 'run_ads':                  return { type: t, config: { length: 30 } };
    case 'create_marker':            return { type: t, config: { description: '' } };
    case 'start_end_poll':           return { type: t, config: { mode: 'start', title: '', choices: ['', ''], durationSeconds: 120, channelPointsVotingEnabled: false, channelPointsPerVote: 100 } };
    case 'start_cancel_prediction':  return { type: t, config: { mode: 'start', title: '', outcomes: ['', ''], predictionWindowSeconds: 120 } };
    case 'toggle_slow_mode':         return { type: t, config: { mode: 'toggle', waitTimeSeconds: 10 } };
    case 'create_clip':              return { type: t, config: { hasDelay: false } };
  }
}

export function ScreenActions() {
  const { actions, create, update, remove } = useActions();
  const [stack, setStack] = React.useState<View[]>([{ kind: 'list' }]);
  const view = stack[stack.length - 1];

  const push = (v: View) => setStack((s) => [...s, v]);
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <ActionsHeader view={view} onBack={back} onNew={() => push({ kind: 'new' })} />
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', paddingRight: 4 }}>
          <Body
            view={view}
            actions={actions}
            push={push}
            back={back}
            create={create}
            update={update}
            remove={remove}
          />
        </div>
      </div>
    </div>
  );
}

// ---------- header ----------

function ActionsHeader({ view, onBack, onNew }: { view: View; onBack: () => void; onNew: () => void }) {
  const title = view.kind === 'list' ? 'Actions' : view.kind === 'new' ? 'New Action' : 'Edit Action';
  const showBack = view.kind !== 'list';
  return (
    <div className="card-head" style={{ flexShrink: 0, gap: 10, alignItems: 'center', marginBottom: 12 }}>
      {showBack && (
        <button className="btn btn-sm" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <IconChevronLeft size={14} /> Actions
        </button>
      )}
      <h3 style={{ margin: 0 }}>{title}</h3>
      {view.kind === 'list' && (
        <button
          className="btn btn-sm"
          onClick={onNew}
          style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        >
          <IconPlus size={14} /> New Action
        </button>
      )}
    </div>
  );
}

// ---------- body switch ----------

interface BodyProps {
  view: View;
  actions: Action[];
  push: (v: View) => void;
  back: () => void;
  create: (input: ActionInput) => Promise<Action>;
  update: (id: string, input: ActionInput) => Promise<Action | null>;
  remove: (id: string) => Promise<boolean>;
}

function Body({ view, actions, push, back, create, update, remove }: BodyProps) {
  switch (view.kind) {
    case 'list':
      return <ListView actions={actions} push={push} />;
    case 'new':
      return <FormView mode="new" actions={actions} back={back} create={create} update={update} remove={remove} />;
    case 'edit':
      return <FormView mode="edit" id={view.id} actions={actions} back={back} create={create} update={update} remove={remove} />;
  }
}

// ---------- list view ----------

function ListView({ actions, push }: { actions: Action[]; push: (v: View) => void }) {
  const [q, setQ] = React.useState('');
  const filtered = React.useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return actions;
    return actions.filter((a) =>
      a.name.toLowerCase().includes(s) ||
      TYPE_LABEL[a.body.type].toLowerCase().includes(s)
    );
  }, [actions, q]);
  return (
    <>
      <SearchBar value={q} onChange={setQ} placeholder="Search actions…" />
      {filtered.length === 0
        ? <EmptyRow text={q ? 'No actions match the search.' : 'No actions yet. Click + New Action to create one.'} />
        : filtered.map((a) => (
            <ListRow key={a.id} onClick={() => push({ kind: 'edit', id: a.id })}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{a.name}</div>
                <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>{TYPE_LABEL[a.body.type]}</div>
              </div>
              <span className="chip" style={{ fontSize: 10 }}>{TWITCH_ACTION_SET.has(a.body.type) ? 'Twitch' : 'App'}</span>
              <span className={`chip ${a.enabled ? 'good' : ''}`} style={{ fontSize: 10 }}>{a.enabled ? 'Enabled' : 'Disabled'}</span>
              <IconChevronRight size={14} style={{ color: 'var(--text-dim)' }} />
            </ListRow>
          ))}
    </>
  );
}

// ---------- form (new + edit share the same body) ----------

interface FormViewProps {
  mode: 'new' | 'edit';
  id?: string;
  actions: Action[];
  back: () => void;
  create: (input: ActionInput) => Promise<Action>;
  update: (id: string, input: ActionInput) => Promise<Action | null>;
  remove: (id: string) => Promise<boolean>;
}

function FormView({ mode, id, actions, back, create, update, remove }: FormViewProps) {
  const existing = mode === 'edit' && id ? actions.find((a) => a.id === id) : undefined;
  // If we navigated to an edit that no longer exists (e.g. deleted in another window), bail.
  const missing = mode === 'edit' && !existing;

  const [name, setName] = React.useState<string>(existing?.name ?? '');
  const [enabled, setEnabled] = React.useState<boolean>(existing?.enabled ?? true);
  const [body, setBody] = React.useState<ActionBody | null>(existing?.body ?? null);

  const [saving, setSaving] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Re-seed when the edit target changes (e.g. push from a different row), or when an upstream
  // update lands while we're on this screen. The body field is wholly user-owned during editing,
  // so we only re-seed when the underlying id changes.
  const seedKey = existing?.id ?? '__new__';
  React.useEffect(() => {
    setName(existing?.name ?? '');
    setEnabled(existing?.enabled ?? true);
    setBody(existing?.body ?? null);
    setFeedback(null);
    setConfirmDelete(false);
  }, [seedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  if (missing) {
    return <EmptyRow text="Action not found. It may have been deleted." />;
  }

  const selectedType: ActionType | '' = body?.type ?? '';
  const onTypeChange = (next: string) => {
    if (next === '') {
      setBody(null);
      return;
    }
    const t = next as ActionType;
    // Reset config to defaults when the type changes — the discriminated union forbids
    // sharing configs across types, so a fresh shape is the only safe move.
    setBody(defaultConfig(t));
  };

  const valid = validate(name, body);

  const doSave = async () => {
    if (!valid || !body) return;
    setSaving(true);
    setFeedback(null);
    try {
      const input: ActionInput = { name: name.trim(), enabled, body };
      if (mode === 'edit' && existing) {
        const updated = await update(existing.id, input);
        if (updated) back();
        else setFeedback({ kind: 'err', text: 'Save failed — action not found.' });
      } else {
        await create(input);
        back();
      }
    } catch (err) {
      setFeedback({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!existing) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    setFeedback(null);
    try {
      const ok = await remove(existing.id);
      if (ok) back();
      else setFeedback({ kind: 'err', text: 'Delete failed.' });
    } catch (err) {
      setFeedback({ kind: 'err', text: err instanceof Error ? err.message : 'Delete failed.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <SectionLabel>Name</SectionLabel>
        <input
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Shout out latest follower"
        />
      </div>
      <div>
        <SectionLabel>Action Type</SectionLabel>
        <select className="input" value={selectedType} onChange={(e) => onTypeChange(e.target.value)}>
          <option value="">Select…</option>
          <optgroup label="App Actions">
            {APP_ACTION_OPTIONS.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </optgroup>
          <optgroup label="Twitch Actions">
            {TWITCH_ACTION_OPTIONS.map((t) => (
              <option key={t} value={t}>{TYPE_LABEL[t]}</option>
            ))}
          </optgroup>
        </select>
      </div>
      {body && <TypeConfigBlock body={body} onChange={setBody} />}
      <StatusToggle enabled={enabled} onChange={setEnabled} />
      <PrimaryButton onClick={doSave} disabled={!valid || saving}>
        {saving ? 'Saving…' : 'Save Changes'}
      </PrimaryButton>
      {mode === 'edit' && existing && (
        <button
          onClick={doDelete}
          disabled={saving}
          style={{
            padding: '12px 16px',
            fontSize: 14, fontWeight: 700,
            background: confirmDelete ? 'var(--error)' : 'var(--error-soft)',
            color: confirmDelete ? '#fff' : '#ff8a7c',
            border: '1px solid var(--error)',
            borderRadius: 10,
            cursor: saving ? 'default' : 'pointer',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6
          }}
        >
          <IconTrash size={14} /> {confirmDelete ? 'Click again to confirm delete' : 'Delete Action'}
        </button>
      )}
      {feedback && (
        <div className={feedback.kind === 'ok' ? 'chip good' : 'chip warn'} style={{ alignSelf: 'center', fontSize: 11 }}>
          {feedback.text}
        </div>
      )}
    </div>
  );
}

// Parse a <input type="number"> value, keeping the previous value when the
// field is cleared or otherwise non-numeric. Without this, a cleared field
// writes Number('') === 0 (a bogus value, e.g. 0 channel points) and a stray
// non-numeric value writes NaN (which serializes to null, corrupting the saved
// config, and breaks the controlled input).
export function numOrKeep(raw: string, fallback: number): number {
  if (raw.trim() === '') return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export function validate(name: string, body: ActionBody | null): boolean {
  if (!name.trim()) return false;
  if (!body) return false;
  switch (body.type) {
    case 'call_webpage':             return body.config.url.trim().length > 0;
    case 'change_variable':          return body.config.name.trim().length > 0;
    case 'trigger_command':          return body.config.command.trim().length > 0;
    case 'play_sound':               return body.config.soundId.trim().length > 0;
    case 'tts':                      return body.config.text.trim().length > 0;
    case 'toggle_automation':        return body.config.targetAutomationId.trim().length > 0;
    case 'send_webhook':             return body.config.url.trim().length > 0;
    case 'toggle_redemption':        return body.config.rewardId.trim().length > 0;
    case 'run_ads':                  return true;
    case 'create_marker':            return true;
    case 'start_end_poll': {
      if (body.config.mode === 'end') return true;
      const validChoices = body.config.choices.filter((c) => c.trim().length > 0);
      // Channel-points-per-vote only matters (and is only sent to Twitch) when
      // voting is enabled — but when it is, it must be a valid integer in range,
      // otherwise a NaN/0 would corrupt the saved config and the Twitch request.
      const cpvOk =
        !body.config.channelPointsVotingEnabled ||
        (Number.isInteger(body.config.channelPointsPerVote) &&
          body.config.channelPointsPerVote >= 1 &&
          body.config.channelPointsPerVote <= 1_000_000);
      return (
        body.config.title.trim().length > 0 &&
        validChoices.length >= 2 &&
        body.config.durationSeconds >= 15 &&
        body.config.durationSeconds <= 1800 &&
        cpvOk
      );
    }
    case 'start_cancel_prediction': {
      if (body.config.mode === 'cancel') return true;
      const validOutcomes = body.config.outcomes.filter((o) => o.trim().length > 0);
      return (
        body.config.title.trim().length > 0 &&
        validOutcomes.length >= 2 &&
        body.config.predictionWindowSeconds >= 30 &&
        body.config.predictionWindowSeconds <= 1800
      );
    }
    case 'toggle_slow_mode': {
      if (body.config.mode !== 'on') return true;
      return body.config.waitTimeSeconds >= 3 && body.config.waitTimeSeconds <= 120;
    }
    case 'create_clip':              return true;
  }
}

// ---------- per-type config sub-forms ----------

function TypeConfigBlock({ body, onChange }: { body: ActionBody; onChange: (b: ActionBody) => void }) {
  switch (body.type) {
    case 'call_webpage':             return <CallWebpageForm body={body} onChange={onChange} />;
    case 'change_variable':          return <ChangeVariableForm body={body} onChange={onChange} />;
    case 'trigger_command':          return <TriggerCommandForm body={body} onChange={onChange} />;
    case 'play_sound':               return <PlaySoundForm body={body} onChange={onChange} />;
    case 'tts':                      return <TtsForm body={body} onChange={onChange} />;
    case 'toggle_automation':        return <ToggleAutomationForm body={body} onChange={onChange} />;
    case 'send_webhook':             return <SendWebhookForm body={body} onChange={onChange} />;
    case 'toggle_redemption':        return <ToggleRedemptionForm body={body} onChange={onChange} />;
    case 'run_ads':                  return <RunAdsForm body={body} onChange={onChange} />;
    case 'create_marker':            return <CreateMarkerForm body={body} onChange={onChange} />;
    case 'start_end_poll':           return <StartEndPollForm body={body} onChange={onChange} />;
    case 'start_cancel_prediction':  return <StartCancelPredictionForm body={body} onChange={onChange} />;
    case 'toggle_slow_mode':         return <ToggleSlowModeForm body={body} onChange={onChange} />;
    case 'create_clip':              return <CreateClipForm body={body} onChange={onChange} />;
  }
}

function CallWebpageForm({
  body, onChange
}: { body: Extract<ActionBody, { type: 'call_webpage' }>; onChange: (b: ActionBody) => void }) {
  const cfg = body.config;
  const patch = (next: Partial<typeof cfg>) => onChange({ type: 'call_webpage', config: { ...cfg, ...next } });
  const setHeader = (idx: number, next: { key?: string; value?: string }) => {
    const headers = cfg.headers.map((h, i) => i === idx ? { ...h, ...next } : h);
    patch({ headers });
  };
  const addHeader = () => patch({ headers: [...cfg.headers, { key: '', value: '' }] });
  const removeHeader = (idx: number) => patch({ headers: cfg.headers.filter((_, i) => i !== idx) });

  return (
    <>
      <div>
        <SectionLabel>URL</SectionLabel>
        <input
          className="input"
          value={cfg.url}
          onChange={(e) => patch({ url: e.target.value })}
          placeholder="https://example.com/webhook"
        />
      </div>
      <div>
        <SectionLabel>Method</SectionLabel>
        <select
          className="input"
          value={cfg.method}
          onChange={(e) => patch({ method: e.target.value as typeof cfg.method })}
        >
          <option value="GET">GET</option>
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
          <option value="DELETE">DELETE</option>
          <option value="PATCH">PATCH</option>
        </select>
      </div>
      <div>
        <SectionLabel>Headers</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cfg.headers.map((h, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                className="input"
                value={h.key}
                onChange={(e) => setHeader(idx, { key: e.target.value })}
                placeholder="Header name"
                style={{ flex: 1 }}
              />
              <input
                className="input"
                value={h.value}
                onChange={(e) => setHeader(idx, { value: e.target.value })}
                placeholder="Value"
                style={{ flex: 1 }}
              />
              <button
                onClick={() => removeHeader(idx)}
                title="Remove header"
                style={{
                  height: 36, width: 36, padding: 0,
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <IconTrash size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={addHeader}
            style={{
              alignSelf: 'flex-start',
              padding: '6px 12px',
              fontSize: 12, fontWeight: 600,
              background: 'transparent',
              border: '1px dashed var(--border)',
              borderRadius: 8,
              color: 'var(--text-dim)',
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4
            }}
          >
            <IconPlus size={12} /> Add header
          </button>
        </div>
      </div>
      <div>
        <SectionLabel>Request Body</SectionLabel>
        <textarea
          className="input"
          value={cfg.body}
          onChange={(e) => patch({ body: e.target.value })}
          placeholder="Optional request body — JSON, form data, etc."
          style={{ minHeight: 100 }}
        />
      </div>
    </>
  );
}

function ChangeVariableForm({
  body, onChange
}: { body: Extract<ActionBody, { type: 'change_variable' }>; onChange: (b: ActionBody) => void }) {
  const cfg = body.config;
  const patch = (next: Partial<typeof cfg>) => onChange({ type: 'change_variable', config: { ...cfg, ...next } });
  return (
    <>
      <div>
        <SectionLabel>Variable Name</SectionLabel>
        <input
          className="input mono"
          value={cfg.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="variable_name"
        />
      </div>
      <div>
        <SectionLabel>Value</SectionLabel>
        <input
          className="input"
          value={cfg.value}
          onChange={(e) => patch({ value: e.target.value })}
          placeholder="New value"
        />
      </div>
    </>
  );
}

function TriggerCommandForm({
  body, onChange
}: { body: Extract<ActionBody, { type: 'trigger_command' }>; onChange: (b: ActionBody) => void }) {
  const cfg = body.config;
  const patch = (next: Partial<typeof cfg>) => onChange({ type: 'trigger_command', config: { ...cfg, ...next } });
  return (
    <div>
      <SectionLabel>Command</SectionLabel>
      <input
        className="input mono"
        value={cfg.command}
        onChange={(e) => patch({ command: e.target.value })}
        placeholder="so"
      />
      <div className="dim" style={{ fontSize: 11, marginTop: 4, padding: '0 2px' }}>
        Without the leading !
      </div>
    </div>
  );
}

function PlaySoundForm({
  body, onChange
}: { body: Extract<ActionBody, { type: 'play_sound' }>; onChange: (b: ActionBody) => void }) {
  const cfg = body.config;
  const patch = (next: Partial<typeof cfg>) => onChange({ type: 'play_sound', config: { ...cfg, ...next } });
  return (
    <>
      <div>
        <SectionLabel>Sound ID</SectionLabel>
        <input
          className="input mono"
          value={cfg.soundId}
          onChange={(e) => patch({ soundId: e.target.value })}
          placeholder="sound_xxxxxxx"
        />
      </div>
      <div>
        <SectionLabel>Sound Name (optional)</SectionLabel>
        <input
          className="input"
          value={cfg.soundName}
          onChange={(e) => patch({ soundName: e.target.value })}
          placeholder="Friendly display name"
        />
      </div>
      <div
        className="dim"
        style={{
          fontSize: 11.5,
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px dashed var(--border)',
          lineHeight: 1.45
        }}
      >
        Routes through the Soundboard → SpecterAPI. Soundboard integration is coming next; the action saves now and will work once Soundboard ships.
      </div>
    </>
  );
}

function TtsForm({
  body, onChange
}: { body: Extract<ActionBody, { type: 'tts' }>; onChange: (b: ActionBody) => void }) {
  const cfg = body.config;
  const patch = (next: Partial<typeof cfg>) => onChange({ type: 'tts', config: { ...cfg, ...next } });
  return (
    <>
      <div>
        <SectionLabel>Text</SectionLabel>
        <textarea
          className="input"
          value={cfg.text}
          onChange={(e) => patch({ text: e.target.value })}
          placeholder="What should be spoken"
          style={{ minHeight: 80, resize: 'vertical' }}
        />
      </div>
      <div>
        <SectionLabel>Voice</SectionLabel>
        <input
          className="input"
          value={cfg.voice}
          onChange={(e) => patch({ voice: e.target.value })}
          placeholder="Default voice if blank"
        />
      </div>
      <div
        className="dim"
        style={{
          fontSize: 11.5,
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px dashed var(--border)',
          lineHeight: 1.45
        }}
      >
        Routes through the Soundboard → SpecterAPI when that integration ships.
      </div>
    </>
  );
}

function ToggleAutomationForm({
  body, onChange
}: { body: Extract<ActionBody, { type: 'toggle_automation' }>; onChange: (b: ActionBody) => void }) {
  const cfg = body.config;
  const patch = (next: Partial<typeof cfg>) => onChange({ type: 'toggle_automation', config: { ...cfg, ...next } });
  return (
    <>
      <div>
        <SectionLabel>Automation ID</SectionLabel>
        <input
          className="input mono"
          value={cfg.targetAutomationId}
          onChange={(e) => patch({ targetAutomationId: e.target.value })}
          placeholder="auto_…"
        />
        <div className="dim" style={{ fontSize: 11, marginTop: 4, padding: '0 2px' }}>
          Target automation to flip. This becomes a picker once the Automation screen ships.
        </div>
      </div>
      <div>
        <SectionLabel>Mode</SectionLabel>
        <select
          className="input"
          value={cfg.mode}
          onChange={(e) => patch({ mode: e.target.value as typeof cfg.mode })}
        >
          <option value="enable">Enable</option>
          <option value="disable">Disable</option>
          <option value="toggle">Toggle</option>
        </select>
      </div>
    </>
  );
}

function SendWebhookForm({
  body, onChange
}: { body: Extract<ActionBody, { type: 'send_webhook' }>; onChange: (b: ActionBody) => void }) {
  const cfg = body.config;
  const patch = (next: Partial<typeof cfg>) => onChange({ type: 'send_webhook', config: { ...cfg, ...next } });
  const setHeader = (idx: number, next: { key?: string; value?: string }) => {
    const headers = cfg.headers.map((h, i) => i === idx ? { ...h, ...next } : h);
    patch({ headers });
  };
  const addHeader = () => patch({ headers: [...cfg.headers, { key: '', value: '' }] });
  const removeHeader = (idx: number) => patch({ headers: cfg.headers.filter((_, i) => i !== idx) });

  return (
    <>
      <div>
        <SectionLabel>URL</SectionLabel>
        <input
          className="input"
          value={cfg.url}
          onChange={(e) => patch({ url: e.target.value })}
          placeholder="https://hooks.example.com/abc123"
        />
      </div>
      <div>
        <SectionLabel>Method</SectionLabel>
        <select
          className="input"
          value={cfg.method}
          onChange={(e) => patch({ method: e.target.value as typeof cfg.method })}
        >
          <option value="POST">POST</option>
          <option value="PUT">PUT</option>
        </select>
      </div>
      <div>
        <SectionLabel>Headers</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {cfg.headers.map((h, idx) => (
            <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input
                className="input"
                value={h.key}
                onChange={(e) => setHeader(idx, { key: e.target.value })}
                placeholder="Header name"
                style={{ flex: 1 }}
              />
              <input
                className="input"
                value={h.value}
                onChange={(e) => setHeader(idx, { value: e.target.value })}
                placeholder="Value"
                style={{ flex: 1 }}
              />
              <button
                onClick={() => removeHeader(idx)}
                title="Remove header"
                style={{
                  height: 36, width: 36, padding: 0,
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 8,
                  color: 'var(--text-dim)',
                  cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                <IconTrash size={14} />
              </button>
            </div>
          ))}
          <button
            onClick={addHeader}
            style={{
              alignSelf: 'flex-start',
              padding: '6px 12px',
              fontSize: 12, fontWeight: 600,
              background: 'transparent',
              border: '1px dashed var(--border)',
              borderRadius: 8,
              color: 'var(--text-dim)',
              cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4
            }}
          >
            <IconPlus size={12} /> Add header
          </button>
        </div>
      </div>
      <div>
        <SectionLabel>Payload</SectionLabel>
        <textarea
          className="input mono"
          value={cfg.payload}
          onChange={(e) => patch({ payload: e.target.value })}
          placeholder='{"key":"value"}'
          style={{ minHeight: 120, resize: 'vertical' }}
        />
      </div>
    </>
  );
}

// ---------- Twitch action sub-forms ----------

function TwitchApiNote() {
  return (
    <div
      className="dim"
      style={{
        fontSize: 11.5,
        padding: '10px 12px',
        borderRadius: 8,
        border: '1px dashed var(--border)',
        lineHeight: 1.45
      }}
    >
      Calls the Twitch Helix API using your account's access token from BotOfTheSpecter. Execution wires up once Triggers exist.
    </div>
  );
}

function ToggleRedemptionForm({
  body, onChange
}: { body: Extract<ActionBody, { type: 'toggle_redemption' }>; onChange: (b: ActionBody) => void }) {
  const cfg = body.config;
  const patch = (next: Partial<typeof cfg>) => onChange({ type: 'toggle_redemption', config: { ...cfg, ...next } });
  return (
    <>
      <div>
        <SectionLabel>Reward ID</SectionLabel>
        <input
          className="input mono"
          value={cfg.rewardId}
          onChange={(e) => patch({ rewardId: e.target.value })}
          placeholder="<paste a Channel Points reward id>"
        />
        <div className="dim" style={{ fontSize: 11, marginTop: 4, padding: '0 2px' }}>
          Becomes a picker once the Channel Points screen lists rewards.
        </div>
      </div>
      <div>
        <SectionLabel>Reward Name (optional)</SectionLabel>
        <input
          className="input"
          value={cfg.rewardName}
          onChange={(e) => patch({ rewardName: e.target.value })}
          placeholder="Friendly name for the row"
        />
      </div>
      <div>
        <SectionLabel>Mode</SectionLabel>
        <select
          className="input"
          value={cfg.mode}
          onChange={(e) => patch({ mode: e.target.value as typeof cfg.mode })}
        >
          <option value="enable">Enable</option>
          <option value="disable">Disable</option>
          <option value="toggle">Toggle</option>
        </select>
      </div>
      <TwitchApiNote />
    </>
  );
}

function RunAdsForm({
  body, onChange
}: { body: Extract<ActionBody, { type: 'run_ads' }>; onChange: (b: ActionBody) => void }) {
  const cfg = body.config;
  const patch = (next: Partial<typeof cfg>) => onChange({ type: 'run_ads', config: { ...cfg, ...next } });
  return (
    <>
      <div>
        <SectionLabel>Length</SectionLabel>
        <select
          className="input"
          value={cfg.length}
          onChange={(e) => patch({ length: Number(e.target.value) as typeof cfg.length })}
        >
          <option value={30}>30 seconds</option>
          <option value={60}>1 minute</option>
          <option value={90}>1m 30s</option>
          <option value={120}>2 minutes</option>
          <option value={150}>2m 30s</option>
          <option value={180}>3 minutes</option>
        </select>
      </div>
      <TwitchApiNote />
    </>
  );
}

function CreateMarkerForm({
  body, onChange
}: { body: Extract<ActionBody, { type: 'create_marker' }>; onChange: (b: ActionBody) => void }) {
  const cfg = body.config;
  const patch = (next: Partial<typeof cfg>) => onChange({ type: 'create_marker', config: { ...cfg, ...next } });
  return (
    <>
      <div>
        <SectionLabel>Description (optional, max 140 chars)</SectionLabel>
        <input
          className="input"
          value={cfg.description}
          maxLength={140}
          onChange={(e) => patch({ description: e.target.value })}
          placeholder="e.g. epic play"
        />
      </div>
      <TwitchApiNote />
    </>
  );
}

function StartEndPollForm({
  body, onChange
}: { body: Extract<ActionBody, { type: 'start_end_poll' }>; onChange: (b: ActionBody) => void }) {
  const cfg = body.config;
  const patch = (next: Partial<typeof cfg>) => onChange({ type: 'start_end_poll', config: { ...cfg, ...next } });
  const setChoice = (idx: number, value: string) => {
    const choices = cfg.choices.map((c, i) => (i === idx ? value : c));
    patch({ choices });
  };
  const addChoice = () => {
    if (cfg.choices.length >= 5) return;
    patch({ choices: [...cfg.choices, ''] });
  };
  const removeChoice = (idx: number) => {
    if (cfg.choices.length <= 2) return;
    patch({ choices: cfg.choices.filter((_, i) => i !== idx) });
  };
  return (
    <>
      <div>
        <SectionLabel>Mode</SectionLabel>
        <select
          className="input"
          value={cfg.mode}
          onChange={(e) => patch({ mode: e.target.value as typeof cfg.mode })}
        >
          <option value="start">Start a poll</option>
          <option value="end">End the active poll</option>
        </select>
      </div>
      {cfg.mode === 'end' ? (
        <div className="dim" style={{ fontSize: 11.5, padding: '0 2px' }}>
          Ends whatever poll is currently active on the channel — no further configuration needed.
        </div>
      ) : (
        <>
          <div>
            <SectionLabel>Title (max 60 chars)</SectionLabel>
            <input
              className="input"
              value={cfg.title}
              maxLength={60}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="Poll question"
            />
          </div>
          <div>
            <SectionLabel>Choices (2–5)</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cfg.choices.map((c, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    className="input"
                    value={c}
                    maxLength={25}
                    onChange={(e) => setChoice(idx, e.target.value)}
                    placeholder={`Choice ${idx + 1}`}
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={() => removeChoice(idx)}
                    disabled={cfg.choices.length <= 2}
                    title="Remove choice"
                    style={{
                      height: 36, width: 36, padding: 0,
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: 'var(--text-dim)',
                      cursor: cfg.choices.length <= 2 ? 'default' : 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                      opacity: cfg.choices.length <= 2 ? 0.5 : 1
                    }}
                  >
                    <IconTrash size={14} />
                  </button>
                </div>
              ))}
              {cfg.choices.length < 5 && (
                <button
                  onClick={addChoice}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '6px 12px',
                    fontSize: 12, fontWeight: 600,
                    background: 'transparent',
                    border: '1px dashed var(--border)',
                    borderRadius: 8,
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 4
                  }}
                >
                  <IconPlus size={12} /> Add choice
                </button>
              )}
            </div>
          </div>
          <div>
            <SectionLabel>Duration (seconds)</SectionLabel>
            <input
              className="input"
              type="number"
              min={15}
              max={1800}
              value={cfg.durationSeconds}
              onChange={(e) => patch({ durationSeconds: numOrKeep(e.target.value, cfg.durationSeconds) })}
            />
          </div>
          <div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={cfg.channelPointsVotingEnabled}
                onChange={(e) => patch({ channelPointsVotingEnabled: e.target.checked })}
              />
              Enable Channel Points voting
            </label>
          </div>
          {cfg.channelPointsVotingEnabled && (
            <div>
              <SectionLabel>Channel Points per vote</SectionLabel>
              <input
                className="input"
                type="number"
                min={1}
                max={1000000}
                value={cfg.channelPointsPerVote}
                onChange={(e) => patch({ channelPointsPerVote: numOrKeep(e.target.value, cfg.channelPointsPerVote) })}
              />
            </div>
          )}
        </>
      )}
      <TwitchApiNote />
    </>
  );
}

function StartCancelPredictionForm({
  body, onChange
}: { body: Extract<ActionBody, { type: 'start_cancel_prediction' }>; onChange: (b: ActionBody) => void }) {
  const cfg = body.config;
  const patch = (next: Partial<typeof cfg>) => onChange({ type: 'start_cancel_prediction', config: { ...cfg, ...next } });
  const setOutcome = (idx: number, value: string) => {
    const outcomes = cfg.outcomes.map((o, i) => (i === idx ? value : o));
    patch({ outcomes });
  };
  const addOutcome = () => {
    if (cfg.outcomes.length >= 10) return;
    patch({ outcomes: [...cfg.outcomes, ''] });
  };
  const removeOutcome = (idx: number) => {
    if (cfg.outcomes.length <= 2) return;
    patch({ outcomes: cfg.outcomes.filter((_, i) => i !== idx) });
  };
  return (
    <>
      <div>
        <SectionLabel>Mode</SectionLabel>
        <select
          className="input"
          value={cfg.mode}
          onChange={(e) => patch({ mode: e.target.value as typeof cfg.mode })}
        >
          <option value="start">Start a prediction</option>
          <option value="cancel">Cancel the active prediction</option>
        </select>
      </div>
      {cfg.mode === 'cancel' ? (
        <div className="dim" style={{ fontSize: 11.5, padding: '0 2px' }}>
          Cancels the currently-active prediction on the channel — no further configuration needed.
        </div>
      ) : (
        <>
          <div>
            <SectionLabel>Title (max 45 chars)</SectionLabel>
            <input
              className="input"
              value={cfg.title}
              maxLength={45}
              onChange={(e) => patch({ title: e.target.value })}
              placeholder="Prediction question"
            />
          </div>
          <div>
            <SectionLabel>Outcomes (2–10)</SectionLabel>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {cfg.outcomes.map((o, idx) => (
                <div key={idx} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input
                    className="input"
                    value={o}
                    maxLength={25}
                    onChange={(e) => setOutcome(idx, e.target.value)}
                    placeholder={`Outcome ${idx + 1}`}
                    style={{ flex: 1 }}
                  />
                  <button
                    onClick={() => removeOutcome(idx)}
                    disabled={cfg.outcomes.length <= 2}
                    title="Remove outcome"
                    style={{
                      height: 36, width: 36, padding: 0,
                      background: 'transparent',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      color: 'var(--text-dim)',
                      cursor: cfg.outcomes.length <= 2 ? 'default' : 'pointer',
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                      opacity: cfg.outcomes.length <= 2 ? 0.5 : 1
                    }}
                  >
                    <IconTrash size={14} />
                  </button>
                </div>
              ))}
              {cfg.outcomes.length < 10 && (
                <button
                  onClick={addOutcome}
                  style={{
                    alignSelf: 'flex-start',
                    padding: '6px 12px',
                    fontSize: 12, fontWeight: 600,
                    background: 'transparent',
                    border: '1px dashed var(--border)',
                    borderRadius: 8,
                    color: 'var(--text-dim)',
                    cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: 4
                  }}
                >
                  <IconPlus size={12} /> Add outcome
                </button>
              )}
            </div>
          </div>
          <div>
            <SectionLabel>Prediction window (seconds)</SectionLabel>
            <input
              className="input"
              type="number"
              min={30}
              max={1800}
              value={cfg.predictionWindowSeconds}
              onChange={(e) => patch({ predictionWindowSeconds: numOrKeep(e.target.value, cfg.predictionWindowSeconds) })}
            />
          </div>
        </>
      )}
      <TwitchApiNote />
    </>
  );
}

function ToggleSlowModeForm({
  body, onChange
}: { body: Extract<ActionBody, { type: 'toggle_slow_mode' }>; onChange: (b: ActionBody) => void }) {
  const cfg = body.config;
  const patch = (next: Partial<typeof cfg>) => onChange({ type: 'toggle_slow_mode', config: { ...cfg, ...next } });
  return (
    <>
      <div>
        <SectionLabel>Mode</SectionLabel>
        <select
          className="input"
          value={cfg.mode}
          onChange={(e) => patch({ mode: e.target.value as typeof cfg.mode })}
        >
          <option value="on">On</option>
          <option value="off">Off</option>
          <option value="toggle">Toggle</option>
        </select>
      </div>
      {cfg.mode === 'on' && (
        <div>
          <SectionLabel>Wait time (seconds, 3–120)</SectionLabel>
          <input
            className="input"
            type="number"
            min={3}
            max={120}
            value={cfg.waitTimeSeconds}
            onChange={(e) => patch({ waitTimeSeconds: numOrKeep(e.target.value, cfg.waitTimeSeconds) })}
          />
        </div>
      )}
      <TwitchApiNote />
    </>
  );
}

function CreateClipForm({
  body, onChange
}: { body: Extract<ActionBody, { type: 'create_clip' }>; onChange: (b: ActionBody) => void }) {
  const cfg = body.config;
  const patch = (next: Partial<typeof cfg>) => onChange({ type: 'create_clip', config: { ...cfg, ...next } });
  return (
    <>
      <div>
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={cfg.hasDelay}
            onChange={(e) => patch({ hasDelay: e.target.checked })}
          />
          Use Twitch's standard delay before capturing the clip
        </label>
      </div>
      <TwitchApiNote />
    </>
  );
}

// ---------- small reusable bits (replicated from Commands.tsx; keep Commands.tsx untouched) ----------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="dim" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.02em', marginBottom: 6, padding: '0 2px' }}>{children}</div>;
}

function SearchBar({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div style={{ position: 'relative', marginBottom: 10 }}>
      <IconSearch size={14} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)', pointerEvents: 'none' }} />
      <input
        className="input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ width: '100%', paddingLeft: 32 }}
      />
    </div>
  );
}

function ListRow({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  const interactive = Boolean(onClick);
  return (
    <button
      onClick={onClick}
      disabled={!interactive}
      style={{
        textAlign: 'left',
        width: '100%',
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 14px',
        marginBottom: 8,
        background: 'var(--surface-2, rgba(255,255,255,0.04))',
        border: '1px solid var(--border)',
        borderRadius: 10,
        cursor: interactive ? 'pointer' : 'default',
        color: 'var(--text)'
      }}
    >
      {children}
    </button>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <div className="dim" style={{ fontSize: 12, padding: '14px 4px' }}>{text}</div>;
}

function StatusToggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <div>
      <SectionLabel>Status</SectionLabel>
      <div style={{ display: 'flex', gap: 8 }}>
        <Pill active={enabled}  color="var(--success)"  onClick={() => onChange(true)}>Enabled</Pill>
        <Pill active={!enabled} color="var(--text-dim)" onClick={() => onChange(false)}>Disabled</Pill>
      </div>
    </div>
  );
}

function Pill({ active, color, onClick, children }: { active: boolean; color: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontSize: 12, fontWeight: 700,
        padding: '8px 16px',
        borderRadius: 8,
        border: '1px solid ' + (active ? color : 'var(--border)'),
        background: active ? 'color-mix(in oklab, ' + color + ' 22%, transparent)' : 'transparent',
        color: active ? color : 'var(--text-dim)',
        cursor: 'pointer'
      }}
    >{children}</button>
  );
}

function PrimaryButton({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        marginTop: 4,
        padding: '12px 16px',
        fontSize: 14, fontWeight: 700,
        background: disabled ? 'var(--surface-2, rgba(255,255,255,0.04))' : 'var(--primary)',
        color: disabled ? 'var(--text-dim)' : '#fff',
        border: 0,
        borderRadius: 10,
        cursor: disabled ? 'default' : 'pointer'
      }}
    >{children}</button>
  );
}
