import { NAV_GROUPS, type ScreenId } from './nav';
import { ICON_URL } from '@shared/constants';
import type { AccountInfo } from '@shared/ipc';

type ObsState = 'connected' | 'connecting' | 'disconnected' | 'error';

export function Sidebar({
  expanded, active, onSelect, obsState, account
}: {
  expanded: boolean;
  active: ScreenId;
  onSelect: (id: ScreenId) => void;
  obsState: ObsState;
  account?: AccountInfo | null;
}) {
  return (
    <aside className="sidebar" data-expanded={expanded ? 'true' : 'false'}>
      <div className="sb-brand">
        <div className="sb-logo"><img src={ICON_URL} alt="" draggable={false} /></div>
        <div className="sb-name">
          BotOfTheSpecter
          <small>Desktop · v2.0</small>
        </div>
      </div>

      <div className="sb-nav">
        {NAV_GROUPS.map((grp) => (
          <div key={grp.label}>
            <div className="sb-section-label">{grp.label}</div>
            {grp.items.map((it) => {
              const Ico = it.icon;
              let badge = null;
              if (it.badge === 'obs') {
                const color =
                  obsState === 'connected' ? 'var(--success)' :
                  obsState === 'connecting' ? 'var(--warning)' :
                  obsState === 'error' ? 'var(--error)' : undefined;
                badge = color
                  ? <span className="sb-badge" style={{ background: color }}>{obsState === 'error' ? '!' : '●'}</span>
                  : <span className="sb-badge muted">●</span>;
              }
              return (
                <button key={it.id} className="sb-item" data-active={active === it.id}
                        onClick={() => onSelect(it.id)} title={it.label}>
                  <span className="sb-ico"><Ico size={18} /></span>
                  <span className="sb-label">{it.label}</span>
                  {badge}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      <div className="sb-footer">
        <div className="sb-avatar">
          {account?.profileImage
            ? <img src={account.profileImage} alt="" />
            : account ? account.displayName.slice(0, 2).toUpperCase() : '··'}
        </div>
        <div className="sb-user">
          <b>{account ? account.displayName : 'Not signed in'}</b>
          <small>{account ? `@${account.username}` : 'Add API key in Settings'}</small>
        </div>
      </div>
    </aside>
  );
}
