/**
 * Tests for PluginRegistry — both WAP and VST3 plugin support.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginRegistry } from '../PluginRegistry';
import type {
  WAPPlugin,
  PluginFactory,
  PluginAudioNode,
  PluginParamDescriptor,
  PluginParamValues,
  PluginParamValue,
  VST3PluginManifest,
  VST3PluginInfo,
} from '../../types/plugin';

// ─── Helpers ────────────────────────────────────────────────────────────────

function createMockWAPPlugin(overrides: Partial<WAPPlugin> = {}): WAPPlugin {
  return {
    name: 'Test Effect',
    pluginType: 'effect',
    version: '1.0.0',
    author: 'Test',
    description: 'A test plugin',
    createAudioNode: vi.fn(() => ({
      inputNode: {} as AudioNode,
      outputNode: {} as AudioNode,
    })),
    getParameterDescriptors: vi.fn(() => [
      { id: 'mix', name: 'Mix', type: 'float', min: 0, max: 1, defaultValue: 0.5 } as PluginParamDescriptor,
    ]),
    setParameter: vi.fn(),
    getParameter: vi.fn(),
    getParameters: vi.fn(() => ({ mix: 0.5 })),
    dispose: vi.fn(),
    ...overrides,
  };
}

function createMockFactory(overrides: Partial<WAPPlugin> = {}): PluginFactory {
  return () => createMockWAPPlugin(overrides);
}

function createMockAudioContext(): AudioContext {
  return {} as AudioContext;
}

function createMockVST3Info(overrides: Partial<VST3PluginInfo> = {}): VST3PluginInfo {
  return {
    uid: 'ABCD1234',
    name: 'VST3 Reverb',
    vendor: 'TestVendor',
    pluginType: 'effect',
    version: '2.0.0',
    description: 'A VST3 reverb plugin',
    latencySamples: 128,
    outputBusses: [{ name: 'Stereo Out', channels: 2 }],
    hasEditor: true,
    parameters: [
      { id: 'decay', name: 'Decay', type: 'float', min: 0, max: 10, defaultValue: 2.5 } as PluginParamDescriptor,
    ],
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  // ── Existing WAP registration ─────────────────────────────────────────

  describe('WAP plugin registration', () => {
    it('registers a WAP plugin factory and returns manifest', () => {
      const manifest = registry.registerPlugin('test-fx', createMockFactory());
      expect(manifest.id).toBe('test-fx');
      expect(manifest.name).toBe('Test Effect');
      expect(manifest.pluginType).toBe('effect');
      expect(manifest.parameters).toHaveLength(1);
    });

    it('createInstance works for WAP plugins', () => {
      registry.registerPlugin('test-fx', createMockFactory());
      const ctx = createMockAudioContext();
      const { instance, plugin } = registry.createInstance('test-fx', ctx);

      expect(instance.pluginId).toBe('test-fx');
      expect(instance.enabled).toBe(true);
      expect(instance.params).toEqual({ mix: 0.5 });
      expect(plugin.createAudioNode).toHaveBeenCalledWith(ctx);
    });
  });

  // ── VST3 registration ────────────────────────────────────────────────

  describe('VST3 plugin registration', () => {
    it('registers a VST3 plugin manifest', () => {
      const info = createMockVST3Info();
      const adapterFactory = vi.fn(() => createMockWAPPlugin());

      const manifest = registry.registerVST3Plugin(
        {
          id: `vst3:${info.uid}`,
          name: info.name,
          pluginType: info.pluginType,
          version: info.version,
          author: info.vendor,
          description: info.description,
          parameters: info.parameters,
          vst3Uid: info.uid,
          vendor: info.vendor,
          latencySamples: info.latencySamples,
          outputBusses: info.outputBusses,
          hasEditor: info.hasEditor,
          isVST3: true,
        },
        adapterFactory,
      );

      expect(manifest.id).toBe('vst3:ABCD1234');
      expect(manifest.isVST3).toBe(true);
      expect(manifest.vst3Uid).toBe('ABCD1234');
      expect(manifest.vendor).toBe('TestVendor');
    });

    it('getAvailablePlugins returns both WAP and VST3', () => {
      registry.registerPlugin('test-fx', createMockFactory());

      const info = createMockVST3Info();
      registry.registerVST3Plugin(
        {
          id: `vst3:${info.uid}`,
          name: info.name,
          pluginType: info.pluginType,
          version: info.version,
          author: info.vendor,
          description: info.description,
          parameters: info.parameters,
          vst3Uid: info.uid,
          vendor: info.vendor,
          latencySamples: info.latencySamples,
          outputBusses: info.outputBusses,
          hasEditor: info.hasEditor,
          isVST3: true,
        },
        vi.fn(() => createMockWAPPlugin()),
      );

      const all = registry.getAvailablePlugins();
      expect(all).toHaveLength(2);
    });

    it('getVST3Plugins returns only VST3 manifests', () => {
      registry.registerPlugin('test-fx', createMockFactory());

      const info = createMockVST3Info();
      registry.registerVST3Plugin(
        {
          id: `vst3:${info.uid}`,
          name: info.name,
          pluginType: info.pluginType,
          version: info.version,
          author: info.vendor,
          description: info.description,
          parameters: info.parameters,
          vst3Uid: info.uid,
          vendor: info.vendor,
          latencySamples: info.latencySamples,
          outputBusses: info.outputBusses,
          hasEditor: info.hasEditor,
          isVST3: true,
        },
        vi.fn(() => createMockWAPPlugin()),
      );

      const vst3Only = registry.getVST3Plugins();
      expect(vst3Only).toHaveLength(1);
      expect(vst3Only[0].isVST3).toBe(true);
      expect(vst3Only[0].vst3Uid).toBe('ABCD1234');
    });

    it('isVST3Plugin correctly identifies VST3 vs WAP', () => {
      registry.registerPlugin('test-fx', createMockFactory());

      const info = createMockVST3Info();
      registry.registerVST3Plugin(
        {
          id: `vst3:${info.uid}`,
          name: info.name,
          pluginType: info.pluginType,
          version: info.version,
          author: info.vendor,
          description: info.description,
          parameters: info.parameters,
          vst3Uid: info.uid,
          vendor: info.vendor,
          latencySamples: info.latencySamples,
          outputBusses: info.outputBusses,
          hasEditor: info.hasEditor,
          isVST3: true,
        },
        vi.fn(() => createMockWAPPlugin()),
      );

      expect(registry.isVST3Plugin('vst3:ABCD1234')).toBe(true);
      expect(registry.isVST3Plugin('test-fx')).toBe(false);
      expect(registry.isVST3Plugin('nonexistent')).toBe(false);
    });

    it('createInstanceAsync works for WAP plugins (sync path)', async () => {
      registry.registerPlugin('test-fx', createMockFactory());
      const ctx = createMockAudioContext();

      const { instance, plugin } = await registry.createInstanceAsync('test-fx', ctx);
      expect(instance.pluginId).toBe('test-fx');
      expect(plugin.createAudioNode).toHaveBeenCalledWith(ctx);
    });

    it('createInstanceAsync works for VST3 plugins (async path)', async () => {
      const mockPlugin = createMockWAPPlugin({ name: 'VST3 Reverb' });
      const adapterFactory = vi.fn(() => mockPlugin);

      const info = createMockVST3Info();
      registry.registerVST3Plugin(
        {
          id: `vst3:${info.uid}`,
          name: info.name,
          pluginType: info.pluginType,
          version: info.version,
          author: info.vendor,
          description: info.description,
          parameters: info.parameters,
          vst3Uid: info.uid,
          vendor: info.vendor,
          latencySamples: info.latencySamples,
          outputBusses: info.outputBusses,
          hasEditor: info.hasEditor,
          isVST3: true,
        },
        adapterFactory,
      );

      const ctx = createMockAudioContext();
      const { instance, plugin } = await registry.createInstanceAsync('vst3:ABCD1234', ctx);

      expect(instance.pluginId).toBe('vst3:ABCD1234');
      expect(instance.manifest.name).toBe('VST3 Reverb');
      expect(adapterFactory).toHaveBeenCalled();
      expect(plugin).toBe(mockPlugin);
    });

    it('unregisterVST3Plugins removes only VST3 entries', () => {
      registry.registerPlugin('test-fx', createMockFactory());

      const info = createMockVST3Info();
      registry.registerVST3Plugin(
        {
          id: `vst3:${info.uid}`,
          name: info.name,
          pluginType: info.pluginType,
          version: info.version,
          author: info.vendor,
          description: info.description,
          parameters: info.parameters,
          vst3Uid: info.uid,
          vendor: info.vendor,
          latencySamples: info.latencySamples,
          outputBusses: info.outputBusses,
          hasEditor: info.hasEditor,
          isVST3: true,
        },
        vi.fn(() => createMockWAPPlugin()),
      );

      expect(registry.getAvailablePlugins()).toHaveLength(2);

      registry.unregisterVST3Plugins();

      expect(registry.getAvailablePlugins()).toHaveLength(1);
      expect(registry.getAvailablePlugins()[0].id).toBe('test-fx');
      expect(registry.isRegistered('vst3:ABCD1234')).toBe(false);
      expect(registry.isRegistered('test-fx')).toBe(true);
    });

    it('registerVST3Plugins batch-registers from scan results', () => {
      const plugins: VST3PluginInfo[] = [
        createMockVST3Info({ uid: 'UID001', name: 'Reverb' }),
        createMockVST3Info({ uid: 'UID002', name: 'Delay' }),
      ];

      const createAdapter = vi.fn(async () => createMockWAPPlugin());

      registry.registerVST3Plugins(plugins, createAdapter);

      expect(registry.getAvailablePlugins()).toHaveLength(2);
      expect(registry.isVST3Plugin('vst3:UID001')).toBe(true);
      expect(registry.isVST3Plugin('vst3:UID002')).toBe(true);
    });
  });
});
