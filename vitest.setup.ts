import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

// Default window.api stub so renderer component tests have the bridge available.
// Node-environment test files (// @vitest-environment node) skip this block.
if (typeof window !== 'undefined') {
  (window as unknown as { api: unknown }).api = {
    config: {
      get: vi.fn().mockResolvedValue(undefined),
      set: vi.fn().mockResolvedValue(undefined),
      all: vi.fn().mockResolvedValue({})
    },
    window: { minimize: vi.fn(), maximize: vi.fn(), close: vi.fn() },
    obs: {
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      setScene: vi.fn().mockResolvedValue(undefined),
      setSourceEnabled: vi.fn().mockResolvedValue(undefined),
      startStream: vi.fn().mockResolvedValue(undefined),
      stopStream: vi.fn().mockResolvedValue(undefined),
      startRecord: vi.fn().mockResolvedValue(undefined),
      stopRecord: vi.fn().mockResolvedValue(undefined),
      saveReplay: vi.fn().mockResolvedValue(undefined),
      startReplayBuffer: vi.fn().mockResolvedValue(undefined),
      stopReplayBuffer: vi.fn().mockResolvedValue(undefined),
      toggleVcam: vi.fn().mockResolvedValue(undefined),
      refreshScenes: vi.fn().mockResolvedValue(undefined),
      refreshAudio: vi.fn().mockResolvedValue(undefined),
      setInputMute: vi.fn().mockResolvedValue(undefined),
      listSourceFilters: vi.fn().mockResolvedValue([]),
      setSourceFilterEnabled: vi.fn().mockResolvedValue(undefined),
      snapshot: vi.fn().mockResolvedValue({ status: { state: 'disconnected', eventsForwarded: 0 }, outputs: null, stats: null, scenes: null, audio: null })
    },
    relay: {
      setLock: vi.fn().mockResolvedValue(undefined),
      setApiKey: vi.fn().mockResolvedValue(undefined),
      connect: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn().mockResolvedValue(undefined),
      snapshot: vi.fn().mockResolvedValue({ state: 'disconnected', registered: false, locked: false, hasApiKey: false })
    },
    variables: { all: vi.fn().mockResolvedValue({ values: {}, counters: {} }), resetSession: vi.fn().mockResolvedValue(undefined) },
    logs: { snapshot: vi.fn().mockResolvedValue([]) },
    chat: { snapshot: vi.fn().mockResolvedValue([]) },
    bot: { snapshot: vi.fn().mockResolvedValue({ running: false, reachable: false }) },
    auth: {
      validateKey: vi.fn().mockResolvedValue({ valid: true, username: 'tester', message: 'Valid API Key' }),
      account: vi.fn().mockResolvedValue(null)
    },
    twitch: { snapshot: vi.fn().mockResolvedValue({ reachable: false, online: false }) },
    commands: {
      snapshot: vi.fn().mockResolvedValue({ builtin: [], custom: [], user: [], state: 'idle' }),
      refresh: vi.fn().mockResolvedValue(undefined),
      updateBuiltin: vi.fn().mockResolvedValue(true)
    },
    soundboard: {
      snapshot: vi.fn().mockResolvedValue({ sounds: [], state: 'idle' }),
      refresh: vi.fn().mockResolvedValue(undefined),
      play: vi.fn().mockResolvedValue(true)
    },
    timers: {
      snapshot: vi.fn().mockResolvedValue({ timers: [], state: 'idle' }),
      refresh: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(true),
      update: vi.fn().mockResolvedValue(true),
      toggle: vi.fn().mockResolvedValue(true),
      delete: vi.fn().mockResolvedValue(true)
    },
    raffles: {
      snapshot: vi.fn().mockResolvedValue({ raffles: [], state: 'idle' }),
      refresh: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(true),
      update: vi.fn().mockResolvedValue(true),
      start: vi.fn().mockResolvedValue(true),
      stop: vi.fn().mockResolvedValue(true),
      draw: vi.fn().mockResolvedValue([]),
      delete: vi.fn().mockResolvedValue(true),
      entries: vi.fn().mockResolvedValue([]),
      winners: vi.fn().mockResolvedValue([])
    },
    polls: {
      snapshot: vi.fn().mockResolvedValue({ polls: [], state: 'idle' }),
      refresh: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(true),
      end: vi.fn().mockResolvedValue(true)
    },
    predictions: {
      snapshot: vi.fn().mockResolvedValue({ predictions: [], state: 'idle' }),
      refresh: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockResolvedValue(true),
      end: vi.fn().mockResolvedValue(true)
    },
    alerts: {
      snapshot: vi.fn().mockResolvedValue({ alerts: [] })
    },
    channelPoints: {
      snapshot: vi.fn().mockResolvedValue({ rewards: [], state: 'idle' }),
      refresh: vi.fn().mockResolvedValue(undefined),
      createReward: vi.fn().mockResolvedValue(true),
      updateReward: vi.fn().mockResolvedValue(true),
      listRedemptions: vi.fn().mockResolvedValue([]),
      setRedemption: vi.fn().mockResolvedValue(true)
    },
    rewardGroups: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({ id: 'grp_x', name: '', rewardIds: [] }),
      update: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(true),
      setEnabled: vi.fn().mockResolvedValue(0)
    },
    actions: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(true)
    },
    folders: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(true),
      reorder: vi.fn().mockResolvedValue(true)
    },
    automations: {
      list: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue(true),
      reorder: vi.fn().mockResolvedValue(true),
      testFire: vi.fn().mockResolvedValue(true)
    },
    platform: 'win32',
    on: vi.fn().mockReturnValue(() => {})
  };
}
