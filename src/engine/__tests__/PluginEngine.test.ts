/**
 * Tests for PluginEngine — plugin chain management on tracks.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { pluginRegistry } from '../PluginRegistry';
import { PluginEngine } from '../PluginEngine';
import type { WAPPlugin, PluginAudioNode, PluginInstance } from '../../types/plugin';

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeAudioNode(): AudioNode {
  return {
    connect: vi.fn(),
    disconnect: vi.fn(),
  } as unknown as AudioNode;
}

function makePluginAudioNode(hasInput = true): PluginAudioNode {
  return {
    inputNode: hasInput ? makeAudioNode() : null,
    outputNode: makeAudioNode(),
  };
}

function createMockPlugin(overrides: Partial<WAPPlugin> = {}): WAPPlugin {
  const audioNode = makePluginAudioNode();
  return {
    name: 'Test Plugin',
    pluginType: 'effect',
    version: '1.0.0',
    author: 'Test',
    description: 'A test plugin',
    createAudioNode: vi.fn(() => audioNode),
    getParameterDescriptors: vi.fn(() => []),
    setParameter: vi.fn(),
    getParameter: vi.fn(),
    getParameters: vi.fn(() => ({})),
    dispose: vi.fn(),
    ...overrides,
  };
}

function createMockAudioContext(): AudioContext {
  return {} as AudioContext;
}

function makePluginInstance(overrides: Partial<PluginInstance> = {}): PluginInstance {
  return {
    id: 'inst-1',
    pluginId: 'test-fx',
    enabled: true,
    params: {},
    manifest: {
      id: 'test-fx',
      name: 'Test',
      pluginType: 'effect',
      version: '1.0.0',
      author: 'Test',
      description: 'Test',
      parameters: [],
    },
    ...overrides,
  };
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('PluginEngine', () => {
  let engine: PluginEngine;
  let ctx: AudioContext;

  beforeEach(() => {
    engine = new PluginEngine();
    ctx = createMockAudioContext();
  });

  // ── addPlugin ──────────────────────────────────────────────────────────

  describe('addPlugin', () => {
    it('adds a plugin and returns its audio node', () => {
      const plugin = createMockPlugin();
      const audioNode = engine.addPlugin('track-1', 'inst-1', plugin, ctx);

      expect(plugin.createAudioNode).toHaveBeenCalledWith(ctx);
      expect(audioNode.inputNode).toBeDefined();
      expect(audioNode.outputNode).toBeDefined();
    });

    it('connects second plugin to first plugin output', () => {
      const outputNode1 = makeAudioNode();
      const inputNode2 = makeAudioNode();

      const plugin1 = createMockPlugin({
        createAudioNode: vi.fn(() => ({
          inputNode: makeAudioNode(),
          outputNode: outputNode1,
        })),
      });
      const plugin2 = createMockPlugin({
        createAudioNode: vi.fn(() => ({
          inputNode: inputNode2,
          outputNode: makeAudioNode(),
        })),
      });

      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.addPlugin('track-1', 'inst-2', plugin2, ctx);

      expect(outputNode1.connect).toHaveBeenCalledWith(inputNode2);
    });

    it('does not crash when second plugin has no input node', () => {
      const plugin1 = createMockPlugin();
      const plugin2 = createMockPlugin({
        createAudioNode: vi.fn(() => ({
          inputNode: null,
          outputNode: makeAudioNode(),
        })),
      });

      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      expect(() => engine.addPlugin('track-1', 'inst-2', plugin2, ctx)).not.toThrow();
    });

    it('manages separate chains per track', () => {
      const plugin1 = createMockPlugin();
      const plugin2 = createMockPlugin();

      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.addPlugin('track-2', 'inst-2', plugin2, ctx);

      expect(engine.getPlugin('track-1', 'inst-1')).toBe(plugin1);
      expect(engine.getPlugin('track-2', 'inst-2')).toBe(plugin2);
      expect(engine.getPlugin('track-1', 'inst-2')).toBeUndefined();
    });
  });

  // ── removePlugin ───────────────────────────────────────────────────────

  describe('removePlugin', () => {
    it('removes a plugin and disposes it', () => {
      const plugin = createMockPlugin();
      engine.addPlugin('track-1', 'inst-1', plugin, ctx);

      engine.removePlugin('track-1', 'inst-1');

      expect(plugin.dispose).toHaveBeenCalled();
      expect(engine.getPlugin('track-1', 'inst-1')).toBeUndefined();
    });

    it('reconnects prev to next when removing middle plugin', () => {
      const outputNode1 = makeAudioNode();
      const inputNode3 = makeAudioNode();

      const plugin1 = createMockPlugin({
        createAudioNode: vi.fn(() => ({
          inputNode: makeAudioNode(),
          outputNode: outputNode1,
        })),
      });
      const plugin2 = createMockPlugin();
      const plugin3 = createMockPlugin({
        createAudioNode: vi.fn(() => ({
          inputNode: inputNode3,
          outputNode: makeAudioNode(),
        })),
      });

      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.addPlugin('track-1', 'inst-2', plugin2, ctx);
      engine.addPlugin('track-1', 'inst-3', plugin3, ctx);

      engine.removePlugin('track-1', 'inst-2');

      expect(outputNode1.disconnect).toHaveBeenCalled();
      expect(outputNode1.connect).toHaveBeenCalledWith(inputNode3);
    });

    it('does nothing for nonexistent track', () => {
      expect(() => engine.removePlugin('nonexistent', 'inst-1')).not.toThrow();
    });

    it('does nothing for nonexistent instance', () => {
      const plugin = createMockPlugin();
      engine.addPlugin('track-1', 'inst-1', plugin, ctx);
      expect(() => engine.removePlugin('track-1', 'nonexistent')).not.toThrow();
      expect(engine.getPlugin('track-1', 'inst-1')).toBe(plugin);
    });

    it('deletes chain map entry when last plugin removed', () => {
      const plugin = createMockPlugin();
      engine.addPlugin('track-1', 'inst-1', plugin, ctx);
      engine.removePlugin('track-1', 'inst-1');
      expect(engine.getInputNode('track-1')).toBeNull();
    });
  });

  // ── rebuildChain ───────────────────────────────────────────────────────

  describe('rebuildChain', () => {
    it('rebuilds chain from plugin instances', () => {
      const mockPlugin = createMockPlugin();

      vi.spyOn(pluginRegistry, 'getInstance').mockReturnValue(mockPlugin);
      vi.spyOn(pluginRegistry, 'disposeInstance').mockImplementation(() => {});

      const instances: PluginInstance[] = [
        makePluginInstance({ id: 'inst-1', pluginId: 'test-fx', enabled: true, params: { mix: 0.7 } }),
      ];

      engine.rebuildChain('track-1', instances, ctx);

      expect(mockPlugin.setParameter).toHaveBeenCalledWith('mix', 0.7);
      expect(engine.getPlugin('track-1', 'inst-1')).toBe(mockPlugin);

      vi.restoreAllMocks();
    });

    it('skips disabled instances', () => {
      vi.spyOn(pluginRegistry, 'getInstance').mockReturnValue(createMockPlugin());
      vi.spyOn(pluginRegistry, 'disposeInstance').mockImplementation(() => {});

      const instances: PluginInstance[] = [
        makePluginInstance({ id: 'inst-1', enabled: false }),
      ];

      engine.rebuildChain('track-1', instances, ctx);

      expect(engine.getInputNode('track-1')).toBeNull();

      vi.restoreAllMocks();
    });

    it('disposes existing chain before rebuilding', () => {
      const plugin = createMockPlugin();
      engine.addPlugin('track-1', 'inst-old', plugin, ctx);

      vi.spyOn(pluginRegistry, 'getInstance').mockReturnValue(undefined);
      vi.spyOn(pluginRegistry, 'isRegistered').mockReturnValue(false);
      vi.spyOn(pluginRegistry, 'disposeInstance').mockImplementation(() => {});

      engine.rebuildChain('track-1', [], ctx);

      expect(plugin.dispose).toHaveBeenCalled();

      vi.restoreAllMocks();
    });
  });

  // ── updateParam ────────────────────────────────────────────────────────

  describe('updateParam', () => {
    it('sets parameter on the correct plugin', () => {
      const plugin = createMockPlugin();
      engine.addPlugin('track-1', 'inst-1', plugin, ctx);

      engine.updateParam('track-1', 'inst-1', 'mix', 0.8);

      expect(plugin.setParameter).toHaveBeenCalledWith('mix', 0.8);
    });

    it('does nothing for nonexistent track', () => {
      expect(() => engine.updateParam('nonexistent', 'inst-1', 'mix', 0.5)).not.toThrow();
    });

    it('does nothing for nonexistent instance', () => {
      const plugin = createMockPlugin();
      engine.addPlugin('track-1', 'inst-1', plugin, ctx);

      engine.updateParam('track-1', 'wrong-inst', 'mix', 0.5);

      expect(plugin.setParameter).not.toHaveBeenCalled();
    });
  });

  // ── getInputNode / getOutputNode ───────────────────────────────────────

  describe('getInputNode / getOutputNode', () => {
    it('returns input of first and output of last plugin', () => {
      const input1 = makeAudioNode();
      const output2 = makeAudioNode();

      const plugin1 = createMockPlugin({
        createAudioNode: vi.fn(() => ({
          inputNode: input1,
          outputNode: makeAudioNode(),
        })),
      });
      const plugin2 = createMockPlugin({
        createAudioNode: vi.fn(() => ({
          inputNode: makeAudioNode(),
          outputNode: output2,
        })),
      });

      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.addPlugin('track-1', 'inst-2', plugin2, ctx);

      expect(engine.getInputNode('track-1')).toBe(input1);
      expect(engine.getOutputNode('track-1')).toBe(output2);
    });

    it('returns null for empty or nonexistent track', () => {
      expect(engine.getInputNode('nonexistent')).toBeNull();
      expect(engine.getOutputNode('nonexistent')).toBeNull();
    });
  });

  // ── getPlugin ──────────────────────────────────────────────────────────

  describe('getPlugin', () => {
    it('returns the plugin by instance ID', () => {
      const plugin = createMockPlugin();
      engine.addPlugin('track-1', 'inst-1', plugin, ctx);
      expect(engine.getPlugin('track-1', 'inst-1')).toBe(plugin);
    });

    it('returns undefined for unknown track', () => {
      expect(engine.getPlugin('unknown', 'inst-1')).toBeUndefined();
    });
  });

  // ── noteOn / noteOff ───────────────────────────────────────────────────

  describe('noteOn / noteOff', () => {
    it('calls noteOn on all instrument plugins in the chain', () => {
      const noteOnFn = vi.fn();
      const plugin = createMockPlugin({ noteOn: noteOnFn });
      engine.addPlugin('track-1', 'inst-1', plugin, ctx);

      engine.noteOn('track-1', 60, 100, 0.5);

      expect(noteOnFn).toHaveBeenCalledWith(60, 100, 0.5);
    });

    it('calls noteOff on all instrument plugins in the chain', () => {
      const noteOffFn = vi.fn();
      const plugin = createMockPlugin({ noteOff: noteOffFn });
      engine.addPlugin('track-1', 'inst-1', plugin, ctx);

      engine.noteOff('track-1', 60, 1.0);

      expect(noteOffFn).toHaveBeenCalledWith(60, 1.0);
    });

    it('skips plugins without noteOn/noteOff', () => {
      const plugin = createMockPlugin();
      delete (plugin as Record<string, unknown>).noteOn;
      delete (plugin as Record<string, unknown>).noteOff;
      engine.addPlugin('track-1', 'inst-1', plugin, ctx);

      expect(() => engine.noteOn('track-1', 60, 100)).not.toThrow();
      expect(() => engine.noteOff('track-1', 60)).not.toThrow();
    });

    it('does nothing for nonexistent track', () => {
      expect(() => engine.noteOn('nonexistent', 60, 100)).not.toThrow();
      expect(() => engine.noteOff('nonexistent', 60)).not.toThrow();
    });
  });

  // ── getChainLatency ────────────────────────────────────────────────────

  describe('getChainLatency', () => {
    it('sums latency across all plugins in chain', () => {
      const plugin1 = createMockPlugin();
      (plugin1 as Record<string, unknown>).latencySamples = 128;
      const plugin2 = createMockPlugin();
      (plugin2 as Record<string, unknown>).latencySamples = 256;

      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.addPlugin('track-1', 'inst-2', plugin2, ctx);

      expect(engine.getChainLatency('track-1')).toBe(384);
    });

    it('treats missing latencySamples as 0', () => {
      const plugin = createMockPlugin();
      engine.addPlugin('track-1', 'inst-1', plugin, ctx);

      expect(engine.getChainLatency('track-1')).toBe(0);
    });

    it('returns 0 for nonexistent track', () => {
      expect(engine.getChainLatency('nonexistent')).toBe(0);
    });
  });

  // ── setPluginBypassed ──────────────────────────────────────────────────

  describe('setPluginBypassed', () => {
    it('bypasses a plugin and getInputNode/getOutputNode skip it', () => {
      const input1 = makeAudioNode();
      const output1 = makeAudioNode();
      const input2 = makeAudioNode();
      const output2 = makeAudioNode();

      const plugin1 = createMockPlugin({
        createAudioNode: vi.fn(() => ({ inputNode: input1, outputNode: output1 })),
      });
      const plugin2 = createMockPlugin({
        createAudioNode: vi.fn(() => ({ inputNode: input2, outputNode: output2 })),
      });

      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.addPlugin('track-1', 'inst-2', plugin2, ctx);

      // Before bypass: first input, last output
      expect(engine.getInputNode('track-1')).toBe(input1);
      expect(engine.getOutputNode('track-1')).toBe(output2);

      // Bypass first plugin
      engine.setPluginBypassed('track-1', 'inst-1', true);
      expect(engine.getInputNode('track-1')).toBe(input2);
      expect(engine.getOutputNode('track-1')).toBe(output2);
    });

    it('un-bypasses a plugin and restores it in the chain', () => {
      const input1 = makeAudioNode();
      const output1 = makeAudioNode();

      const plugin1 = createMockPlugin({
        createAudioNode: vi.fn(() => ({ inputNode: input1, outputNode: output1 })),
      });

      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.setPluginBypassed('track-1', 'inst-1', true);
      expect(engine.getInputNode('track-1')).toBeNull();

      engine.setPluginBypassed('track-1', 'inst-1', false);
      expect(engine.getInputNode('track-1')).toBe(input1);
    });

    it('returns null for all nodes when all plugins are bypassed', () => {
      const plugin = createMockPlugin();
      engine.addPlugin('track-1', 'inst-1', plugin, ctx);
      engine.setPluginBypassed('track-1', 'inst-1', true);

      expect(engine.getInputNode('track-1')).toBeNull();
      expect(engine.getOutputNode('track-1')).toBeNull();
    });

    it('does nothing for nonexistent track or instance', () => {
      expect(() => engine.setPluginBypassed('nonexistent', 'inst-1', true)).not.toThrow();
      const plugin = createMockPlugin();
      engine.addPlugin('track-1', 'inst-1', plugin, ctx);
      expect(() => engine.setPluginBypassed('track-1', 'nonexistent', true)).not.toThrow();
    });

    it('wires new plugin to last non-bypassed plugin when last plugin is bypassed', () => {
      const output1 = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
      const output2 = { connect: vi.fn(), disconnect: vi.fn() } as unknown as AudioNode;
      const input3 = makeAudioNode();

      const plugin1 = createMockPlugin({
        createAudioNode: vi.fn(() => ({ inputNode: makeAudioNode(), outputNode: output1 })),
      });
      const plugin2 = createMockPlugin({
        createAudioNode: vi.fn(() => ({ inputNode: makeAudioNode(), outputNode: output2 })),
      });
      const plugin3 = createMockPlugin({
        createAudioNode: vi.fn(() => ({ inputNode: input3, outputNode: makeAudioNode() })),
      });

      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.addPlugin('track-1', 'inst-2', plugin2, ctx);
      engine.setPluginBypassed('track-1', 'inst-2', true);

      (output1.connect as ReturnType<typeof vi.fn>).mockClear();
      (output2.connect as ReturnType<typeof vi.fn>).mockClear();

      engine.addPlugin('track-1', 'inst-3', plugin3, ctx);
      // Should connect to plugin1 (non-bypassed), not plugin2 (bypassed)
      expect(output1.connect).toHaveBeenCalledWith(input3);
      expect(output2.connect).not.toHaveBeenCalledWith(input3);
    });
  });

  // ── disposeChain / dispose ─────────────────────────────────────────────

  describe('disposeChain', () => {
    it('disposes all plugins in a track chain', () => {
      const plugin1 = createMockPlugin();
      const plugin2 = createMockPlugin();
      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.addPlugin('track-1', 'inst-2', plugin2, ctx);

      engine.disposeChain('track-1');

      expect(plugin1.dispose).toHaveBeenCalled();
      expect(plugin2.dispose).toHaveBeenCalled();
      expect(engine.getInputNode('track-1')).toBeNull();
    });

    it('does nothing for nonexistent track', () => {
      expect(() => engine.disposeChain('nonexistent')).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('disposes all chains across all tracks', () => {
      const plugin1 = createMockPlugin();
      const plugin2 = createMockPlugin();
      engine.addPlugin('track-1', 'inst-1', plugin1, ctx);
      engine.addPlugin('track-2', 'inst-2', plugin2, ctx);

      engine.dispose();

      expect(plugin1.dispose).toHaveBeenCalled();
      expect(plugin2.dispose).toHaveBeenCalled();
      expect(engine.getInputNode('track-1')).toBeNull();
      expect(engine.getInputNode('track-2')).toBeNull();
    });
  });
});
