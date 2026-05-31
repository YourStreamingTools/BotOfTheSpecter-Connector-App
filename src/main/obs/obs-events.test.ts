// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { normalizeObsEvent } from './obs-events';

describe('normalizeObsEvent', () => {
  it('describes a program scene change', () => {
    const e = normalizeObsEvent('CurrentProgramSceneChanged', { sceneName: 'Gameplay' });
    expect(e).toEqual({ type: 'CurrentProgramSceneChanged', message: 'Scene changed → Gameplay', direction: 'in' });
  });

  it('describes a source visibility change', () => {
    const e = normalizeObsEvent('SceneItemEnableStateChanged', {
      sceneName: 'Gameplay', sceneItemId: 4, sceneItemEnabled: false
    });
    expect(e.message).toBe('Source #4 in Gameplay hidden');
  });

  it('describes stream state via outputActive', () => {
    expect(normalizeObsEvent('StreamStateChanged', { outputActive: true }).message).toBe('Streaming started');
    expect(normalizeObsEvent('StreamStateChanged', { outputActive: false }).message).toBe('Streaming stopped');
  });

  it('describes record state', () => {
    expect(normalizeObsEvent('RecordStateChanged', { outputActive: true }).message).toBe('Recording started');
  });

  it('falls back to the raw event type for unmapped events', () => {
    const e = normalizeObsEvent('VendorEvent', { vendorName: 'obs-browser' });
    expect(e.type).toBe('VendorEvent');
    expect(e.message).toBe('VendorEvent');
  });
});
