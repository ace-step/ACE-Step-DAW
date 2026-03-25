import { describe, it, expect, beforeEach, vi } from 'vitest';

import { useVST3Store } from '../vst3Store';
import type { VST3ActiveInstance, VST3PluginInfo } from '../../types/vst3';

const mockPlugin = (overrides: Partial<VST3PluginInfo> = {}): VST3PluginInfo => ({
  id: 'plugin-1',
  name: 'Serum',
  vendor: 'Xfer Records',
  version: '1.0.0',
  category: 'instrument',
  subcategory: 'Synthesizer',
  ...overrides,
});

const mockInstance = (overrides: Partial<VST3ActiveInstance> = {}): VST3ActiveInstance => ({
  instanceId: 'inst-1',
  pluginId: 'plugin-1',
  pluginName: 'Serum',
  vendor: 'Xfer Records',
  trackId: 'track-1',
  enabled: true,
  online: true,
  parameters: [],
  presets: [],
  activePreset: null,
  ...overrides,
});

describe('vst3Store', () => {
  beforeEach(() => {
    // Reset store to initial state
    useVST3Store.setState({
      connectionStatus: 'disconnected',
      connectionError: null,
      companionVersion: null,
      plugins: [],
      scanning: false,
      scanProgress: null,
      instances: {},
    });
  });

  describe('initial state', () => {
    it('starts disconnected with no plugins and no instances', () => {
      const state = useVST3Store.getState();
      expect(state.connectionStatus).toBe('disconnected');
      expect(state.connectionError).toBeNull();
      expect(state.companionVersion).toBeNull();
      expect(state.scanning).toBe(false);
      expect(state.scanProgress).toBeNull();
      expect(state.plugins).toEqual([]);
      expect(state.instances).toEqual({});
    });
  });

  describe('connection actions', () => {
    it('connect sets status to connecting', () => {
      useVST3Store.getState().connect();
      expect(useVST3Store.getState().connectionStatus).toBe('connecting');
    });

    it('disconnect sets status to disconnected and clears version', () => {
      useVST3Store.setState({ connectionStatus: 'connected', companionVersion: '1.0' });
      useVST3Store.getState().disconnect();
      expect(useVST3Store.getState().connectionStatus).toBe('disconnected');
      expect(useVST3Store.getState().companionVersion).toBeNull();
    });
  });

  describe('public setters', () => {
    it('setConnectionStatus updates connectionStatus', () => {
      useVST3Store.getState().setConnectionStatus('connecting');
      expect(useVST3Store.getState().connectionStatus).toBe('connecting');

      useVST3Store.getState().setConnectionStatus('connected');
      expect(useVST3Store.getState().connectionStatus).toBe('connected');
    });

    it('setConnectionError updates connectionError', () => {
      useVST3Store.getState().setConnectionError('Timeout');
      expect(useVST3Store.getState().connectionError).toBe('Timeout');

      useVST3Store.getState().setConnectionError(null);
      expect(useVST3Store.getState().connectionError).toBeNull();
    });

    it('setCompanionVersion updates companionVersion', () => {
      useVST3Store.getState().setCompanionVersion('1.2.0');
      expect(useVST3Store.getState().companionVersion).toBe('1.2.0');
    });

    it('setScannedPlugins sets plugins, stops scanning, clears progress', () => {
      useVST3Store.setState({ scanning: true, scanProgress: { scanned: 5, total: 10, currentPlugin: 'X' } });
      const plugins = [mockPlugin()];
      useVST3Store.getState().setScannedPlugins(plugins);
      const state = useVST3Store.getState();
      expect(state.plugins).toEqual(plugins);
      expect(state.scanning).toBe(false);
      expect(state.scanProgress).toBeNull();
    });
  });

  describe('scan lifecycle', () => {
    it('scanPlugins sets scanning true and clears progress', () => {
      useVST3Store.getState().scanPlugins();
      const state = useVST3Store.getState();
      expect(state.scanning).toBe(true);
      expect(state.scanProgress).toBeNull();
    });
  });

  describe('internal setters', () => {
    it('_setConnectionStatus updates status', () => {
      useVST3Store.getState()._setConnectionStatus('connected');
      expect(useVST3Store.getState().connectionStatus).toBe('connected');
    });

    it('_setCompanionVersion updates version', () => {
      useVST3Store.getState()._setCompanionVersion('2.0.0');
      expect(useVST3Store.getState().companionVersion).toBe('2.0.0');
    });

    it('_setPlugins updates plugins', () => {
      const plugins = [mockPlugin()];
      useVST3Store.getState()._setPlugins(plugins);
      expect(useVST3Store.getState().plugins).toEqual(plugins);
    });

    it('_setScanning updates scanning', () => {
      useVST3Store.getState()._setScanning(true);
      expect(useVST3Store.getState().scanning).toBe(true);
    });

    it('_setScanProgress updates scan progress', () => {
      const progress = { scanned: 3, total: 10, currentPlugin: 'Serum' };
      useVST3Store.getState()._setScanProgress(progress);
      expect(useVST3Store.getState().scanProgress).toEqual(progress);
    });
  });

  describe('instance management', () => {
    it('_upsertInstance adds an instance', () => {
      const instance = mockInstance();
      useVST3Store.getState()._upsertInstance(instance);
      expect(useVST3Store.getState().instances['inst-1']).toEqual(instance);
    });

    it('_upsertInstance updates an existing instance', () => {
      useVST3Store.getState()._upsertInstance(mockInstance());
      useVST3Store.getState()._upsertInstance(mockInstance({ enabled: false }));
      expect(useVST3Store.getState().instances['inst-1'].enabled).toBe(false);
    });

    it('removeInstance removes an instance', () => {
      useVST3Store.getState()._upsertInstance(mockInstance());
      useVST3Store.getState().removeInstance('inst-1');
      expect(useVST3Store.getState().instances['inst-1']).toBeUndefined();
    });

    it('removing non-existent instance is a no-op', () => {
      useVST3Store.getState()._upsertInstance(mockInstance());
      useVST3Store.getState().removeInstance('non-existent');
      expect(Object.keys(useVST3Store.getState().instances)).toHaveLength(1);
    });

    it('toggleInstance toggles enabled state', () => {
      useVST3Store.getState()._upsertInstance(mockInstance({ enabled: true }));
      useVST3Store.getState().toggleInstance('inst-1');
      expect(useVST3Store.getState().instances['inst-1'].enabled).toBe(false);

      useVST3Store.getState().toggleInstance('inst-1');
      expect(useVST3Store.getState().instances['inst-1'].enabled).toBe(true);
    });

    it('toggleInstance does nothing for non-existent instance', () => {
      useVST3Store.getState().toggleInstance('non-existent');
      expect(Object.keys(useVST3Store.getState().instances)).toHaveLength(0);
    });

    it('selectPreset updates activePreset', () => {
      useVST3Store.getState()._upsertInstance(mockInstance());
      useVST3Store.getState().selectPreset('inst-1', 'Init');
      expect(useVST3Store.getState().instances['inst-1'].activePreset).toBe('Init');
    });

    it('setParameter updates a parameter value', () => {
      const params = [
        { id: 1, name: 'Cutoff', value: 0.5, minValue: 0, maxValue: 1, defaultValue: 0.5, enumValues: [], unit: 'Hz' },
        { id: 2, name: 'Resonance', value: 0.3, minValue: 0, maxValue: 1, defaultValue: 0, enumValues: [], unit: '' },
      ];
      useVST3Store.getState()._upsertInstance(mockInstance({ parameters: params }));
      useVST3Store.getState().setParameter('inst-1', 1, 0.9);
      expect(useVST3Store.getState().instances['inst-1'].parameters[0].value).toBe(0.9);
      expect(useVST3Store.getState().instances['inst-1'].parameters[1].value).toBe(0.3);
    });
  });

  describe('markAllInstancesOffline', () => {
    it('sets online=false on all instances', () => {
      useVST3Store.getState()._upsertInstance(mockInstance({ instanceId: 'i1', online: true }));
      useVST3Store.getState()._upsertInstance(mockInstance({ instanceId: 'i2', online: true }));
      useVST3Store.getState().markAllInstancesOffline();
      const { instances } = useVST3Store.getState();
      expect(instances['i1'].online).toBe(false);
      expect(instances['i2'].online).toBe(false);
    });
  });

  describe('loadPlugin', () => {
    const pluginInfo = mockPlugin({ id: 'com.xfer.serum', name: 'Serum', vendor: 'Xfer Records' });

    beforeEach(() => {
      useVST3Store.setState({ plugins: [pluginInfo], connectionStatus: 'connected' });
    });

    it('creates an instance in the store on success', async () => {
      const { _getBridgeClient } = await import('../../hooks/useVST3Connection');
      const client = _getBridgeClient();

      // Intercept on/off to capture event listeners registered by loadPlugin
      const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
      client.on = vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      });
      client.off = vi.fn();

      // Mock createInstance to simulate the companion responding with instanceCreated
      const mockCreateInstance = vi.fn().mockImplementation((_pluginUid: string, instanceId: string) => {
        queueMicrotask(() => {
          for (const fn of listeners['instanceCreated'] ?? []) {
            fn({ type: 'instanceCreated', instanceId, parameters: [] });
          }
        });
        return Promise.resolve();
      });
      client.createInstance = mockCreateInstance;

      await useVST3Store.getState().loadPlugin('com.xfer.serum', 'track-1');

      // Should have called createInstance with the pluginId and a generated instanceId
      expect(mockCreateInstance).toHaveBeenCalledWith('com.xfer.serum', expect.any(String));

      // Should have created an instance in the store
      const { instances } = useVST3Store.getState();
      const instanceIds = Object.keys(instances);
      expect(instanceIds).toHaveLength(1);

      const instance = instances[instanceIds[0]];
      expect(instance.pluginId).toBe('com.xfer.serum');
      expect(instance.pluginName).toBe('Serum');
      expect(instance.vendor).toBe('Xfer Records');
      expect(instance.trackId).toBe('track-1');
      expect(instance.enabled).toBe(true);
      expect(instance.online).toBe(true);
    });

    it('does not create an instance when bridge call fails', async () => {
      const { _getBridgeClient } = await import('../../hooks/useVST3Connection');
      const client = _getBridgeClient();

      const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
      client.on = vi.fn().mockImplementation((event: string, handler: (...args: unknown[]) => void) => {
        if (!listeners[event]) listeners[event] = [];
        listeners[event].push(handler);
      });
      client.off = vi.fn();

      client.createInstance = vi.fn().mockImplementation(() => {
        // Trigger the error listener
        queueMicrotask(() => {
          for (const fn of listeners['error'] ?? []) {
            fn('Connection lost');
          }
        });
        return Promise.resolve();
      });

      await useVST3Store.getState().loadPlugin('com.xfer.serum', 'track-1');

      const { instances } = useVST3Store.getState();
      expect(Object.keys(instances)).toHaveLength(0);
    });

    it('does not create instance for unknown plugin', async () => {
      await useVST3Store.getState().loadPlugin('unknown-plugin', 'track-1');

      const { instances } = useVST3Store.getState();
      expect(Object.keys(instances)).toHaveLength(0);
    });
  });
});
