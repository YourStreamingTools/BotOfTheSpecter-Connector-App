import React from 'react';
import { useRelay } from '../state/useRelay';
import { useAccount } from '../state/account';
import { useTheme, type ThemePref } from '../state/theme';

const THEME_OPTIONS: [ThemePref, string][] = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];

export function ScreenSettings() {
  const relay = useRelay();
  const { account, refresh, clear } = useAccount();
  const { theme, setTheme } = useTheme();
  const [key, setKey] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<{ kind: 'ok' | 'err' | 'info'; text: string } | null>(null);
  // 0 here is the "Auto-detect" sentinel; persisted as `undefined` in config.
  const [streamOutputCount, setStreamOutputCount] = React.useState<number>(0);

  // Load a previously-saved key into the field. The account itself is loaded by AccountProvider.
  React.useEffect(() => {
    void window.api.config.get('api_key').then((k) => { if (k) setKey(k); });
    void window.api.config.get('streamOutputCount').then((n) => { if (typeof n === 'number') setStreamOutputCount(n); });
  }, []);

  const persistOutputCount = (n: number) => {
    setStreamOutputCount(n);
    void window.api.config.set('streamOutputCount', n === 0 ? undefined : n);
  };

  // Validate the key against the BotOfTheSpecter API before saving/connecting.
  // An invalid key is never persisted and never triggers a relay connection.
  const save = async () => {
    const trimmed = key.trim();
    if (!trimmed) { setMsg({ kind: 'err', text: 'Enter your API key first.' }); return; }
    setBusy(true);
    setMsg({ kind: 'info', text: 'Validating key…' });
    try {
      const res = await window.api.auth.validateKey(trimmed);
      if (!res.valid) {
        clear();
        setMsg({ kind: 'err', text: `Invalid API key — ${res.message}` });
        return;
      }
      await relay.actions.setApiKey(trimmed);
      const acct = await refresh(trimmed);
      setMsg({ kind: 'ok', text: `Validated — connected as ${acct?.displayName ?? res.username ?? 'your account'}` });
    } catch (err) {
      // Don't leave the UI stuck on "Validating…" with a swallowed rejection.
      setMsg({ kind: 'err', text: `Couldn't save: ${err instanceof Error ? err.message : 'unknown error'}` });
    } finally {
      setBusy(false);
    }
  };

  const stateLabel = relay.status.state === 'connected' ? 'Connected' :
    relay.status.state === 'connecting' ? 'Connecting…' :
    relay.status.state === 'error' ? `Error: ${relay.status.error ?? ''}` : 'Disconnected';

  const msgColor = msg?.kind === 'ok' ? 'var(--success)' : msg?.kind === 'err' ? 'var(--error)' : 'var(--text-dim)';

  return (
    <div className="screen">
      <div className="col" style={{ maxWidth: 720, gap: 16 }}>
        <div className="card">
          <div className="card-head"><h3>BotOfTheSpecter Connection</h3>
            <span className={`chip ${relay.status.state === 'connected' ? 'good' : relay.status.state === 'error' ? 'live' : ''}`} style={{ marginLeft: 'auto' }}>{stateLabel}</span>
          </div>
          <div className="col" style={{ gap: 14 }}>
            <div>
              <label className="label-row">API Key</label>
              <input className="input mono" type="password" value={key} placeholder="Paste your BotOfTheSpecter API key"
                     onChange={(e) => { setKey(e.target.value); setMsg(null); }} />
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Validating…' : 'Save & Connect'}</button>
              <button className="btn" onClick={() => void relay.actions.disconnect()}>Disconnect</button>
            </div>
            {msg && <div style={{ fontSize: 13, color: msgColor }}>{msg.text}</div>}
            <div className="dim" style={{ fontSize: 12 }}>
              Your key is validated against the BotOfTheSpecter API before connecting. More settings
              are coming soon. OBS connection is configured on the OBS Control screen.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>OBS Stream Timer</h3></div>
          <div>
            <label className="label-row">Stream output count</label>
            <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
              {[
                { value: 0, label: 'Auto' },
                { value: 1, label: '1 (single)' },
                { value: 2, label: '2' },
                { value: 3, label: '3' },
                { value: 4, label: '4' }
              ].map(({ value, label }) => (
                <button key={value} className={`btn btn-sm ${streamOutputCount === value ? 'btn-primary' : ''}`}
                        onClick={() => persistOutputCount(value)}>{label}</button>
              ))}
            </div>
            <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>
              OBS&rsquo;s stream <code>outputDuration</code> ticks faster than real time when a
              multi-output plugin sends to multiple destinations, which throws the LIVE counter off.
              Pick the total number of outputs your OBS is sending to (Twitch + any multi-output
              destinations) and the timer is corrected instantly with no sampling delay.
              <br />
              <strong>Auto</strong> samples the rate at runtime over ~3 seconds &mdash; safe but
              slightly slower to lock on. <strong>1</strong> and <strong>3</strong> are verified;
              <strong>2</strong> and <strong>4</strong> are extrapolated estimates &mdash; if the
              counter looks off, switch back to Auto.
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Appearance</h3></div>
          <div>
            <label className="label-row">Theme</label>
            <div className="row" style={{ gap: 8 }}>
              {THEME_OPTIONS.map(([value, label]) => (
                <button key={value} className={`btn btn-sm ${theme === value ? 'btn-primary' : ''}`}
                        onClick={() => setTheme(value)}>{label}</button>
              ))}
            </div>
            <div className="dim" style={{ fontSize: 12, marginTop: 8 }}>
              System follows your operating system’s light/dark setting.
            </div>
          </div>
        </div>

        {account && (
          <div className="card">
            <div className="card-head"><h3>Account</h3></div>
            <div className="row" style={{ gap: 14, alignItems: 'center' }}>
              {account.profileImage && (
                <img src={account.profileImage} alt="" width={56} height={56}
                     style={{ borderRadius: '50%', flex: '0 0 auto', objectFit: 'cover' }} />
              )}
              <div className="col" style={{ gap: 6, minWidth: 0 }}>
                <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: 16 }}>{account.displayName}</strong>
                  {account.isAdmin && <span className="chip good">Admin</span>}
                  {account.betaAccess && <span className="chip">Beta</span>}
                  {account.isTechnical && <span className="chip">Technical</span>}
                </div>
                <span className="dim" style={{ fontSize: 12 }}>@{account.username}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
