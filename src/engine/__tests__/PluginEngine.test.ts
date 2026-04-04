import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pluginRegistry
const mockDisposeInstance = vi.fn();
const mockGetInstance = vi.fn();
const mockIsRegistered = vi.fn();
const mockCreateInstance = vi.fn();

vi.mock('../PluginRegistry', () => ({
  pluginRegistry: {
    disposeInstance: (...args: unknown[]) => mockDisposeInstance(...args),
    getInstance: (...args: unknown[]) => mockGetInstance(...args),
    isRegistered: (...args: unknown[]) => mockIsRegistered(...args),
    createInstance: (...args: unknown[]) => mockCreateInstance(...args),
  },
}));

import { PluginEngine } from '../PluginEngine';

function makePlugin(overrides: Record<string, unknown> = {}) {
  const inputNode = { connect: vi.fn() };
  const outputNode = { connect: vi.fn(), disconnect: vi.fn() };
  return {
    createAudioNode: vi.fn(() => ({ inputNode, outputNode })),
    setParameter: vi.fn(),
    dispose: vi.fn(),
    noteOn: vi.fn(),
    noteOff: vi.fn(),
    latencySamples: 0,
    ...overrides,
  };
}

function makeCtx() {
  return {} as unknown as AudioContext;
}

describe('PluginEngine', () => {
  let engine: PluginEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    engine = new PluginEngine();
  });

  // ── addPlugin ──

  it('adds a plugin and returns its audio node', () => {
    const plugin = makePlugin();
    const ctx = makeCtx();

    const audioNode = engine.addPlugin('track-1', 'inst-1', plugin as never, ctx);

    expect(plugin.createAudioNode).toHaveBeenCalledWith(ctx);
    expect(audioNode.inputNode).toBeDefined();
    expect(audioNode.outputNode).toBeDefined();
  });

  it('connects second plugin to first in chain', () => {
    const plugin1 = makePlugin();
    const plugin2 = makePlugin();
    const ctx = makeCtx();

    const firstNode = engine.addPlugin('track-1', 'inst-1', plugin1 as never, ctx);
    const secondNode = engine.addPlugin('track-1', 'inst-2', plugin2 as never, ctx);

    // The first plugin's output should be connected to second's input
    expect(firstNode.outputNode.connect).toHaveBeenCalledWith(secondNode.inputNode);
  });

  // ── removePlugin ──

  it('removes a plugin and disposes it', () => {
    const plugin = makePlugin();
    engine.addPlugin('track-1', 'inst-1', plugin as never, makeCtx());

    engine.removePlugin('track-1', 'inst-1');

    expect(plugin.dispose).toHaveBeenCalledTimes(1);
    expect(mockDisposeInstance).toHaveBeenCalledWith('inst-1');
  });

  it('does nothing when removing from nonexistent track', () => {
    engine.removePlugin('nonexistent', 'inst-1');
    expect(mockDisposeInstance).not.toHaveBeenCalled();
  });

  it('does nothing when removing nonexistent instance', () => {
    const plugin = makePlugin();
    engine.addPlugin('track-1', 'inst-1', plugin as never, makeCtx());

    engine.removePlugin('track-1', 'inst-99');
    expect(plugin.dispose).not.toHaveBeenCalled();
  });

  // ── updateParam ──

  it('updates a plugin parameter', () => {
    const plugin = makePlugin();
    engine.addPlugin('track-1', 'inst-1', plugin as never, makeCtx());

    engine.updateParam('track-1', 'inst-1', 'frequency', 440);

    expect(plugin.setParameter).toHaveBeenCalledWith('frequency', 440);
  });

  it('does nothing when updating param on nonexistent track', () => {
    engine.updateParam('nonexistent', 'inst-1', 'frequency', 440);
    // No error thrown
  });

  // ── getInputNode / getOutputNode ──

  it('returns input node of first plugin', () => {
    const plugin = makePlugin();
    engine.addPlugin('track-1', 'inst-1', plugin as never, makeCtx());

    const inputNode = engine.getInputNode('track-1');
    expect(inputNode).not.toBeNull();
  });

  it('returns output node of last plugin', () => {
    const plugin1 = makePlugin();
    const plugin2 = makePlugin();
    engine.addPlugin('track-1', 'inst-1', plugin1 as never, makeCtx());
    engine.addPlugin('track-1', 'inst-2', plugin2 as never, makeCtx());

    const outputNode = engine.getOutputNode('track-1');
    expect(outputNode).not.toBeNull();
  });

  it('returns null for empty track', () => {
    expect(engine.getInputNode('empty')).toBeNull();
    expect(engine.getOutputNode('empty')).toBeNull();
  });

  // ── getPlugin ──

  it('returns plugin instance by id', () => {
    const plugin = makePlugin();
    engine.addPlugin('track-1', 'inst-1', plugin as never, makeCtx());

    const found = engine.getPlugin('track-1', 'inst-1');
    expect(found).toBe(plugin);
  });

  it('returns undefined for nonexistent plugin', () => {
    expect(engine.getPlugin('track-1', 'nope')).toBeUndefined();
  });

  // ── noteOn / noteOff ──

  it('sends noteOn to all plugins in chain', () => {
    const plugin1 = makePlugin();
    const plugin2 = makePlugin();
    engine.addPlugin('track-1', 'inst-1', plugin1 as never, makeCtx());
    engine.addPlugin('track-1', 'inst-2', plugin2 as never, makeCtx());

    engine.noteOn('track-1', 60, 100, 0.5);

    expect(plugin1.noteOn).toHaveBeenCalledWith(60, 100, 0.5);
    expect(plugin2.noteOn).toHaveBeenCalledWith(60, 100, 0.5);
  });

  it('sends noteOff to all plugins in chain', () => {
    const plugin1 = makePlugin();
    const plugin2 = makePlugin();
    engine.addPlugin('track-1', 'inst-1', plugin1 as never, makeCtx());
    engine.addPlugin('track-1', 'inst-2', plugin2 as never, makeCtx());

    engine.noteOff('track-1', 60, 1.0);

    expect(plugin1.noteOff).toHaveBeenCalledWith(60, 1.0);
    expect(plugin2.noteOff).toHaveBeenCalledWith(60, 1.0);
  });

  it('does nothing when sending notes to empty track', () => {
    engine.noteOn('empty', 60, 100);
    engine.noteOff('empty', 60);
    // No error thrown
  });

  // ── getChainLatency ──

  it('sums latency across plugins in chain', () => {
    const plugin1 = makePlugin({ latencySamples: 128 });
    const plugin2 = makePlugin({ latencySamples: 256 });
    engine.addPlugin('track-1', 'inst-1', plugin1 as never, makeCtx());
    engine.addPlugin('track-1', 'inst-2', plugin2 as never, makeCtx());

    expect(engine.getChainLatency('track-1')).toBe(384);
  });

  it('returns 0 for empty track', () => {
    expect(engine.getChainLatency('empty')).toBe(0);
  });

  // ── disposeChain ──

  it('disposes all plugins in a track chain', () => {
    const plugin1 = makePlugin();
    const plugin2 = makePlugin();
    engine.addPlugin('track-1', 'inst-1', plugin1 as never, makeCtx());
    engine.addPlugin('track-1', 'inst-2', plugin2 as never, makeCtx());

    engine.disposeChain('track-1');

    expect(plugin1.dispose).toHaveBeenCalledTimes(1);
    expect(plugin2.dispose).toHaveBeenCalledTimes(1);
    expect(mockDisposeInstance).toHaveBeenCalledTimes(2);
    expect(engine.getInputNode('track-1')).toBeNull();
  });

  // ── dispose ──

  it('disposes all chains on all tracks', () => {
    const p1 = makePlugin();
    const p2 = makePlugin();
    engine.addPlugin('track-1', 'inst-1', p1 as never, makeCtx());
    engine.addPlugin('track-2', 'inst-2', p2 as never, makeCtx());

    engine.dispose();

    expect(p1.dispose).toHaveBeenCalled();
    expect(p2.dispose).toHaveBeenCalled();
    expect(engine.getInputNode('track-1')).toBeNull();
    expect(engine.getInputNode('track-2')).toBeNull();
  });
});
