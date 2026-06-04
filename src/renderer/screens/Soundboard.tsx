import React from 'react';
import { useSoundboard } from '../state/useSoundboard';
import { IconSoundboard, IconRefresh, IconMic } from '../icons';

// Strip the file extension for a friendlier button label.
const prettyName = (file: string): string => file.replace(/\.[^.]+$/, '');

export function ScreenSoundboard() {
  const snap = useSoundboard();
  const [refreshing, setRefreshing] = React.useState(false);
  // Per-sound transient feedback after a play attempt ('ok' | 'err'), keyed by filename.
  const [flash, setFlash] = React.useState<Record<string, 'ok' | 'err'>>({});
  const flashTimers = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  React.useEffect(() => {
    const timers = flashTimers.current;
    return () => { for (const id of Object.values(timers)) clearTimeout(id); };
  }, []);

  const setFlashFor = (sound: string, kind: 'ok' | 'err') => {
    setFlash((f) => ({ ...f, [sound]: kind }));
    if (flashTimers.current[sound]) clearTimeout(flashTimers.current[sound]);
    flashTimers.current[sound] = setTimeout(() => {
      setFlash((f) => { const next = { ...f }; delete next[sound]; return next; });
    }, 1200);
  };

  const play = async (sound: string) => {
    const ok = await window.api.soundboard.play(sound).catch(() => false);
    setFlashFor(sound, ok ? 'ok' : 'err');
  };

  const refresh = async () => {
    setRefreshing(true);
    try { await window.api.soundboard.refresh(); } catch { /* surfaced via snap.state */ } finally { setRefreshing(false); }
  };

  return (
    <div className="screen">
      <div className="row" style={{ marginBottom: 14, gap: 10, alignItems: 'center' }}>
        <h3 style={{ margin: 0 }}>Soundboard</h3>
        <span className="chip" style={{ marginLeft: 4 }}>{snap.sounds.length}</span>
        {snap.state === 'error' && <span className="chip warn" title={snap.error}>error</span>}
        <span className="dim" style={{ fontSize: 12, marginLeft: 'auto' }}>Plays on stream via your alert overlay</span>
        <button className="btn btn-sm" onClick={() => void refresh()} disabled={refreshing}>
          <IconRefresh size={11} />{refreshing ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <Body snap={snap} flash={flash} onPlay={play} />
    </div>
  );
}

function Body({
  snap, flash, onPlay
}: {
  snap: ReturnType<typeof useSoundboard>;
  flash: Record<string, 'ok' | 'err'>;
  onPlay: (sound: string) => void;
}) {
  if (snap.state === 'idle') {
    return <Empty icon={IconSoundboard} title="No API key yet" hint="Add your BotOfTheSpecter API key in Settings to load your sounds." />;
  }
  if (snap.state === 'loading' && snap.sounds.length === 0) {
    return <Empty icon={IconSoundboard} title="Loading sounds…" />;
  }
  if (snap.state === 'error' && snap.sounds.length === 0) {
    return <Empty icon={IconSoundboard} title="Couldn’t load sounds" hint={snap.error ? `Error: ${snap.error}` : 'Try Refresh, and check your API key in Settings.'} />;
  }
  if (snap.sounds.length === 0) {
    return <Empty icon={IconSoundboard} title="No sounds yet" hint="Upload sound alerts on the BotOfTheSpecter website, then hit Refresh." />;
  }

  return (
    <div
      className="grid"
      style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10, alignContent: 'start' }}
    >
      {snap.sounds.map((sound) => {
        const f = flash[sound];
        return (
          <button
            key={sound}
            className="card glow-on-hover"
            onClick={() => onPlay(sound)}
            title={`Play ${sound} on stream`}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8,
              padding: '14px 14px', cursor: 'pointer', textAlign: 'left',
              // Force theme text color since <button> inherits a dim color, keeping the sound name readable in dark and light mode.
              color: 'var(--text)',
              borderColor: f === 'ok' ? 'var(--success)' : f === 'err' ? 'var(--error)' : undefined
            }}
          >
            <span style={{
              width: 32, height: 32, borderRadius: 9, background: 'var(--bg-deep)', display: 'grid',
              placeItems: 'center', color: 'var(--secondary)', flex: '0 0 32px'
            }}>
              <IconMic size={15} />
            </span>
            <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {prettyName(sound)}
            </span>
            <span className="mono" style={{
              fontSize: 10.5,
              color: f === 'ok' ? 'var(--success)' : f === 'err' ? 'var(--error)' : 'var(--text-dim)'
            }}>
              {f === 'ok' ? 'Played ✓' : f === 'err' ? 'Failed' : 'Click to play'}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Empty({ icon: Icon, title, hint }: { icon: React.ComponentType<{ size?: number }>; title: string; hint?: string }) {
  return (
    <div className="card" style={{ display: 'grid', placeItems: 'center', textAlign: 'center', padding: 40, minHeight: 240 }}>
      <div style={{ opacity: 0.5, marginBottom: 14 }}><Icon size={40} /></div>
      <h3 style={{ marginBottom: 6 }}>{title}</h3>
      {hint && <p className="dim" style={{ fontSize: 13, maxWidth: 420, lineHeight: 1.5 }}>{hint}</p>}
    </div>
  );
}
