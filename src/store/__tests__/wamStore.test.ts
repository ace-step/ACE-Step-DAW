import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useWAMStore } from '../wamStore';
import { WAM_CATALOG, searchCatalog } from '../../services/wam/WAMCatalog';

describe('wamStore', () => {
  beforeEach(() => {
    // Reset store to initial state
    useWAMStore.setState({
      hostStatus: 'idle',
      hostError: null,
      instances: {},
      pluginOrder: {},
      presets: {},
      _adapters: new Map(),
    });
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

  describe('toggleInstance', () => {
    it('should toggle enabled state', () => {
      // Seed an instance
      useWAMStore.setState({
        instances: {
          'inst-1': {
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
          },
        },
      });

      useWAMStore.getState().toggleInstance('inst-1');
      expect(useWAMStore.getState().instances['inst-1'].enabled).toBe(false);

      useWAMStore.getState().toggleInstance('inst-1');
      expect(useWAMStore.getState().instances['inst-1'].enabled).toBe(true);
    });

    it('should no-op for non-existent instance', () => {
      const before = useWAMStore.getState().instances;
      useWAMStore.getState().toggleInstance('nonexistent');
      expect(useWAMStore.getState().instances).toBe(before);
    });
  });

  describe('setParameter', () => {
    it('should update parameter value in store', () => {
      useWAMStore.setState({
        instances: {
          'inst-1': {
            instanceId: 'inst-1',
            pluginId: 'test-plugin',
            pluginName: 'Test',
            vendor: 'Test',
            trackId: 'track-1',
            enabled: true,
            parameters: [],
            parameterValues: { gain: 0.5 },
            activePreset: null,
            presets: [],
            hasGui: false,
            guiVisible: false,
            descriptor: null,
          },
        },
      });

      useWAMStore.getState().setParameter('inst-1', 'gain', 0.8);
      expect(useWAMStore.getState().instances['inst-1'].parameterValues.gain).toBe(0.8);
    });
  });

  describe('toggleGui', () => {
    it('should toggle GUI visibility', () => {
      useWAMStore.setState({
        instances: {
          'inst-1': {
            instanceId: 'inst-1',
            pluginId: 'test',
            pluginName: 'Test',
            vendor: 'Test',
            trackId: 'track-1',
            enabled: true,
            parameters: [],
            parameterValues: {},
            activePreset: null,
            presets: [],
            hasGui: true,
            guiVisible: false,
            descriptor: null,
          },
        },
      });

      useWAMStore.getState().toggleGui('inst-1');
      expect(useWAMStore.getState().instances['inst-1'].guiVisible).toBe(true);
    });
  });

  describe('removeInstance', () => {
    it('should remove instance and update order', () => {
      useWAMStore.setState({
        instances: {
          'inst-1': {
            instanceId: 'inst-1',
            pluginId: 'test',
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
          },
        },
        pluginOrder: { 'track-1': ['inst-1'] },
      });

      useWAMStore.getState().removeInstance('inst-1');
      expect(useWAMStore.getState().instances['inst-1']).toBeUndefined();
      expect(useWAMStore.getState().pluginOrder['track-1']).toEqual([]);
    });
  });

  describe('reorderPlugins', () => {
    it('should update plugin order for a track', () => {
      useWAMStore.getState().reorderPlugins('track-1', ['b', 'a', 'c']);
      expect(useWAMStore.getState().pluginOrder['track-1']).toEqual(['b', 'a', 'c']);
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
