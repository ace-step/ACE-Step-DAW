/**
 * Tests for PluginEngine — manages plugin audio nodes on tracks.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PluginEngine } from '../PluginEngine';
import type {
  WAPPlugin,
  PluginAudioNode,
  PluginInstance,
  PluginParamDescriptor,
  PluginParamValue,
  PluginParamValues,
  PluginManifest,
} from '../../types/plugin';

// ─── Mock PluginRegistry ─────────────────────────────────────────────────────

vi.mock('../PluginRegistry', () => ({
  pluginRegistry: {
    getInstance: vi.fn(),
    isRegistered: vi.fn(),
    createInstance: vi.fn(),
    disposeInstance: vi.fn(),
  },
}));

import { pluginRegistry } from '../PluginRegistry';

const mockedRegistry = vi.mocked(pluginRegistry);

// ─── Helpers ─────────────────────────────────────────────────────────────────

function createMockAudioNode(): { node: AudioNode; connect: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> } {
  const disconnect = vi.fn();
  const connect = vi.fn();
  const node = { connect, disconnect } as unknown as AudioNode;
  return { node, connect, disconnect };
}

function createMockPluginAudioNode(hasInput = true): {
  audioNode: PluginAudioNode;
  inputMock: ReturnType<typeof createMockAudioNode> | null;
  outputMock: ReturnType<typeof createMockAudioNode>;
} {
  const outputMock = createMockAudioNode();
  const inputMock = hasInput ? createMockAudioNode() : null;
  const audioNode: PluginAudioNode = {
    inputNode: inputMock ? inputMock.node : null,
    outputNode: outputMock.node,
  };
  return { audioNode, inputMock, outputMock };
}

function createMockWAPPlugin(overrides: Partial<WAPPlugin> = {}): WAPPlugin {
  const { audioNode } = createMockPluginAudioNode();
  return {
    name: 'Test Effect',
    pluginType: 'effect',
    version: '1.0.0',
    author: 'Test',
    description: 'A test plugin',
    createAudioNode: vi.fn(() => audioNode),
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

function createMockAudioContext(): AudioContext {
  return {} as AudioContext;
}

function createMockPluginInstance(overrides: Partial<PluginInstance> = {}): PluginInstance {
  return {
    id: 'inst-1',
    pluginId: 'test-fx',
    enabled: true,
    params: { mix: 0.7 },
    manifest: {
      id: 'test-fx',
      name: 'Test Effect',
      pluginType: 'effect',
      version: '1.0.0',
      author: 'Test',
      description: 'A test plugin',
      parameters: [],
    },
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('PluginEngine', () => {
  let engine: PluginEngine;
  let ctx: AudioContext;

  beforeEach(() => {
    engine = new PluginEngine();
    ctx = createMockAudioContext();
    vi.clearAllMocks();
  });

  // ── addPlugin ──────────────────────────────────────────────────────────

  describe('addPlugin', () => {
    it('adds a plugin and returns its audio node', () => {
      const plugin = createMockWAPPlugin();
      const result = engine.addPlugin('track-1', 'inst-1', plugin, ctx);

      expect(plugin.createAudioNode).toHaveBeenCalledWith(ctx);
      expect(result.outputNode).toBe((plugin.createAudioNode as ReturnType<typeof vi.fn>).mock.results[0].value.outputNode);
      expect(result.inputNode).toBe((plugin.createAudioNode as ReturnType<typeof vi.fn>).mock.results[0].value.inputNode);
    });

    it('connects second plugin to first plugin in chain', () => {
      const output1Mock = createMockAudioNode();
      const input2Mock = createMockAudioNode();

      const plugin1 = createMockWAPPlugin({
        createAudioNode: vi.fn(() => ({
          inputNode: createMockAudioNode().node,
          outputNode: output1Mock.node,
        })),
      });
      const plugin2 = createMockWAPPlugin({
        createAudioNode: vi.fn(() => ({
          inputNode: input2Mock.node,
          outputNode: createMockAudioNode().node,
        })),
      });

      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.addPlugin('track-1', 'inst-2', plugin2, ctx);

      expect(output1Mock.connect).toHaveBeenCalledWith(input2Mock.node);
    });

    it('does not connect when second plugin has no input node (instrument)', () => {
      const output1Mock = createMockAudioNode();

      const plugin1 = createMockWAPPlugin({
        createAudioNode: vi.fn(() => ({
          inputNode: createMockAudioNode().node,
          outputNode: output1Mock.node,
        })),
      });
      const plugin2 = createMockWAPPlugin({
        createAudioNode: vi.fn(() => ({
          inputNode: null,
          outputNode: createMockAudioNode().node,
        })),
      });

      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.addPlugin('track-1', 'inst-2', plugin2, ctx);

      expect(output1Mock.connect).not.toHaveBeenCalled();
    });

    it('adds plugins to separate tracks independently', () => {
      const plugin1 = createMockWAPPlugin();
      const plugin2 = createMockWAPPlugin();

      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.addPlugin('track-2', 'inst-2', plugin2, ctx);

      expect(engine.getPlugin('track-1', 'inst-1')).toBe(plugin1);
      expect(engine.getPlugin('track-2', 'inst-2')).toBe(plugin2);
      expect(engine.getPlugin('track-1', 'inst-2')).toBe(undefined);
    });
  });

  // ── removePlugin ───────────────────────────────────────────────────────

  describe('removePlugin', () => {
    it('removes a plugin and disposes it', () => {
      const plugin = createMockWAPPlugin();
      engine.addPlugin('track-1', 'inst-1', plugin, ctx);

      engine.removePlugin('track-1', 'inst-1');

      expect(plugin.dispose).toHaveBeenCalledOnce();
      expect(mockedRegistry.disposeInstance).toHaveBeenCalledWith('inst-1');
      expect(engine.getPlugin('track-1', 'inst-1')).toBe(undefined);
    });

    it('reconnects prev to next when removing middle plugin', () => {
      const output1Mock = createMockAudioNode();
      const input3Mock = createMockAudioNode();

      const plugin1 = createMockWAPPlugin({
        createAudioNode: vi.fn(() => ({
          inputNode: createMockAudioNode().node,
          outputNode: output1Mock.node,
        })),
      });
      const plugin2 = createMockWAPPlugin({
        createAudioNode: vi.fn(() => ({
          inputNode: createMockAudioNode().node,
          outputNode: createMockAudioNode().node,
        })),
      });
      const plugin3 = createMockWAPPlugin({
        createAudioNode: vi.fn(() => ({
          inputNode: input3Mock.node,
          outputNode: createMockAudioNode().node,
        })),
      });

      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.addPlugin('track-1', 'inst-2', plugin2, ctx);
      engine.addPlugin('track-1', 'inst-3', plugin3, ctx);

      engine.removePlugin('track-1', 'inst-2');

      // prev output should disconnect, then reconnect to next input
      expect(output1Mock.disconnect).toHaveBeenCalled();
      expect(output1Mock.connect).toHaveBeenCalledWith(input3Mock.node);
    });

    it('does nothing for nonexistent track', () => {
      // Should not throw
      engine.removePlugin('nonexistent', 'inst-1');
    });

    it('does nothing for nonexistent instance on existing track', () => {
      const plugin = createMockWAPPlugin();
      engine.addPlugin('track-1', 'inst-1', plugin, ctx);

      engine.removePlugin('track-1', 'nonexistent');

      // Original plugin still present
      expect(engine.getPlugin('track-1', 'inst-1')).toBe(plugin);
    });

    it('deletes the chain map entry when last plugin is removed', () => {
      const plugin = createMockWAPPlugin();
      engine.addPlugin('track-1', 'inst-1', plugin, ctx);

      engine.removePlugin('track-1', 'inst-1');

      expect(engine.getInputNode('track-1')).toBe(null);
      expect(engine.getOutputNode('track-1')).toBe(null);
    });
  });

  // ── updateParam ────────────────────────────────────────────────────────

  describe('updateParam', () => {
    it('calls setParameter on the correct plugin', () => {
      const plugin = createMockWAPPlugin();
      engine.addPlugin('track-1', 'inst-1', plugin, ctx);

      engine.updateParam('track-1', 'inst-1', 'mix', 0.8);

      expect(plugin.setParameter).toHaveBeenCalledWith('mix', 0.8);
    });

    it('does nothing for nonexistent track', () => {
      // Should not throw
      engine.updateParam('nonexistent', 'inst-1', 'mix', 0.5);
    });

    it('does nothing for nonexistent instance', () => {
      const plugin = createMockWAPPlugin();
      engine.addPlugin('track-1', 'inst-1', plugin, ctx);

      engine.updateParam('track-1', 'nonexistent', 'mix', 0.5);

      expect(plugin.setParameter).not.toHaveBeenCalled();
    });

    it('handles different parameter value types', () => {
      const plugin = createMockWAPPlugin();
      engine.addPlugin('track-1', 'inst-1', plugin, ctx);

      engine.updateParam('track-1', 'inst-1', 'mode', 'lowpass');
      expect(plugin.setParameter).toHaveBeenCalledWith('mode', 'lowpass');

      engine.updateParam('track-1', 'inst-1', 'enabled', true);
      expect(plugin.setParameter).toHaveBeenCalledWith('enabled', true);

      engine.updateParam('track-1', 'inst-1', 'freq', 440);
      expect(plugin.setParameter).toHaveBeenCalledWith('freq', 440);
    });
  });

  // ── getInputNode / getOutputNode ───────────────────────────────────────

  describe('getInputNode / getOutputNode', () => {
    it('returns null for empty/nonexistent track', () => {
      expect(engine.getInputNode('nonexistent')).toBe(null);
      expect(engine.getOutputNode('nonexistent')).toBe(null);
    });

    it('returns first plugin input and last plugin output', () => {
      const input1Mock = createMockAudioNode();
      const output1Mock = createMockAudioNode();
      const input2Mock = createMockAudioNode();
      const output2Mock = createMockAudioNode();

      const plugin1 = createMockWAPPlugin({
        createAudioNode: vi.fn(() => ({
          inputNode: input1Mock.node,
          outputNode: output1Mock.node,
        })),
      });
      const plugin2 = createMockWAPPlugin({
        createAudioNode: vi.fn(() => ({
          inputNode: input2Mock.node,
          outputNode: output2Mock.node,
        })),
      });

      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.addPlugin('track-1', 'inst-2', plugin2, ctx);

      expect(engine.getInputNode('track-1')).toBe(input1Mock.node);
      expect(engine.getOutputNode('track-1')).toBe(output2Mock.node);
    });

    it('returns same node for single-plugin chain', () => {
      const inputMock = createMockAudioNode();
      const outputMock = createMockAudioNode();

      const plugin = createMockWAPPlugin({
        createAudioNode: vi.fn(() => ({
          inputNode: inputMock.node,
          outputNode: outputMock.node,
        })),
      });

      engine.addPlugin('track-1', 'inst-1', plugin, ctx);

      expect(engine.getInputNode('track-1')).toBe(inputMock.node);
      expect(engine.getOutputNode('track-1')).toBe(outputMock.node);
    });
  });

  // ── getPlugin ──────────────────────────────────────────────────────────

  describe('getPlugin', () => {
    it('returns the plugin for a valid track and instance', () => {
      const plugin = createMockWAPPlugin();
      engine.addPlugin('track-1', 'inst-1', plugin, ctx);

      expect(engine.getPlugin('track-1', 'inst-1')).toBe(plugin);
    });

    it('returns undefined for nonexistent track', () => {
      expect(engine.getPlugin('nonexistent', 'inst-1')).toBe(undefined);
    });

    it('returns undefined for nonexistent instance', () => {
      const plugin = createMockWAPPlugin();
      engine.addPlugin('track-1', 'inst-1', plugin, ctx);

      expect(engine.getPlugin('track-1', 'nonexistent')).toBe(undefined);
    });
  });

  // ── noteOn / noteOff ───────────────────────────────────────────────────

  describe('noteOn / noteOff', () => {
    it('calls noteOn on all plugins in chain that support it', () => {
      const noteOn1 = vi.fn();
      const noteOn2 = vi.fn();

      const plugin1 = createMockWAPPlugin({ noteOn: noteOn1 });
      const plugin2 = createMockWAPPlugin({ noteOn: noteOn2 });

      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.addPlugin('track-1', 'inst-2', plugin2, ctx);

      engine.noteOn('track-1', 60, 0.8, 1.5);

      expect(noteOn1).toHaveBeenCalledWith(60, 0.8, 1.5);
      expect(noteOn2).toHaveBeenCalledWith(60, 0.8, 1.5);
    });

    it('calls noteOff on all plugins in chain that support it', () => {
      const noteOff1 = vi.fn();
      const noteOff2 = vi.fn();

      const plugin1 = createMockWAPPlugin({ noteOff: noteOff1 });
      const plugin2 = createMockWAPPlugin({ noteOff: noteOff2 });

      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.addPlugin('track-1', 'inst-2', plugin2, ctx);

      engine.noteOff('track-1', 60, 2.0);

      expect(noteOff1).toHaveBeenCalledWith(60, 2.0);
      expect(noteOff2).toHaveBeenCalledWith(60, 2.0);
    });

    it('skips plugins without noteOn/noteOff', () => {
      const plugin1 = createMockWAPPlugin(); // no noteOn/noteOff
      const noteOn2 = vi.fn();
      const plugin2 = createMockWAPPlugin({ noteOn: noteOn2 });

      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.addPlugin('track-1', 'inst-2', plugin2, ctx);

      // Should not throw, should only call on plugin2
      engine.noteOn('track-1', 60, 0.5);
      expect(noteOn2).toHaveBeenCalledWith(60, 0.5, undefined);
    });

    it('does nothing for nonexistent track', () => {
      // Should not throw
      engine.noteOn('nonexistent', 60, 0.5);
      engine.noteOff('nonexistent', 60);
    });
  });

  // ── getChainLatency ────────────────────────────────────────────────────

  describe('getChainLatency', () => {
    it('returns 0 for nonexistent track', () => {
      expect(engine.getChainLatency('nonexistent')).toBe(0);
    });

    it('returns 0 when plugins have no latencySamples', () => {
      const plugin = createMockWAPPlugin();
      engine.addPlugin('track-1', 'inst-1', plugin, ctx);

      expect(engine.getChainLatency('track-1')).toBe(0);
    });

    it('sums latency from all plugins in chain', () => {
      const plugin1 = createMockWAPPlugin({ latencySamples: 128 });
      const plugin2 = createMockWAPPlugin({ latencySamples: 256 });

      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.addPlugin('track-1', 'inst-2', plugin2, ctx);

      expect(engine.getChainLatency('track-1')).toBe(384);
    });

    it('treats undefined latencySamples as 0', () => {
      const plugin1 = createMockWAPPlugin({ latencySamples: 100 });
      const plugin2 = createMockWAPPlugin(); // undefined latencySamples

      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.addPlugin('track-1', 'inst-2', plugin2, ctx);

      expect(engine.getChainLatency('track-1')).toBe(100);
    });
  });

  // ── rebuildChain ───────────────────────────────────────────────────────

  describe('rebuildChain', () => {
    it('disposes existing chain before rebuilding', () => {
      const oldPlugin = createMockWAPPlugin();
      engine.addPlugin('track-1', 'inst-old', oldPlugin, ctx);

      const newPlugin = createMockWAPPlugin();
      mockedRegistry.getInstance.mockReturnValue(newPlugin);

      const instances: PluginInstance[] = [
        createMockPluginInstance({ id: 'inst-1', enabled: true }),
      ];

      engine.rebuildChain('track-1', instances, ctx);

      // Old plugin should have been disposed
      expect(oldPlugin.dispose).toHaveBeenCalled();
    });

    it('skips disabled instances', () => {
      const plugin = createMockWAPPlugin();
      mockedRegistry.getInstance.mockReturnValue(plugin);

      const instances: PluginInstance[] = [
        createMockPluginInstance({ id: 'inst-1', enabled: false }),
      ];

      engine.rebuildChain('track-1', instances, ctx);

      expect(engine.getInputNode('track-1')).toBe(null);
    });

    it('applies saved parameters to rebuilt plugins', () => {
      const plugin = createMockWAPPlugin();
      mockedRegistry.getInstance.mockReturnValue(plugin);

      const instances: PluginInstance[] = [
        createMockPluginInstance({ id: 'inst-1', enabled: true, params: { mix: 0.3, freq: 1000 } }),
      ];

      engine.rebuildChain('track-1', instances, ctx);

      expect(plugin.setParameter).toHaveBeenCalledWith('mix', 0.3);
      expect(plugin.setParameter).toHaveBeenCalledWith('freq', 1000);
    });

    it('re-creates plugin from registry if instance not found', () => {
      mockedRegistry.getInstance.mockReturnValue(undefined);
      mockedRegistry.isRegistered.mockReturnValue(true);

      const recreatedPlugin = createMockWAPPlugin();
      mockedRegistry.createInstance.mockReturnValue({
        instance: createMockPluginInstance(),
        plugin: recreatedPlugin,
      });

      const instances: PluginInstance[] = [
        createMockPluginInstance({ id: 'inst-1', enabled: true, params: {} }),
      ];

      engine.rebuildChain('track-1', instances, ctx);

      expect(mockedRegistry.createInstance).toHaveBeenCalledWith('test-fx', ctx);
      expect(recreatedPlugin.createAudioNode).toHaveBeenCalledWith(ctx);
    });

    it('skips plugin if not in registry and no live instance', () => {
      mockedRegistry.getInstance.mockReturnValue(undefined);
      mockedRegistry.isRegistered.mockReturnValue(false);

      const instances: PluginInstance[] = [
        createMockPluginInstance({ id: 'inst-1', enabled: true }),
      ];

      engine.rebuildChain('track-1', instances, ctx);

      expect(engine.getInputNode('track-1')).toBe(null);
    });

    it('connects multiple rebuilt plugins in chain order', () => {
      const output1Mock = createMockAudioNode();
      const input2Mock = createMockAudioNode();

      const plugin1 = createMockWAPPlugin({
        createAudioNode: vi.fn(() => ({
          inputNode: createMockAudioNode().node,
          outputNode: output1Mock.node,
        })),
      });
      const plugin2 = createMockWAPPlugin({
        createAudioNode: vi.fn(() => ({
          inputNode: input2Mock.node,
          outputNode: createMockAudioNode().node,
        })),
      });

      mockedRegistry.getInstance
        .mockReturnValueOnce(plugin1)
        .mockReturnValueOnce(plugin2);

      const instances: PluginInstance[] = [
        createMockPluginInstance({ id: 'inst-1', enabled: true, params: {} }),
        createMockPluginInstance({ id: 'inst-2', enabled: true, params: {} }),
      ];

      engine.rebuildChain('track-1', instances, ctx);

      expect(output1Mock.connect).toHaveBeenCalledWith(input2Mock.node);
    });
  });

  // ── disposeChain ───────────────────────────────────────────────────────

  describe('disposeChain', () => {
    it('disposes all plugins in the chain and removes it', () => {
      const plugin1 = createMockWAPPlugin();
      const plugin2 = createMockWAPPlugin();

      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.addPlugin('track-1', 'inst-2', plugin2, ctx);

      engine.disposeChain('track-1');

      expect(plugin1.dispose).toHaveBeenCalledOnce();
      expect(plugin2.dispose).toHaveBeenCalledOnce();
      expect(mockedRegistry.disposeInstance).toHaveBeenCalledWith('inst-1');
      expect(mockedRegistry.disposeInstance).toHaveBeenCalledWith('inst-2');
      expect(engine.getInputNode('track-1')).toBe(null);
    });

    it('does nothing for nonexistent track', () => {
      // Should not throw
      engine.disposeChain('nonexistent');
    });
  });

  // ── dispose ────────────────────────────────────────────────────────────

  describe('dispose', () => {
    it('disposes all chains across all tracks', () => {
      const plugin1 = createMockWAPPlugin();
      const plugin2 = createMockWAPPlugin();

      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.addPlugin('track-2', 'inst-2', plugin2, ctx);

      engine.dispose();

      expect(plugin1.dispose).toHaveBeenCalledOnce();
      expect(plugin2.dispose).toHaveBeenCalledOnce();
      expect(engine.getInputNode('track-1')).toBe(null);
      expect(engine.getInputNode('track-2')).toBe(null);
    });

    it('is safe to call on empty engine', () => {
      // Should not throw
      engine.dispose();
    });
  });
});
