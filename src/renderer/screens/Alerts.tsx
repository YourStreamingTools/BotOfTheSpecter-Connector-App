import React from 'react';
import { useAlerts } from '../state/useAlerts';
import type { Alert, AlertKind } from '@shared/ipc';
import { IconAlerts, IconHeart, IconStar, IconBolt, IconUsers, IconPoints, IconGift, IconDot } from '../icons';

type Filter = 'all' | AlertKind;

const KIND_META: Record<AlertKind, { label: string; icon: React.ComponentType<{ size?: number }>; color: string }> = {
  follow:     { label: 'Follows',     icon: IconHeart,  color: 'var(--primary)' },
  sub:        { label: 'Subs',        icon: IconStar,   color: 'var(--secondary)' },
  cheer:      { label: 'Cheers',      icon: IconBolt,   color: 'var(--info)' },
  raid:       { label: 'Raids',       icon: IconUsers,  color: 'var(--warning)' },
  redemption: { label: 'Redemptions', icon: IconPoints, color: '#9146ff' },
  donation:   { label: 'Donations',   icon: IconGift,   color: 'var(--success)' },
  stream:     { label: 'Stream',      icon: IconDot,    color: 'var(--text-mute)' }
};

const FILTERS: Filter[] = ['all', 'follow', 'sub', 'cheer', 'raid', 'redemption', 'donation', 'stream'];

// HH:MM:SS from the receivedAt epoch.
const fmtTime = (ms: number) =>
  new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function ScreenAlerts() {
  const alerts = useAlerts();
  const [filter, setFilter] = React.useState<Filter>('all');

  const count = (f: Filter) => f === 'all' ? alerts.length : alerts.filter((a) => a.kind === f).length;
  const shown = filter === 'all' ? alerts : alerts.filter((a) => a.kind === filter);

  return (
    <div className="screen">
      <div className="row" style={{ marginBottom: 14, gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTERS.map((f) => {
          const active = filter === f;
          const label = f === 'all' ? 'All' : KIND_META[f].label;
          return (
            <button key={f} className="btn btn-sm" onClick={() => setFilter(f)} style={{
              background: active ? 'var(--primary-soft)' : 'var(--bg-elev)',
              borderColor: active ? 'var(--primary)' : 'var(--border)',
              color: active ? 'var(--text)' : 'var(--text-dim)'
            }}>
              {label} <span className="mono" style={{ marginLeft: 4, opacity: 0.6 }}>{count(f)}</span>
            </button>
          );
        })}
        <span className="dim" style={{ fontSize: 12, marginLeft: 'auto' }}>Live feed · since the app connected</span>
      </div>

      <div className="card" style={{ padding: 0, background: 'var(--bg-deep)', overflow: 'hidden' }}>
        <div style={{ maxHeight: 'calc(100vh - 220px)', overflowY: 'auto', padding: '6px 0' }}>
          {shown.length === 0
            ? <Empty hasAny={alerts.length > 0} />
            : shown.map((a) => <AlertRow key={a.id} alert={a} />)}
        </div>
      </div>
    </div>
  );
}

function AlertRow({ alert }: { alert: Alert }) {
  const meta = KIND_META[alert.kind];
  const Icon = meta.icon;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px',
      borderBottom: '1px solid var(--border-soft)', color: 'var(--text)'
    }}>
      <span style={{
        width: 30, height: 30, borderRadius: 8, background: 'var(--bg-elev)', display: 'grid',
        placeItems: 'center', color: meta.color, flex: '0 0 30px'
      }}>
        <Icon size={15} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{alert.detail}</div>
        {alert.message && (
          <div className="dim" style={{ fontSize: 11.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            “{alert.message}”
          </div>
        )}
      </div>
      <span className="mono dim" style={{ fontSize: 10.5, flex: '0 0 auto' }}>{fmtTime(alert.receivedAt)}</span>
    </div>
  );
}

function Empty({ hasAny }: { hasAny: boolean }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', textAlign: 'center', padding: 48, minHeight: 220 }}>
      <div style={{ opacity: 0.5, marginBottom: 14 }}><IconAlerts size={40} /></div>
      <h3 style={{ marginBottom: 6 }}>{hasAny ? 'Nothing in this filter' : 'Waiting for alerts…'}</h3>
      <p className="dim" style={{ fontSize: 13, maxWidth: 420, lineHeight: 1.5 }}>
        {hasAny
          ? 'No alerts of this type yet — pick another filter.'
          : 'Follows, subs, cheers, raids, redemptions and donations appear here live as they happen on your stream.'}
      </p>
    </div>
  );
}
