import React from 'react';
import type { useObs } from '../../state/useObs';
import type { ObsSourceFilter } from '@shared/ipc';
import { IconCam, IconMic, IconChat, IconEye, IconEyeOff, IconDot, IconRefresh, IconBolt } from '../../icons';

type Obs = ReturnType<typeof useObs>;

const typeColor: Record<string, string> = {
  audio: 'var(--secondary)', browser: 'var(--info)', image: 'var(--primary)', video: 'var(--primary)', other: 'var(--text-mute)'
};

export function ScenesTab({ obs }: { obs: Obs }) {
  const scenes = obs.scenes;
  const [selected, setSelected] = React.useState<string | null>(null);
  const [selectedSource, setSelectedSource] = React.useState<string | null>(null);
  const [filters, setFilters] = React.useState<ObsSourceFilter[] | null>(null);
  const [filtersLoading, setFiltersLoading] = React.useState(false);
  const active = selected ?? scenes?.current ?? null;

  // Fetch filters for the currently-selected source. Refetches when the source
  // changes or when the user hits the refresh button (via a manual `tick`).
  const [refreshTick, setRefreshTick] = React.useState(0);
  React.useEffect(() => {
    if (!selectedSource) { setFilters(null); return; }
    let alive = true;
    setFiltersLoading(true);
    void window.api.obs
      .listSourceFilters(selectedSource)
      .then((f) => { if (alive) { setFilters(f); setFiltersLoading(false); } })
      // On error (OBS errored, source removed, socket dropped mid-call) clear the
      // loading flag and fall back to an empty list so the panel doesn't hang on
      // "Loading filters…" forever with an unhandled rejection.
      .catch(() => { if (alive) { setFilters([]); setFiltersLoading(false); } });
    return () => { alive = false; };
  }, [selectedSource, refreshTick]);

  // Clear the selected source when the active scene changes — its sources are different.
  React.useEffect(() => { setSelectedSource(null); }, [active]);

  // Follow the live program scene when it changes externally (OBS-side or another
  // client): drop any manual selection so the view reflects what's actually live.
  React.useEffect(() => { setSelected(null); }, [scenes?.current]);

  // Optimistic source-visibility overrides (sceneItemId → enabled), reconciled
  // away whenever the authoritative scene list refreshes.
  const [pendingSource, setPendingSource] = React.useState<Record<number, boolean>>({});
  React.useEffect(() => { setPendingSource({}); }, [scenes]);
  const toggleSourceVisibility = (id: number, next: boolean) => {
    if (!active) return;
    setPendingSource((p) => ({ ...p, [id]: next }));
    void obs.actions.toggleSource(active, id, next);
  };

  const toggleFilter = async (filterName: string, currentEnabled: boolean) => {
    if (!selectedSource) return;
    // Optimistic update so the chip flips immediately; the refetch in `finally` confirms.
    setFilters((prev) => prev?.map((f) => f.name === filterName ? { ...f, enabled: !currentEnabled } : f) ?? null);
    try {
      await window.api.obs.setSourceFilterEnabled(selectedSource, filterName, !currentEnabled);
    } catch {
      // The call failed — revert the optimistic flip so the chip reflects reality
      // (the refetch below reconciles with OBS's authoritative state regardless).
      setFilters((prev) => prev?.map((f) => f.name === filterName ? { ...f, enabled: currentEnabled } : f) ?? null);
    } finally {
      setRefreshTick((t) => t + 1);
    }
  };

  if (!scenes) {
    return <div className="card" style={{ flex: 1 }}><span className="dim">Loading scenes…</span></div>;
  }
  const sources = active ? (scenes.sources[active] ?? []) : [];

  return (
    // Fills the parent flex container's available height. Each card is itself a
    // flex column so the head stays pinned and the list scrolls inside.
    <div className="grid" style={{ gridTemplateColumns: '2fr 3fr 2fr', gap: 14, flex: 1, minWidth: 0, minHeight: 0 }}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="card-head" style={{ flexShrink: 0 }}>
          <h3>Scenes</h3>
          <span className="chip" style={{ marginLeft: 'auto' }}>{scenes.scenes.length}</span>
        </div>
        <div className="col" style={{ gap: 8, flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
          {scenes.scenes.map((name) => {
            const isActive = name === active;
            const isProgram = name === scenes.current;
            return (
              <button key={name} className="glow-on-hover" onClick={() => { setSelected(name); void obs.actions.setScene(name); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10,
                  background: isActive ? 'var(--primary-soft)' : 'var(--bg-elev)',
                  border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                  color: 'var(--text)', textAlign: 'left',
                  boxShadow: isActive ? '0 0 18px var(--primary-glow)' : 'none'
                }}>
                <span style={{ width: 56, height: 32, borderRadius: 6, background: 'var(--bg-deep)', border: '1px solid var(--border)', display: 'grid', placeItems: 'center', flex: '0 0 56px' }}>
                  <IconCam size={14} style={{ color: 'var(--primary)' }} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{name}</div>
                  <div className="muted mono" style={{ fontSize: 11 }}>{(scenes.sources[name] ?? []).length} sources</div>
                </div>
                {isProgram && <span className="chip primary"><IconDot size={10} />PROGRAM</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="card-head" style={{ flexShrink: 0 }}>
          <h3>Sources in “{active ?? '—'}”</h3>
          <button className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => void obs.actions.refreshScenes()}>
            <IconRefresh size={11} />Refresh
          </button>
        </div>
        <div className="col" style={{ gap: 6, flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
          {sources.map((src) => {
            const Ico = src.type === 'audio' ? IconMic : src.type === 'browser' ? IconChat : IconCam;
            const isSelected = src.name === selectedSource;
            const enabledShown = pendingSource[src.id] ?? src.enabled;
            return (
              <button key={src.id} onClick={() => setSelectedSource(src.name)} style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8,
                background: isSelected ? 'var(--primary-soft)' : 'var(--bg-elev)',
                border: `1px solid ${isSelected ? 'var(--primary)' : 'var(--border-soft)'}`,
                opacity: enabledShown ? 1 : 0.55,
                color: 'var(--text)', textAlign: 'left', cursor: 'pointer'
              }}>
                <span style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--bg-deep)', display: 'grid', placeItems: 'center', color: typeColor[src.type], flex: '0 0 28px' }}>
                  <Ico size={14} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{src.name}</div>
                  <div className="muted mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{src.type}</div>
                </div>
                <span className="btn btn-sm btn-icon" title={enabledShown ? 'Hide' : 'Show'}
                        onClick={(e) => { e.stopPropagation(); toggleSourceVisibility(src.id, !enabledShown); }}>
                  {enabledShown ? <IconEye size={12} /> : <IconEyeOff size={12} />}
                </span>
              </button>
            );
          })}
          {sources.length === 0 && <span className="dim" style={{ fontSize: 12 }}>No sources in this scene.</span>}
        </div>
      </div>

      <div className="card" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <div className="card-head" style={{ flexShrink: 0 }}>
          <h3 style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
            Filters{selectedSource ? <span className="dim" style={{ fontWeight: 400 }}> · {selectedSource}</span> : null}
          </h3>
          {selectedSource && (
            <button className="btn btn-sm btn-ghost" style={{ marginLeft: 'auto' }} onClick={() => setRefreshTick((t) => t + 1)}>
              <IconRefresh size={11} />Refresh
            </button>
          )}
        </div>
        <div className="col" style={{ gap: 6, flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 4 }}>
          {!selectedSource && <span className="dim" style={{ fontSize: 12 }}>Pick a source on the left to see its filters.</span>}
          {selectedSource && filtersLoading && filters === null && <span className="dim" style={{ fontSize: 12 }}>Loading filters…</span>}
          {selectedSource && filters !== null && filters.length === 0 && <span className="dim" style={{ fontSize: 12 }}>No filters on this source.</span>}
          {selectedSource && filters?.map((f) => (
            <div key={f.name} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8,
              background: 'var(--bg-elev)', border: '1px solid var(--border-soft)', opacity: f.enabled ? 1 : 0.55
            }}>
              <span style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--bg-deep)', display: 'grid', placeItems: 'center', color: 'var(--info)', flex: '0 0 28px' }}>
                <IconBolt size={14} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</div>
                <div className="muted mono" style={{ fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.06em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {prettyKind(f.kind)}
                </div>
              </div>
              <button className="btn btn-sm btn-icon" title={f.enabled ? 'Disable' : 'Enable'}
                      onClick={() => void toggleFilter(f.name, f.enabled)}>
                {f.enabled ? <IconEye size={12} /> : <IconEyeOff size={12} />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// OBS filter kinds are coded ids like 'color_correction_filter_v2'; strip the
// trailing version + 'filter' marker and convert to Title Case for the chip.
function prettyKind(kind: string): string {
  return kind
    .replace(/_filter(_v\d+)?$/i, '')
    .replace(/_v\d+$/i, '')
    .split('_')
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
