import React from 'react';
import type { useObs } from '../../state/useObs';
import { ScenesTab } from './ScenesTab';
import { EventsTab } from './EventsTab';
import { PreviewTab } from './PreviewTab';
import { IconLink, IconLinkOff, IconBolt, IconDot, IconRecord, IconPlay, IconStop, IconClock, IconStar } from '../../icons';

type Obs = ReturnType<typeof useObs>;
type Tab = 'scenes' | 'events' | 'preview';

export function ObsConnected({ obs }: { obs: Obs }) {
  const [tab, setTab] = React.useState<Tab>('scenes');
  const { status, outputs, stats, actions } = obs;
  const streaming = outputs?.streaming ?? false;
  const recording = outputs?.recording ?? false;
  const replayActive = outputs?.replayBuffer ?? false;

  return (
    // Flex column filling the viewport: fixed status cards on top, active tab grows and scrolls so controls stay in view.
    <div className="screen" style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div className="card" style={{ padding: '14px 18px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--success-soft)', border: '1px solid var(--success)', display: 'grid', placeItems: 'center', color: 'var(--success)' }}>
          <IconLink size={18} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>OBS Studio — Connected</div>
          <div className="mono muted" style={{ fontSize: 11.5 }}>
            {status.url} · obs-websocket {status.obsVersion ?? '5.x'} · rpc {status.rpcVersion ?? 1} · {status.eventsForwarded} events forwarded
          </div>
        </div>
        <span className="chip secondary"><IconBolt size={11} />Live</span>
        <button className="btn btn-sm btn-danger" onClick={() => void actions.disconnect()}>
          <IconLinkOff size={12} />Disconnect
        </button>
      </div>

      <div className="grid" style={{ gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14, flexShrink: 0 }}>
        <div className="card" style={{ borderColor: streaming ? 'var(--error)' : 'var(--border)' }}>
          <div className="row" style={{ gap: 14 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: streaming ? 'var(--error-soft)' : 'var(--bg-elev)',
              border: `1px solid ${streaming ? 'var(--error)' : 'var(--border)'}`,
              display: 'grid', placeItems: 'center', color: streaming ? 'var(--error)' : 'var(--text-mute)',
              animation: streaming ? 'livepulse 2s ease-in-out infinite' : 'none'
            }}><IconDot size={18} /></div>
            <div style={{ flex: 1 }}>
              <div className="muted" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase' }}>Stream</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: streaming ? 'var(--error)' : 'var(--text-mute)', letterSpacing: '0.04em' }}>
                {streaming ? 'LIVE' : 'OFFLINE'}
              </div>
              {streaming && outputs && (
                <div className="mono dim" style={{ fontSize: 12, marginTop: 2 }}>
                  {outputs.streamTimecode} · {stats?.streamBitrateKbps ?? 0}kbps · dropped {stats?.droppedFrames ?? 0}
                </div>
              )}
            </div>
            <button className={`btn btn-lg ${streaming ? 'btn-danger' : 'btn-primary'}`}
                    onClick={() => void (streaming ? actions.stopStream() : actions.startStream())}>
              {streaming ? <><IconStop size={14} />Stop Stream</> : <><IconPlay size={14} />Start Stream</>}
            </button>
          </div>
        </div>

        <div className="card">
          <div className="row" style={{ gap: 14 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14,
              background: recording ? 'var(--secondary-soft)' : 'var(--bg-elev)',
              border: `1px solid ${recording ? 'var(--secondary)' : 'var(--border)'}`,
              display: 'grid', placeItems: 'center', color: recording ? 'var(--secondary)' : 'var(--text-mute)'
            }}><IconRecord size={18} /></div>
            <div style={{ flex: 1 }}>
              <div className="muted" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase' }}>Recording</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: recording ? 'var(--secondary)' : 'var(--text-mute)' }}>
                {recording ? 'RECORDING' : 'STOPPED'}
              </div>
              {recording && outputs && (
                <div className="mono dim" style={{ fontSize: 12, marginTop: 2 }}>
                  {outputs.recordTimecode} · {stats?.recordBitrateKbps ?? 0}kbps
                </div>
              )}
            </div>
            <button className={`btn btn-lg ${recording ? 'btn-danger' : 'btn-secondary'}`}
                    onClick={() => void (recording ? actions.stopRecord() : actions.startRecord())}>
              {recording ? <><IconStop size={14} />Stop</> : <><IconPlay size={14} />Record</>}
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 14, flexShrink: 0 }}>
        <div className="row" style={{ gap: 14 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 14,
            background: replayActive ? 'var(--secondary-soft)' : 'var(--bg-elev)',
            border: `1px solid ${replayActive ? 'var(--secondary)' : 'var(--border)'}`,
            display: 'grid', placeItems: 'center', color: replayActive ? 'var(--secondary)' : 'var(--text-mute)'
          }}><IconClock size={18} /></div>
          <div style={{ flex: 1 }}>
            <div className="muted" style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '0.10em', textTransform: 'uppercase' }}>Replay Buffer</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: replayActive ? 'var(--secondary)' : 'var(--text-mute)' }}>
              {replayActive ? 'ACTIVE' : 'INACTIVE'}
            </div>
            <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>
              {replayActive
                ? 'Buffering — save to capture the last few moments instantly.'
                : 'Start the buffer to capture instant replays of recent gameplay.'}
            </div>
          </div>
          <div className="row" style={{ gap: 6 }}>
            <button className="btn btn-lg" title="Save the buffered replay" disabled={!replayActive}
                    onClick={() => void actions.saveReplay()}>
              <IconStar size={14} />Save
            </button>
            <button className={`btn btn-lg ${replayActive ? 'btn-danger' : 'btn-secondary'}`}
                    onClick={() => void (replayActive ? actions.stopReplayBuffer() : actions.startReplayBuffer())}>
              {replayActive ? <><IconStop size={14} />Stop</> : <><IconPlay size={14} />Start</>}
            </button>
          </div>
        </div>
      </div>

      <div className="tabstrip" style={{ flexShrink: 0 }}>
        {([['scenes', 'Scenes & Sources'], ['events', 'Raw Event Log'], ['preview', 'Preview']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} className="tab" data-active={tab === id} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      {/* Tab content grows into remaining viewport; minHeight:0 lets flex children shrink below intrinsic content size. */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {tab === 'scenes' && <ScenesTab obs={obs} />}
        {tab === 'events' && <EventsTab obs={obs} />}
        {tab === 'preview' && <PreviewTab obs={obs} />}
      </div>
    </div>
  );
}
