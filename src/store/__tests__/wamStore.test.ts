import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWAMStore } from '../wamStore';
import { WAM_CATALOG, searchCatalog } from '../../services/wam/WAMCatalog';
import type { WAMPluginAdapter } from '../../services/wam/WAMPluginAdapter';

const mocks = vi.hoisted(() => ({
  wamHost: {
    initialize: vi.fn(),
    loadPlugin: vi.fn(),
  },
  adapter: {
    name: 'Mock WAM',
    author: 'Mock Vendor',
    getParameters: vi.fn(),
    getParameterDescriptors: vi.fn(),
    hasGui: vi.fn(),
    setParameter: vi.fn(),
    getState: vi.fn(),
    setState: vi.fn(),
    dispose: vi.fn(),
    createAudioNode: vi.fn(),
  },
  WAMPluginAdapter: {
    create: vi.fn(),
  },
  pluginEngine: {
    addPlugin: vi.fn(),
    getPlugin: vi.fn(),
    removePlugin: vi.fn(),
    setPluginBypassed: vi.fn(),
  },
  audioContext: { sampleRate: 48_000 },
}));

vi.mock('../../services/wam/WAMHost', () => ({
  wamHost: mocks.wamHost,
}));

vi.mock('../../services/wam/WAMPluginAdapter', () => ({
  WAMPluginAdapter: mocks.WAMPluginAdapter,
}));

vi.mock('../../engine/PluginEngine', () => ({
  pluginEngine: mocks.pluginEngine,
}));

vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({ ctx: mocks.audioContext }),
}));

function seedInstance(overrides: Partial<ReturnType<typeof createInstance>> = {}) {
  const instance = createInstance(overrides);
  useWAMStore.setState({
    instances: { [instance.instanceId]: instance },
    pluginOrder: { [instance.trackId]: [instance.instanceId] },
  });
  return instance;
}

function createInstance(overrides = {}) {
  return {
    instanceId: 'inst-1',
    pluginId: 'test-plugin',
    pluginName: 'Test',
    vendor: 'Test',
    trackId: 'track-1',
    enabled: true,
    parameters: [],
    parameterValues: {},
    activePreset: null,
    presets: [],
    hasGui: false,
    guiVisible: false,
    descriptor: null,
    ...overrides,
  };
}

const catalogEntry = {
  id: 'mock-plugin',
  name: 'Mock WAM',
  vendor: 'Mock Vendor',
  description: 'A mock WAM plugin',
  category: 'effect' as const,
  subcategory: 'delay',
  url: 'https://example.com/mock/index.js',
  tags: ['mock'],
};

describe('wamStore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset store to initial state
    useWAMStore.setState({
      hostStatus: 'idle',
      hostError: null,
      instances: {},
      pluginOrder: {},
      presets: {},
      _adapters: new Map(),
    });

    mocks.wamHost.initialize.mockResolvedValue(undefined);
    mocks.wamHost.loadPlugin.mockResolvedValue({
      instanceId: 'wam-instance-1',
      descriptor: {
        identifier: 'mock.vendor.MockWAM',
        name: 'Mock WAM',
        vendor: 'Mock Vendor',
        version: '1.0.0',
        apiVersion: '2.0.0',
        description: 'Mock descriptor',
        isInstrument: false,
        thumbnail: '',
        keywords: [],
        website: '',
        hasAudioInput: true,
        hasAudioOutput: true,
        hasMidiInput: false,
        hasMidiOutput: false,
      },
    });
    mocks.WAMPluginAdapter.create.mockResolvedValue(mocks.adapter);
    mocks.adapter.name = 'Mock WAM';
    mocks.adapter.author = 'Mock Vendor';
    mocks.adapter.getParameters.mockReturnValue({});
    mocks.adapter.getParameterDescriptors.mockReturnValue([]);
    mocks.adapter.hasGui.mockReturnValue(false);
    mocks.adapter.getState.mockResolvedValue(undefined);
    mocks.pluginEngine.addPlugin.mockReturnValue({ inputNode: null, outputNode: {} });
    mocks.pluginEngine.getPlugin.mockReturnValue(undefined);
  });

  describe('initial state', () => {
    it('should start with idle host status', () => {
      const state = useWAMStore.getState();
      expect(state.hostStatus).toBe('idle');
      expect(state.hostError).toBeNull();
      expect(state.instances).toEqual({});
      expect(state.pluginOrder).toEqual({});
    });
  });

  describe('initializeHost', () => {
    it('sets host status to ready after initializing the WAM host', async () => {
      await useWAMStore.getState().initializeHost(mocks.audioContext as unknown as BaseAudioContext);

      expect(mocks.wamHost.initialize).toHaveBeenCalledWith(mocks.audioContext);
      expect(useWAMStore.getState().hostStatus).toBe('ready');
      expect(useWAMStore.getState().hostError).toBeNull();
    });

    it('sets host status and error when initialization fails', async () => {
      mocks.wamHost.initialize.mockRejectedValueOnce(new Error('worklet unavailable'));

      await useWAMStore.getState().initializeHost(mocks.audioContext as unknown as BaseAudioContext);

      expect(useWAMStore.getState().hostStatus).toBe('error');
      expect(useWAMStore.getState().hostError).toBe('worklet unavailable');
    });
  });

  describe('loadPlugin', () => {
    it('creates a store instance and registers the adapter with the audio plugin engine', async () => {
      useWAMStore.setState({ hostStatus: 'ready' });
      mocks.adapter.getParameters.mockReturnValue({
        gain: 0.75,
        enabled: true,
        mode: 'Wide',
      });
      mocks.adapter.getParameterDescriptors.mockReturnValue([
        { id: 'gain', name: 'Gain', type: 'float', min: 0, max: 2, defaultValue: 1, step: 0.01 },
        { id: 'enabled', name: 'Enabled', type: 'bool', defaultValue: true },
        { id: 'mode', name: 'Mode', type: 'enum', options: ['Narrow', 'Wide'], defaultValue: 'Narrow' },
      ]);
      mocks.adapter.hasGui.mockReturnValue(true);

      const instanceId = await useWAMStore.getState().loadPlugin(catalogEntry, 'track-1');

      expect(instanceId).toBe('wam-instance-1');
      expect(mocks.wamHost.loadPlugin).toHaveBeenCalledWith(catalogEntry.url);
      expect(mocks.WAMPluginAdapter.create).toHaveBeenCalled();
      expect(mocks.pluginEngine.addPlugin).toHaveBeenCalledWith(
        'track-1',
        'wam-instance-1',
        mocks.adapter,
        mocks.audioContext,
      );

      const instance = useWAMStore.getState().instances['wam-instance-1'];
      expect(instance).toMatchObject({
        instanceId: 'wam-instance-1',
        pluginId: 'mock-plugin',
        pluginName: 'Mock WAM',
        vendor: 'Mock Vendor',
        trackId: 'track-1',
        enabled: true,
        hasGui: true,
        parameterValues: {
          gain: 0.75,
          enabled: 1,
          mode: 1,
        },
      });
      expect(instance.parameters).toEqual([
        expect.objectContaining({ id: 'gain', type: 'float', defaultValue: 1, discreteStep: 0.01 }),
        expect.objectContaining({ id: 'enabled', type: 'boolean', defaultValue: 1, discreteStep: 1 }),
        expect.objectContaining({ id: 'mode', type: 'choice', choices: ['Narrow', 'Wide'], defaultValue: 0 }),
      ]);
      expect(useWAMStore.getState().pluginOrder['track-1']).toEqual(['wam-instance-1']);
    });

    it('returns null when the host is not ready', async () => {
      const instanceId = await useWAMStore.getState().loadPlugin(catalogEntry, 'track-1');

      expect(instanceId).toBeNull();
      expect(mocks.wamHost.loadPlugin).not.toHaveBeenCalled();
      expect(mocks.pluginEngine.addPlugin).not.toHaveBeenCalled();
    });
  });

  describe('toggleInstance', () => {
    it('should toggle enabled state', () => {
      seedInstance();

      useWAMStore.getState().toggleInstance('inst-1');
      expect(useWAMStore.getState().instances['inst-1'].enabled).toBe(false);
      expect(mocks.pluginEngine.setPluginBypassed).toHaveBeenLastCalledWith('track-1', 'inst-1', true);

      useWAMStore.getState().toggleInstance('inst-1');
      expect(useWAMStore.getState().instances['inst-1'].enabled).toBe(true);
      expect(mocks.pluginEngine.setPluginBypassed).toHaveBeenLastCalledWith('track-1', 'inst-1', false);
    });

    it('should no-op for non-existent instance', () => {
      const before = useWAMStore.getState().instances;
      useWAMStore.getState().toggleInstance('nonexistent');
      expect(useWAMStore.getState().instances).toBe(before);
    });
  });

  describe('setParameter', () => {
    it('should update parameter value in store', () => {
      seedInstance({ parameterValues: { gain: 0.5 } });

      useWAMStore.getState().setParameter('inst-1', 'gain', 0.8);
      expect(useWAMStore.getState().instances['inst-1'].parameterValues.gain).toBe(0.8);
    });
  });

  describe('toggleGui', () => {
    it('should toggle GUI visibility', () => {
      seedInstance({ pluginId: 'test', hasGui: true });

      useWAMStore.getState().toggleGui('inst-1');
      expect(useWAMStore.getState().instances['inst-1'].guiVisible).toBe(true);
    });
  });

  describe('removeInstance', () => {
    it('should remove instance and update order', () => {
      seedInstance({ pluginId: 'test' });

      useWAMStore.getState().removeInstance('inst-1');
      expect(useWAMStore.getState().instances['inst-1']).toBeUndefined();
      expect(useWAMStore.getState().pluginOrder['track-1']).toEqual([]);
    });

    it('should remove plugin-engine instances through PluginEngine', () => {
      const instance = seedInstance({ pluginId: 'test' });
      useWAMStore.setState({
        _adapters: new Map([[instance.instanceId, mocks.adapter as unknown as WAMPluginAdapter]]),
      });
      mocks.pluginEngine.getPlugin.mockReturnValueOnce(mocks.adapter);

      useWAMStore.getState().removeInstance('inst-1');

      expect(mocks.pluginEngine.removePlugin).toHaveBeenCalledWith('track-1', 'inst-1');
      expect(mocks.adapter.dispose).not.toHaveBeenCalled();
      expect(useWAMStore.getState()._adapters.has('inst-1')).toBe(false);
    });

    it('should dispose adapters that were not registered with PluginEngine', () => {
      const instance = seedInstance({ pluginId: 'test' });
      useWAMStore.setState({
        _adapters: new Map([[instance.instanceId, mocks.adapter as unknown as WAMPluginAdapter]]),
      });

      useWAMStore.getState().removeInstance('inst-1');

      expect(mocks.pluginEngine.removePlugin).not.toHaveBeenCalled();
      expect(mocks.adapter.dispose).toHaveBeenCalled();
    });
  });

  describe('presets', () => {
    it('should save and restore UTF-8 WAM state safely', async () => {
      const instance = seedInstance({ pluginId: 'test', parameterValues: { gain: 0.5 } });
      useWAMStore.setState({
        _adapters: new Map([[instance.instanceId, mocks.adapter as unknown as WAMPluginAdapter]]),
      });
      mocks.adapter.getState.mockResolvedValueOnce({ label: '音色', nested: { value: '広い' } });

      await useWAMStore.getState().savePreset('inst-1', 'Wide Lead');
      await useWAMStore.getState().loadPreset('inst-1', 'Wide Lead');

      expect(mocks.adapter.setState).toHaveBeenCalledWith({ label: '音色', nested: { value: '広い' } });
      expect(mocks.adapter.setParameter).toHaveBeenCalledWith('gain', 0.5);
      expect(useWAMStore.getState().instances['inst-1'].activePreset).toBe('Wide Lead');
    });

    it('should fall back to parameter values when preset state cannot be decoded', async () => {
      const instance = seedInstance({ pluginId: 'test', parameterValues: { gain: 0.5 } });
      useWAMStore.setState({
        _adapters: new Map([[instance.instanceId, mocks.adapter as unknown as WAMPluginAdapter]]),
        presets: {
          test: [{
            name: 'Broken State',
            pluginId: 'test',
            parameterValues: { gain: 0.9 },
            state: 'not valid base64',
          }],
        },
      });

      await useWAMStore.getState().loadPreset('inst-1', 'Broken State');

      expect(mocks.adapter.setState).not.toHaveBeenCalled();
      expect(mocks.adapter.setParameter).toHaveBeenCalledWith('gain', 0.9);
      expect(useWAMStore.getState().instances['inst-1'].parameterValues).toEqual({ gain: 0.9 });
    });
  });

  describe('reorderPlugins', () => {
    it('should update plugin order for a track with valid instances', () => {
      // Seed instances so the validation filter keeps them
      useWAMStore.setState({
        instances: {
          a: createInstance({ instanceId: 'a', trackId: 'track-1' }),
          b: createInstance({ instanceId: 'b', trackId: 'track-1' }),
          c: createInstance({ instanceId: 'c', trackId: 'track-1' }),
        },
        pluginOrder: { 'track-1': ['a', 'b', 'c'] },
      });

      useWAMStore.getState().reorderPlugins('track-1', ['b', 'a', 'c']);
      expect(useWAMStore.getState().pluginOrder['track-1']).toEqual(['b', 'a', 'c']);
    });

    it('should filter out invalid instance IDs', () => {
      seedInstance();
      useWAMStore.getState().reorderPlugins('track-1', ['inst-1', 'nonexistent']);
      expect(useWAMStore.getState().pluginOrder['track-1']).toEqual(['inst-1']);
    });

    it('should no-op when all IDs are invalid', () => {
      useWAMStore.getState().reorderPlugins('track-1', ['x', 'y', 'z']);
      expect(useWAMStore.getState().pluginOrder['track-1']).toBeUndefined();
    });
  });

  describe('getCatalog', () => {
    it('should return the WAM catalog', () => {
      const catalog = useWAMStore.getState().getCatalog();
      expect(catalog).toBe(WAM_CATALOG);
      expect(catalog.length).toBeGreaterThan(0);
    });
  });

  describe('searchCatalog', () => {
    it('should search by name', () => {
      const results = useWAMStore.getState().searchCatalog('delay');
      expect(results.some((e) => e.name.toLowerCase().includes('delay'))).toBe(true);
    });

    it('should filter by category', () => {
      const results = useWAMStore.getState().searchCatalog('', 'instrument');
      expect(results.every((e) => e.category === 'instrument')).toBe(true);
    });

    it('should return all when query is empty', () => {
      const results = useWAMStore.getState().searchCatalog('');
      expect(results.length).toBe(WAM_CATALOG.length);
    });
  });
});

describe('searchCatalog (standalone)', () => {
  it('should match by tags', () => {
    const results = searchCatalog('analog');
    expect(results.length).toBeGreaterThan(0);
  });

  it('should match by vendor', () => {
    const results = searchCatalog('WAM Team');
    expect(results.length).toBe(WAM_CATALOG.length);
  });

  it('should match multiple terms', () => {
    const results = searchCatalog('delay stereo');
    expect(results.length).toBeGreaterThan(0);
  });

  it('should return empty for no match', () => {
    const results = searchCatalog('xyznonexistent');
    expect(results.length).toBe(0);
  });
});
