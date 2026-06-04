import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ScenesTab } from './ScenesTab';

type ObsProp = React.ComponentProps<typeof ScenesTab>['obs'];

const makeObs = (): ObsProp =>
  ({
    status: { state: 'connected', eventsForwarded: 0 },
    outputs: null,
    stats: null,
    audio: null,
    audioMeters: [],
    log: [],
    scenes: {
      current: 'Scene1',
      scenes: ['Scene1'],
      sources: { Scene1: [{ id: 1, name: 'Cam', enabled: true, type: 'video' }] }
    },
    actions: {
      setScene: vi.fn().mockResolvedValue(undefined),
      refreshScenes: vi.fn().mockResolvedValue(undefined),
      toggleSource: vi.fn().mockResolvedValue(undefined)
    }
  }) as unknown as ObsProp;

const selectSource = () => fireEvent.click(screen.getByText('Cam').closest('button')!);

const makeObsMulti = (current: string, scenes: string[]): ObsProp =>
  ({
    status: { state: 'connected', eventsForwarded: 0 },
    outputs: null, stats: null, audio: null, audioMeters: [], log: [],
    scenes: { current, scenes, sources: Object.fromEntries(scenes.map((s) => [s, []])) },
    actions: {
      setScene: vi.fn().mockResolvedValue(undefined),
      refreshScenes: vi.fn().mockResolvedValue(undefined),
      toggleSource: vi.fn().mockResolvedValue(undefined)
    }
  }) as unknown as ObsProp;

describe('ScenesTab scene/source sync', () => {
  it('follows an externally-driven program scene change instead of sticking on a manual selection', () => {
    const { rerender } = render(<ScenesTab obs={makeObsMulti('Scene1', ['Scene1', 'Scene2', 'Scene3'])} />);
    // Inspect Scene2 manually (program is still Scene1).
    fireEvent.click(screen.getByText('Scene2').closest('button')!);
    expect(screen.getByRole('heading', { name: /Sources in/ })).toHaveTextContent('Scene2');
    // Program scene changes externally to Scene3 — the view must follow it.
    rerender(<ScenesTab obs={makeObsMulti('Scene3', ['Scene1', 'Scene2', 'Scene3'])} />);
    expect(screen.getByRole('heading', { name: /Sources in/ })).toHaveTextContent('Scene3');
  });

  it('optimistically flips a source visibility toggle before the refresh confirms', () => {
    const obs = makeObs();
    render(<ScenesTab obs={obs} />);
    fireEvent.click(screen.getByTitle('Hide')); // Cam is enabled → "Hide"
    expect(screen.getByTitle('Show')).toBeInTheDocument(); // optimistic flip
    expect(obs.actions.toggleSource).toHaveBeenCalledWith('Scene1', 1, false);
  });
});

describe('ScenesTab filter error handling', () => {
  beforeEach(() => {
    window.api.obs.listSourceFilters = vi.fn().mockResolvedValue([]);
    window.api.obs.setSourceFilterEnabled = vi.fn().mockResolvedValue(undefined);
  });

  it('clears the loading state (no infinite spinner) when listSourceFilters rejects', async () => {
    window.api.obs.listSourceFilters = vi.fn().mockRejectedValue(new Error('OBS dropped'));
    render(<ScenesTab obs={makeObs()} />);
    selectSource();
    // With a catch the panel resolves to the empty state; without one it hangs on "Loading filters…".
    await waitFor(() => expect(screen.getByText(/No filters on this source/i)).toBeInTheDocument());
    expect(screen.queryByText(/Loading filters/i)).not.toBeInTheDocument();
  });

  it('reverts the optimistic toggle and refetches when setSourceFilterEnabled rejects', async () => {
    const filter = { name: 'Sharpen', kind: 'sharpness_filter_v2', enabled: true, index: 0 };
    window.api.obs.listSourceFilters = vi.fn().mockResolvedValue([filter]);
    window.api.obs.setSourceFilterEnabled = vi.fn().mockRejectedValue(new Error('OBS dropped'));
    render(<ScenesTab obs={makeObs()} />);
    selectSource();
    await waitFor(() => expect(screen.getByText('Sharpen')).toBeInTheDocument());

    // Enabled filter shows the "Disable" affordance; toggling optimistically flips it.
    fireEvent.click(screen.getByTitle('Disable'));

    // The call fails → the optimistic flip reverts (back to "Disable") and a reconciling refetch runs.
    await waitFor(() => expect(screen.getByTitle('Disable')).toBeInTheDocument());
    expect(window.api.obs.listSourceFilters).toHaveBeenCalledTimes(2);
  });
});
