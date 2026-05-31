import React from 'react';
import { useCommands } from '../state/useCommands';
import type { BuiltinCommand, CustomCommand, UserCommand, CommandsSnapshot } from '@shared/ipc';
import { IconChevronLeft, IconChevronRight, IconEdit, IconBox, IconUsers, IconSearch } from '../icons';

// ---- internal "router" — the Commands area is a 3-deep navigation that mirrors the mobile app:
//   index → list → detail. We model the trip as a stack so the header can show breadcrumbs
//   and a Back button without coupling the body to its history.

type View =
  | { kind: 'index' }
  | { kind: 'builtin-list' }
  | { kind: 'builtin-detail'; name: string }
  | { kind: 'custom-list' }
  | { kind: 'custom-detail'; name: string }
  | { kind: 'user-users' }
  | { kind: 'user-detail'; ownerLogin: string };

export function ScreenCommands() {
  const { snap, refresh } = useCommands();
  const [stack, setStack] = React.useState<View[]>([{ kind: 'index' }]);
  const view = stack[stack.length - 1];

  const push = (v: View) => setStack((s) => [...s, v]);
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));

  return (
    <div className="screen" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="card" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <CommandsHeader view={view} stack={stack} onBack={back} onRefresh={refresh} snap={snap} />
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', paddingRight: 4 }}>
          <Body view={view} push={push} snap={snap} />
        </div>
      </div>
    </div>
  );
}

// ---------- header (breadcrumb + back) ----------

function CommandsHeader({ view, stack, onBack, onRefresh, snap }: {
  view: View; stack: View[]; onBack: () => void; onRefresh: () => Promise<void>; snap: CommandsSnapshot;
}) {
  const [refreshing, setRefreshing] = React.useState(false);
  const doRefresh = async () => {
    setRefreshing(true);
    // Errors surface via snap.state ('error' chip); catch here just prevents an
    // unhandled rejection from the onClick handler.
    try { await onRefresh(); } catch { /* surfaced via snap.state */ } finally { setRefreshing(false); }
  };
  const title = titleFor(view, snap);
  const parentLabel = stack.length > 1 ? titleFor(stack[stack.length - 2], snap) : null;

  return (
    <div className="card-head" style={{ flexShrink: 0, gap: 10, alignItems: 'center', marginBottom: 12 }}>
      {parentLabel
        ? <button className="btn btn-sm" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <IconChevronLeft size={14} /> {parentLabel}
          </button>
        : null}
      <h3 style={{ margin: 0 }}>{title}</h3>
      {snap.state === 'error' && <span className="chip warn" title={snap.error}>error</span>}
      <button className="btn btn-sm" onClick={doRefresh} disabled={refreshing} style={{ marginLeft: 'auto' }}>
        {refreshing ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  );
}

function titleFor(v: View, snap: CommandsSnapshot): string {
  switch (v.kind) {
    case 'index': return 'Commands';
    case 'builtin-list': return 'Specter Builtin Commands';
    case 'builtin-detail': return `!${v.name}`;
    case 'custom-list': return 'My Custom Commands';
    case 'custom-detail': return `Edit Command`;
    case 'user-users': return 'User Custom Commands';
    case 'user-detail': {
      const u = snap.user.find((c) => c.ownerLogin === v.ownerLogin);
      return u?.ownerLogin ?? v.ownerLogin;
    }
  }
}

// ---------- body switch ----------

function Body({ view, push, snap }: { view: View; push: (v: View) => void; snap: CommandsSnapshot }) {
  switch (view.kind) {
    case 'index':          return <IndexView push={push} snap={snap} />;
    case 'builtin-list':   return <BuiltinListView snap={snap} push={push} />;
    case 'builtin-detail': return <BuiltinDetailView name={view.name} snap={snap} />;
    case 'custom-list':    return <CustomListView snap={snap} push={push} />;
    case 'custom-detail':  return <CustomDetailView name={view.name} snap={snap} />;
    case 'user-users':     return <UserUsersView snap={snap} push={push} />;
    case 'user-detail':    return <UserDetailView ownerLogin={view.ownerLogin} snap={snap} />;
  }
}

// ---------- index page (3 category cards) ----------

function IndexView({ push, snap }: { push: (v: View) => void; snap: CommandsSnapshot }) {
  const userOwners = new Set(snap.user.map((u) => u.ownerLogin)).size;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="dim" style={{ fontSize: 13, padding: '0 4px 6px' }}>Manage your bot commands.</div>
      <CategoryCard
        title="My Custom Commands"
        subtitle="Your commands you've added to the bot"
        count={snap.custom.length}
        countLabel={snap.custom.length === 1 ? 'command' : 'commands'}
        tint="var(--primary)"
        icon={<IconEdit size={20} />}
        onClick={() => push({ kind: 'custom-list' })}
      />
      <CategoryCard
        title="Specter Builtin Commands"
        subtitle="The commands fully builtin by default"
        count={snap.builtin.length}
        countLabel={snap.builtin.length === 1 ? 'command' : 'commands'}
        tint="var(--success)"
        icon={<IconBox size={20} />}
        onClick={() => push({ kind: 'builtin-list' })}
      />
      <CategoryCard
        title="User Custom Commands"
        subtitle="Commands added by users in your chat"
        count={snap.user.length}
        countLabel={`from ${userOwners} ${userOwners === 1 ? 'viewer' : 'viewers'}`}
        tint="var(--secondary, #5cb6ff)"
        icon={<IconUsers size={20} />}
        onClick={() => push({ kind: 'user-users' })}
      />
    </div>
  );
}

function CategoryCard({ title, subtitle, count, countLabel, tint, icon, onClick }: {
  title: string; subtitle: string; count: number; countLabel: string; tint: string;
  icon: React.ReactNode; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '14px 16px',
        background: 'var(--surface-2, rgba(255,255,255,0.04))',
        border: '1px solid var(--border)',
        borderRadius: 12,
        cursor: 'pointer',
        color: 'var(--text)'
      }}
    >
      <span style={{
        width: 44, height: 44, borderRadius: 10,
        background: `color-mix(in oklab, ${tint} 18%, transparent)`,
        color: tint,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0
      }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{title}</div>
        <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>{subtitle}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>{count}</div>
        <div className="dim" style={{ fontSize: 10.5 }}>{countLabel}</div>
      </div>
      <IconChevronRight size={16} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
    </button>
  );
}

// ---------- shared search bar ----------

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

// ---------- list rows ----------

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

// ---------- built-in list ----------

function BuiltinListView({ snap, push }: { snap: CommandsSnapshot; push: (v: View) => void }) {
  const [q, setQ] = React.useState('');
  const filtered = React.useMemo(() => filterBuiltin(snap.builtin, q.toLowerCase().trim()), [snap.builtin, q]);
  return (
    <>
      <SearchBar value={q} onChange={setQ} placeholder="Search commands…" />
      {filtered.length === 0
        ? <EmptyRow text={q ? 'No commands match the search.' : 'No commands loaded.'} />
        : filtered.map((c) => (
            <ListRow key={c.name} onClick={() => push({ kind: 'builtin-detail', name: c.name })}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--primary)' }}>!{c.name}</div>
                <div className="dim" style={{ fontSize: 11, marginTop: 2 }}>{c.forceLevel ?? 'everyone'}</div>
              </div>
              <span className={`chip ${c.enabled ? 'good' : ''}`} style={{ fontSize: 10 }}>{c.enabled ? 'Enabled' : 'Disabled'}</span>
              <IconChevronRight size={14} style={{ color: 'var(--text-dim)' }} />
            </ListRow>
          ))}
    </>
  );
}

// ---------- built-in detail (editable — PUT /v2/builtin-commands/update) ----------

// Single source of truth for permission tokens. The label is the human-readable
// chip text; the value is what the API expects in the `permission` query param.
const PERMISSIONS: { value: string; label: string }[] = [
  { value: 'everyone',    label: 'Everyone' },
  { value: 'vip',         label: 'VIPs' },
  { value: 'subscriber',  label: 'All Subs' },
  { value: 'tier_1',      label: 'Tier 1 Sub' },
  { value: 'tier_2',      label: 'Tier 2 Sub' },
  { value: 'tier_3',      label: 'Tier 3 Sub' },
  { value: 'mod',         label: 'Mods' },
  { value: 'broadcaster', label: 'Broadcaster' }
];

function BuiltinDetailView({ name, snap }: { name: string; snap: CommandsSnapshot }) {
  const c = snap.builtin.find((b) => b.name === name);
  // Local edit state — initialised from the command, reset whenever we navigate to a different command.
  const [perm, setPerm] = React.useState(() => (c?.forceLevel ?? 'everyone').toLowerCase());
  const [enabled, setEnabled] = React.useState(() => c?.enabled ?? true);
  const [saving, setSaving] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Re-seed the editable values when the command's identity OR its persisted
  // values change (e.g. an external refresh updates this command), so the panel
  // never shows stale enabled/permission.
  React.useEffect(() => {
    if (!c) return;
    setPerm((c.forceLevel ?? 'everyone').toLowerCase());
    setEnabled(c.enabled);
  }, [c?.name, c?.enabled, c?.forceLevel]);
  // Clear feedback only on navigation to a different command — not on a value
  // re-seed, so the "Saved." message survives the post-save snapshot update.
  React.useEffect(() => { setFeedback(null); }, [c?.name]);

  if (!c) return <EmptyRow text="Command not found." />;

  const dirty = perm !== (c.forceLevel ?? 'everyone').toLowerCase() || enabled !== c.enabled;
  const doSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      const ok = await window.api.commands.updateBuiltin(c.name, {
        status: enabled ? 'Enabled' : 'Disabled',
        permission: perm
      });
      setFeedback(ok ? { kind: 'ok', text: 'Saved.' } : { kind: 'err', text: 'Save failed. Check the API key and try again.' });
    } catch (err) {
      setFeedback({ kind: 'err', text: err instanceof Error ? err.message : 'Save failed.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <BigNameBanner name={c.name} />
      {c.description && (
        <div style={{ fontSize: 12.5, color: 'var(--text-dim)', padding: '0 4px' }}>{c.description}</div>
      )}
      <PermissionPills selected={perm} onChange={setPerm} />
      <StatusToggle enabled={enabled} onChange={setEnabled} />
      {c.aliases.length > 0 && (
        <div>
          <SectionLabel>Aliases</SectionLabel>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {c.aliases.map((a) => (
              <span key={a} style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, padding: '4px 8px', border: '1px solid var(--border)', borderRadius: 8 }}>!{a}</span>
            ))}
          </div>
        </div>
      )}
      {c.usage.length > 0 && (
        <div>
          <SectionLabel>Usage</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {c.usage.map((u, i) => (
              <code key={i} style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, padding: '6px 10px', background: 'var(--surface-2, rgba(255,255,255,0.04))', border: '1px solid var(--border)', borderRadius: 6 }}>{u}</code>
            ))}
          </div>
        </div>
      )}
      <PrimaryButton onClick={doSave} disabled={!dirty || saving}>
        {saving ? 'Saving…' : 'Save Changes'}
      </PrimaryButton>
      {feedback && (
        <div className={feedback.kind === 'ok' ? 'chip good' : 'chip warn'} style={{ alignSelf: 'center', fontSize: 11 }}>
          {feedback.text}
        </div>
      )}
    </div>
  );
}

// ---------- custom list ----------

function CustomListView({ snap, push }: { snap: CommandsSnapshot; push: (v: View) => void }) {
  const [q, setQ] = React.useState('');
  const filtered = React.useMemo(() => filterCustom(snap.custom, q.toLowerCase().trim()), [snap.custom, q]);
  return (
    <>
      <SearchBar value={q} onChange={setQ} placeholder="Search commands…" />
      {filtered.length === 0
        ? <EmptyRow text={q ? 'No commands match the search.' : 'No custom commands yet. Create one with !addcommand in chat or via the dashboard.'} />
        : filtered.map((c) => (
            <ListRow key={c.name} onClick={() => push({ kind: 'custom-detail', name: c.name })}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--primary)' }}>!{c.name}</div>
                <div style={{ fontSize: 12, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.response}</div>
                <div className="dim" style={{ fontSize: 11, marginTop: 3 }}>Cooldown: {c.cooldown}s</div>
              </div>
              <IconChevronRight size={14} style={{ color: 'var(--text-dim)', flexShrink: 0 }} />
            </ListRow>
          ))}
    </>
  );
}

// ---------- custom detail (read-only — edit/delete pending API) ----------

function CustomDetailView({ name, snap }: { name: string; snap: CommandsSnapshot }) {
  const c = snap.custom.find((x) => x.name === name);
  if (!c) return <EmptyRow text="Command not found." />;
  const perm = c.permission.toLowerCase();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <SectionLabel>Trigger (without !)</SectionLabel>
        <ReadOnlyField value={c.name} mono />
      </div>
      <div>
        <SectionLabel>Response</SectionLabel>
        <ReadOnlyField value={c.response} multiline />
      </div>
      <div>
        <SectionLabel>Cooldown (seconds)</SectionLabel>
        <ReadOnlyField value={String(c.cooldown)} />
      </div>
      <PermissionPills selected={perm} />
      <StatusToggle enabled={c.enabled} />
      <ReadOnlyNotice />
    </div>
  );
}

// ---------- user — list of users (step 1) ----------

interface UserGroup { ownerLogin: string; ownerProfileImage?: string; commands: UserCommand[] }

function groupByOwner(list: UserCommand[]): UserGroup[] {
  const map = new Map<string, UserGroup>();
  for (const u of list) {
    const g = map.get(u.ownerLogin) ?? { ownerLogin: u.ownerLogin, ownerProfileImage: u.ownerProfileImage, commands: [] };
    g.commands.push(u);
    map.set(u.ownerLogin, g);
  }
  return [...map.values()].sort((a, b) => a.ownerLogin.localeCompare(b.ownerLogin, undefined, { sensitivity: 'base' }));
}

function UserUsersView({ snap, push }: { snap: CommandsSnapshot; push: (v: View) => void }) {
  const [q, setQ] = React.useState('');
  const groups = React.useMemo(() => groupByOwner(snap.user), [snap.user]);
  const filtered = React.useMemo(() => {
    const s = q.toLowerCase().trim();
    if (!s) return groups;
    return groups.filter((g) => g.ownerLogin.toLowerCase().includes(s)
      || g.commands.some((c) => c.name.toLowerCase().includes(s) || c.response.toLowerCase().includes(s)));
  }, [groups, q]);
  const total = snap.user.length;
  return (
    <>
      <SearchBar value={q} onChange={setQ} placeholder="Search users…" />
      <div className="dim" style={{ fontSize: 11.5, padding: '0 4px 8px' }}>
        {groups.length} {groups.length === 1 ? 'user' : 'users'} · {total} {total === 1 ? 'command' : 'commands'}
      </div>
      {filtered.length === 0
        ? <EmptyRow text={q ? 'No users match the search.' : 'No viewers have set up personal commands yet.'} />
        : filtered.map((g) => (
            <ListRow key={g.ownerLogin} onClick={() => push({ kind: 'user-detail', ownerLogin: g.ownerLogin })}>
              <Avatar src={g.ownerProfileImage} />
              <div style={{ flex: 1, minWidth: 0, fontWeight: 700, fontSize: 13 }}>{g.ownerLogin}</div>
              <span style={{
                fontSize: 11, fontWeight: 600,
                padding: '3px 9px', borderRadius: 999,
                background: 'var(--surface-3, rgba(255,255,255,0.07))',
                color: 'var(--text-dim)'
              }}>{g.commands.length} {g.commands.length === 1 ? 'cmd' : 'cmds'}</span>
              <IconChevronRight size={14} style={{ color: 'var(--text-dim)' }} />
            </ListRow>
          ))}
    </>
  );
}

// ---------- user — one viewer's commands (step 2) ----------

function UserDetailView({ ownerLogin, snap }: { ownerLogin: string; snap: CommandsSnapshot }) {
  const groups = React.useMemo(() => groupByOwner(snap.user), [snap.user]);
  const group = groups.find((g) => g.ownerLogin === ownerLogin);
  if (!group) return <EmptyRow text="No commands found for this user." />;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 4px 14px' }}>
        <Avatar src={group.ownerProfileImage} size={32} />
        <div>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{group.ownerLogin}</div>
          <div className="dim" style={{ fontSize: 12 }}>
            {group.commands.length} {group.commands.length === 1 ? 'command' : 'commands'}
          </div>
        </div>
      </div>
      {group.commands.map((c) => (
        <ListRow key={`${ownerLogin}-${c.name}`}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 13, color: 'var(--primary)' }}>!{c.name}</div>
            <div style={{ fontSize: 12, marginTop: 3, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{c.response}</div>
            <div className="dim" style={{ fontSize: 11, marginTop: 3 }}>{c.cooldown}s cooldown</div>
          </div>
          <span className={`chip ${c.enabled ? 'good' : ''}`} style={{ fontSize: 10, flexShrink: 0 }}>{c.enabled ? 'Enabled' : 'Disabled'}</span>
        </ListRow>
      ))}
    </>
  );
}

// ---------- small reusable bits ----------

function BigNameBanner({ name }: { name: string }) {
  return (
    <div style={{
      fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 22,
      color: 'var(--primary)',
      padding: '14px 16px',
      background: 'var(--surface-2, rgba(255,255,255,0.04))',
      border: '1px solid var(--border)',
      borderRadius: 10
    }}>!{name}</div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="dim" style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.02em', marginBottom: 6, padding: '0 2px' }}>{children}</div>;
}

function PermissionPills({ selected, onChange }: { selected: string; onChange?: (v: string) => void }) {
  const readonly = !onChange;
  return (
    <div>
      <SectionLabel>Permission</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {PERMISSIONS.map((p) => {
          const active = p.value === selected;
          const baseStyle: React.CSSProperties = {
            textAlign: 'center',
            fontSize: 11.5, fontWeight: 600,
            padding: '8px 6px',
            borderRadius: 8,
            border: '1px solid ' + (active ? 'var(--success)' : 'var(--border)'),
            background: active ? 'var(--success-soft)' : 'var(--surface-2, rgba(255,255,255,0.04))',
            color: active ? '#7ee5a4' : 'var(--text-dim)',
            cursor: readonly ? 'default' : 'pointer'
          };
          return readonly
            ? <span key={p.value} style={baseStyle}>{p.label}</span>
            : <button key={p.value} onClick={() => onChange(p.value)} style={baseStyle}>{p.label}</button>;
        })}
      </div>
    </div>
  );
}

function StatusToggle({ enabled, onChange }: { enabled: boolean; onChange?: (v: boolean) => void }) {
  const readonly = !onChange;
  return (
    <div>
      <SectionLabel>Status</SectionLabel>
      <div style={{ display: 'flex', gap: 8 }}>
        <Pill active={enabled}  color="var(--success)"  onClick={onChange ? () => onChange(true)  : undefined}>Enabled</Pill>
        <Pill active={!enabled} color="var(--text-dim)" onClick={onChange ? () => onChange(false) : undefined}>Disabled</Pill>
        {readonly && <span /* spacer so flex doesn't collapse */ />}
      </div>
    </div>
  );
}

function Pill({ active, color, onClick, children }: { active: boolean; color: string; onClick?: () => void; children: React.ReactNode }) {
  const style: React.CSSProperties = {
    fontSize: 12, fontWeight: 700,
    padding: '8px 16px',
    borderRadius: 8,
    border: '1px solid ' + (active ? color : 'var(--border)'),
    background: active ? 'color-mix(in oklab, ' + color + ' 22%, transparent)' : 'transparent',
    color: active ? color : 'var(--text-dim)',
    cursor: onClick ? 'pointer' : 'default'
  };
  return onClick
    ? <button onClick={onClick} style={style}>{children}</button>
    : <span style={style}>{children}</span>;
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

function ReadOnlyField({ value, mono, multiline }: { value: string; mono?: boolean; multiline?: boolean }) {
  const base: React.CSSProperties = {
    width: '100%',
    padding: multiline ? '10px 12px' : '10px 12px',
    background: 'var(--surface-2, rgba(255,255,255,0.04))',
    border: '1px solid var(--border)',
    borderRadius: 8,
    fontFamily: mono ? 'var(--font-mono)' : undefined,
    fontSize: 13,
    color: 'var(--text)',
    whiteSpace: multiline ? 'pre-wrap' : undefined,
    wordBreak: multiline ? 'break-word' : undefined,
    minHeight: multiline ? 80 : undefined
  };
  return <div style={base}>{value}</div>;
}

function ReadOnlyNotice() {
  return (
    <div className="dim" style={{ fontSize: 11.5, padding: '12px 14px', borderRadius: 8, border: '1px dashed var(--border)', textAlign: 'center' }}>
      Read-only here — editing is in the BotOfTheSpecter dashboard for now.
    </div>
  );
}

function Avatar({ src, size = 28 }: { src?: string; size?: number }) {
  if (src) return <img src={src} alt="" width={size} height={size} style={{ borderRadius: '50%', flexShrink: 0 }} />;
  return <div style={{ width: size, height: size, borderRadius: '50%', background: 'var(--surface-3, rgba(255,255,255,0.07))', flexShrink: 0 }} />;
}

function EmptyRow({ text }: { text: string }) {
  return <div className="dim" style={{ fontSize: 12, padding: '14px 4px' }}>{text}</div>;
}

// ---------- filters ----------

function filterBuiltin(list: BuiltinCommand[], q: string): BuiltinCommand[] {
  if (!q) return list;
  return list.filter((c) =>
    c.name.toLowerCase().includes(q)
    || c.description.toLowerCase().includes(q)
    || c.aliases.some((a) => a.toLowerCase().includes(q))
  );
}
function filterCustom(list: CustomCommand[], q: string): CustomCommand[] {
  if (!q) return list;
  return list.filter((c) => c.name.toLowerCase().includes(q) || c.response.toLowerCase().includes(q));
}
