import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage before importing the store
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
    get length() { return Object.keys(store).length; },
    key: vi.fn((i: number) => Object.keys(store)[i] ?? null),
  };
})();

Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

import { useVST3Store } from '../vst3Store';
import type { VST3PluginInfo, VST3ActiveInstance } from '../vst3Store';

const mockPlugin = (overrides: Partial<VST3PluginInfo> = {}): VST3PluginInfo => ({
  uid: 'plugin-1',
  name: 'Serum',
  vendor: 'Xfer Records',
  category: 'instrument',
  subcategory: 'Synthesizer',
  inputChannels: 0,
  outputChannels: 2,
  hasEditor: true,
  supportsMultiOutput: false,
  outputBusses: [{ name: 'Main', channels: 2 }],
  ...overrides,
});

const mockInstance = (overrides: Partial<VST3ActiveInstance> = {}): VST3ActiveInstance => ({
  instanceId: 'inst-1',
  pluginUid: 'plugin-1',
  trackId: 'track-1',
  latencySamples: 0,
  editorOpen: false,
  ...overrides,
});

describe('vst3Store', () => {
  beforeEach(() => {
    localStorageMock.clear();
    (localStorageMock.clear as ReturnType<typeof vi.fn>).mockClear();
    (localStorageMock.getItem as ReturnType<typeof vi.fn>).mockClear();
    (localStorageMock.setItem as ReturnType<typeof vi.fn>).mockClear();
    useVST3Store.getState().reset();
  });

  describe('initial state', () => {
    it('starts disconnected with no plugins and no instances', () => {
      const state = useVST3Store.getState();
      expect(state.connectionStatus).toBe('disconnected');
      expect(state.connectionError).toBeNull();
      expect(state.companionVersion).toBeNull();
      expect(state.capabilities).toEqual([]);
      expect(state.isScanning).toBe(false);
      expect(state.scanProgress).toBeNull();
      expect(state.scannedPlugins).toEqual([]);
      expect(state.lastScanTimestamp).toBeNull();
      expect(state.activeInstances).toEqual(new Map());
    });
  });

  describe('connection state transitions', () => {
    it('transitions from disconnected to connecting to connected', () => {
      const { setConnectionStatus } = useVST3Store.getState();
      setConnectionStatus('connecting');
      expect(useVST3Store.getState().connectionStatus).toBe('connecting');

      setConnectionStatus('connected');
      expect(useVST3Store.getState().connectionStatus).toBe('connected');
      expect(useVST3Store.getState().connectionError).toBeNull();
    });

    it('clears error when transitioning to non-error state', () => {
      const { setConnectionStatus } = useVST3Store.getState();
      setConnectionStatus('error', 'Connection refused');
      expect(useVST3Store.getState().connectionError).toBe('Connection refused');

      setConnectionStatus('connected');
      expect(useVST3Store.getState().connectionError).toBeNull();
    });
  });

  describe('connection error handling', () => {
    it('sets error status and error message', () => {
      useVST3Store.getState().setConnectionStatus('error', 'Timeout');
      const state = useVST3Store.getState();
      expect(state.connectionStatus).toBe('error');
      expect(state.connectionError).toBe('Timeout');
    });

    it('preserves null error when no message provided', () => {
      useVST3Store.getState().setConnectionStatus('error');
      const state = useVST3Store.getState();
      expect(state.connectionStatus).toBe('error');
      expect(state.connectionError).toBeNull();
    });
  });

  describe('companion info', () => {
    it('stores version and capabilities', () => {
      useVST3Store.getState().setCompanionInfo('1.2.0', ['scan', 'instantiate', 'process']);
      const state = useVST3Store.getState();
      expect(state.companionVersion).toBe('1.2.0');
      expect(state.capabilities).toEqual(['scan', 'instantiate', 'process']);
    });
  });

  describe('scan lifecycle', () => {
    it('startScan sets isScanning and clears progress', () => {
      useVST3Store.getState().startScan();
      const state = useVST3Store.getState();
      expect(state.isScanning).toBe(true);
      expect(state.scanProgress).toBeNull();
    });

    it('updateScanProgress updates found count and current plugin', () => {
      useVST3Store.getState().startScan();
      useVST3Store.getState().updateScanProgress(5, 'Scanning Serum.vst3');
      const state = useVST3Store.getState();
      expect(state.scanProgress).toEqual({ found: 5, current: 'Scanning Serum.vst3' });
    });

    it('completeScan sets plugins and stops scanning', () => {
      const plugins = [mockPlugin(), mockPlugin({ uid: 'plugin-2', name: 'Vital' })];
      useVST3Store.getState().startScan();
      useVST3Store.getState().completeScan(plugins);
      const state = useVST3Store.getState();
      expect(state.isScanning).toBe(false);
      expect(state.scannedPlugins).toEqual(plugins);
      expect(state.lastScanTimestamp).toBeGreaterThan(0);
      expect(state.scanProgress).toBeNull();
    });
  });

  describe('plugin filtering by category', () => {
    it('returns only instruments', () => {
      const plugins = [
        mockPlugin({ uid: '1', name: 'Serum', category: 'instrument' }),
        mockPlugin({ uid: '2', name: 'FabFilter Pro-Q', category: 'effect' }),
        mockPlugin({ uid: '3', name: 'Vital', category: 'instrument' }),
      ];
      useVST3Store.getState().completeScan(plugins);
      const instruments = useVST3Store.getState().getPluginsByCategory('instrument');
      expect(instruments).toHaveLength(2);
      expect(instruments.map((p) => p.name)).toEqual(['Serum', 'Vital']);
    });

    it('returns only effects', () => {
      const plugins = [
        mockPlugin({ uid: '1', name: 'Serum', category: 'instrument' }),
        mockPlugin({ uid: '2', name: 'FabFilter Pro-Q', category: 'effect' }),
      ];
      useVST3Store.getState().completeScan(plugins);
      const effects = useVST3Store.getState().getPluginsByCategory('effect');
      expect(effects).toHaveLength(1);
      expect(effects[0].name).toBe('FabFilter Pro-Q');
    });
  });

  describe('plugin search', () => {
    const plugins = [
      mockPlugin({ uid: '1', name: 'Serum', vendor: 'Xfer Records', subcategory: 'Synthesizer' }),
      mockPlugin({ uid: '2', name: 'FabFilter Pro-Q 3', vendor: 'FabFilter', subcategory: 'EQ', category: 'effect' }),
      mockPlugin({ uid: '3', name: 'Vital', vendor: 'Matt Tytel', subcategory: 'Synthesizer' }),
    ];

    beforeEach(() => {
      useVST3Store.getState().completeScan(plugins);
    });

    it('matches by name (case-insensitive)', () => {
      const results = useVST3Store.getState().searchPlugins('serum');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('Serum');
    });

    it('matches by vendor', () => {
      const results = useVST3Store.getState().searchPlugins('fabfilter');
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('FabFilter Pro-Q 3');
    });

    it('matches by subcategory', () => {
      const results = useVST3Store.getState().searchPlugins('synthesizer');
      expect(results).toHaveLength(2);
    });

    it('returns empty array for no match', () => {
      const results = useVST3Store.getState().searchPlugins('nonexistent');
      expect(results).toHaveLength(0);
    });
  });

  describe('active instances', () => {
    it('adds an instance', () => {
      const instance = mockInstance();
      useVST3Store.getState().addInstance(instance);
      const instances = useVST3Store.getState().activeInstances;
      expect(instances.get('inst-1')).toEqual(instance);
    });

    it('removes an instance', () => {
      useVST3Store.getState().addInstance(mockInstance());
      useVST3Store.getState().removeInstance('inst-1');
      expect(useVST3Store.getState().activeInstances.size).toBe(0);
    });

    it('removing non-existent instance is a no-op', () => {
      useVST3Store.getState().addInstance(mockInstance());
      useVST3Store.getState().removeInstance('non-existent');
      expect(useVST3Store.getState().activeInstances.size).toBe(1);
    });
  });

  describe('update instance latency', () => {
    it('updates latency for an existing instance', () => {
      useVST3Store.getState().addInstance(mockInstance());
      useVST3Store.getState().updateInstanceLatency('inst-1', 256);
      expect(useVST3Store.getState().activeInstances.get('inst-1')?.latencySamples).toBe(256);
    });

    it('does nothing for non-existent instance', () => {
      useVST3Store.getState().updateInstanceLatency('non-existent', 256);
      expect(useVST3Store.getState().activeInstances.size).toBe(0);
    });
  });

  describe('editor open/close', () => {
    it('sets editor open', () => {
      useVST3Store.getState().addInstance(mockInstance());
      useVST3Store.getState().setEditorOpen('inst-1', true);
      expect(useVST3Store.getState().activeInstances.get('inst-1')?.editorOpen).toBe(true);
    });

    it('sets editor closed', () => {
      useVST3Store.getState().addInstance(mockInstance({ editorOpen: true }));
      useVST3Store.getState().setEditorOpen('inst-1', false);
      expect(useVST3Store.getState().activeInstances.get('inst-1')?.editorOpen).toBe(false);
    });
  });

  describe('get instances for track', () => {
    it('returns instances for a specific track', () => {
      useVST3Store.getState().addInstance(mockInstance({ instanceId: 'i1', trackId: 'track-1' }));
      useVST3Store.getState().addInstance(mockInstance({ instanceId: 'i2', trackId: 'track-2' }));
      useVST3Store.getState().addInstance(mockInstance({ instanceId: 'i3', trackId: 'track-1' }));

      const track1Instances = useVST3Store.getState().getInstancesForTrack('track-1');
      expect(track1Instances).toHaveLength(2);
      expect(track1Instances.map((i) => i.instanceId)).toEqual(['i1', 'i3']);
    });

    it('returns empty array for track with no instances', () => {
      const result = useVST3Store.getState().getInstancesForTrack('no-track');
      expect(result).toEqual([]);
    });
  });

  describe('reset', () => {
    it('clears everything back to initial state', () => {
      // Set up some state
      useVST3Store.getState().setConnectionStatus('connected');
      useVST3Store.getState().setCompanionInfo('1.0', ['scan']);
      useVST3Store.getState().completeScan([mockPlugin()]);
      useVST3Store.getState().addInstance(mockInstance());

      // Clear localStorage so reset doesn't reload cached plugins
      localStorageMock.clear();

      // Reset
      useVST3Store.getState().reset();

      const state = useVST3Store.getState();
      expect(state.connectionStatus).toBe('disconnected');
      expect(state.connectionError).toBeNull();
      expect(state.companionVersion).toBeNull();
      expect(state.capabilities).toEqual([]);
      expect(state.isScanning).toBe(false);
      expect(state.scanProgress).toBeNull();
      expect(state.scannedPlugins).toEqual([]);
      expect(state.lastScanTimestamp).toBeNull();
      expect(state.activeInstances).toEqual(new Map());
    });
  });

  describe('localStorage caching', () => {
    it('completeScan saves plugins to localStorage', () => {
      const plugins = [mockPlugin()];
      useVST3Store.getState().completeScan(plugins);
      expect(localStorageMock.setItem).toHaveBeenCalledWith(
        'vst3-scanned-plugins',
        expect.any(String),
      );
      const stored = JSON.parse(
        (localStorageMock.setItem as ReturnType<typeof vi.fn>).mock.calls[0][1],
      );
      expect(stored.plugins).toEqual(plugins);
      expect(stored.timestamp).toBeGreaterThan(0);
    });

    it('loads cached data when store resets with cached localStorage', () => {
      // Seed localStorage with cached data
      const cached = {
        plugins: [mockPlugin({ uid: 'cached-1', name: 'CachedPlugin' })],
        timestamp: 1700000000000,
      };
      localStorage.setItem('vst3-scanned-plugins', JSON.stringify(cached));

      // Reset triggers getInitialState which reads from localStorage
      useVST3Store.getState().reset();

      const state = useVST3Store.getState();
      expect(state.scannedPlugins).toHaveLength(1);
      expect(state.scannedPlugins[0].name).toBe('CachedPlugin');
      expect(state.lastScanTimestamp).toBe(1700000000000);
    });
  });
});
