import { describe, it, expect, beforeEach } from 'vitest';
import { PluginEngine } from '../../../engine/PluginEngine';
import type { WAPPlugin, PluginAudioNode } from '../../../types/plugin';

/** Create a minimal mock WAPPlugin with optional latencySamples. */
function createMockPlugin(latencySamples?: number): WAPPlugin {
  const gain = { connect: () => {}, disconnect: () => {} } as unknown as AudioNode;
  return {
    name: 'test-plugin',
    pluginType: 'effect',
    version: '1.0.0',
    author: 'test',
    description: 'test',
    latencySamples,
    createAudioNode: () => ({
      inputNode: gain,
      outputNode: gain,
    }),
    getParameterDescriptors: () => [],
    setParameter: () => {},
    getParameter: () => undefined,
    getParameters: () => ({}),
    dispose: () => {},
  } as WAPPlugin;
}

describe('PluginEngine.getChainLatency', () => {
  let engine: PluginEngine;
  const ctx = {
    createGain: () => ({ connect: () => {}, disconnect: () => {}, gain: { value: 1 } }),
  } as unknown as AudioContext;

  beforeEach(() => {
    engine = new PluginEngine();
  });

  it('returns 0 for a track with no plugins', () => {
    expect(engine.getChainLatency('no-such-track')).toBe(0);
  });

  it('returns 0 for WAP plugins (no latencySamples)', () => {
    const plugin = createMockPlugin();
    engine.addPlugin('track-1', 'inst-1', plugin, ctx);
    expect(engine.getChainLatency('track-1')).toBe(0);
  });

  it('returns latencySamples for a VST3 plugin', () => {
    const plugin = createMockPlugin(256);
    engine.addPlugin('track-1', 'inst-1', plugin, ctx);
    expect(engine.getChainLatency('track-1')).toBe(256);
  });

  it('sums latencies across multiple plugins in a chain', () => {
    const p1 = createMockPlugin(128);
    const p2 = createMockPlugin(256);
    const p3 = createMockPlugin(); // WAP, 0 latency
    engine.addPlugin('track-1', 'inst-1', p1, ctx);
    engine.addPlugin('track-1', 'inst-2', p2, ctx);
    engine.addPlugin('track-1', 'inst-3', p3, ctx);
    expect(engine.getChainLatency('track-1')).toBe(384);
  });

  it('excludes bypassed plugins from chain latency', () => {
    const p1 = createMockPlugin(128);
    const p2 = createMockPlugin(256);
    engine.addPlugin('track-1', 'inst-1', p1, ctx);
    engine.addPlugin('track-1', 'inst-2', p2, ctx);

    engine.setPluginBypassed('track-1', 'inst-2', true);

    expect(engine.getChainLatency('track-1')).toBe(128);
  });

  it('updates a live plugin latency report', () => {
    const plugin = createMockPlugin(128);
    engine.addPlugin('track-1', 'inst-1', plugin, ctx);

    engine.setPluginLatency('track-1', 'inst-1', 512);

    expect(engine.getChainLatency('track-1')).toBe(512);
  });

  it('normalizes invalid and fractional latency samples', () => {
    const p1 = createMockPlugin(128.8);
    const p2 = createMockPlugin(Number.NaN);
    engine.addPlugin('track-1', 'inst-1', p1, ctx);
    engine.addPlugin('track-1', 'inst-2', p2, ctx);

    expect(engine.getChainLatency('track-1')).toBe(128);
  });
});
