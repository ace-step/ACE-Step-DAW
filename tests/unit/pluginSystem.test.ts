import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
import type {
  WAPPlugin,
  PluginAudioNode,
  PluginParamDescriptor,
  PluginParamValue,
  PluginParamValues,
  PluginFactory,
  PluginInstance,
} from '../../src/types/plugin';
import { PluginRegistry } from '../../src/engine/PluginRegistry';
import { PluginEngine } from '../../src/engine/PluginEngine';

// ─── Minimal AudioContext mock for Node/jsdom ────────────────────────────────

class MockAudioParam {
  value = 0;
  setValueAtTime(v: number) { this.value = v; return this; }
  linearRampToValueAtTime(v: number) { this.value = v; return this; }
  cancelScheduledValues() { return this; }
}

class MockGainNode {
  gain = new MockAudioParam();
  connect() { return this; }
  disconnect() {}
}

class MockAudioContext {
  createGain() { return new MockGainNode(); }
  createOscillator() {
    return {
      type: 'sine',
      frequency: new MockAudioParam(),
      connect() { return this; },
      disconnect() {},
      start() {},
      stop() {},
    };
  }
  get currentTime() { return 0; }
  close() {}
}

// ─── Mock Plugins ────────────────────────────────────────────────────────────

class MockEffectPlugin implements WAPPlugin {
  readonly name = 'Mock Effect';
  readonly pluginType = 'effect' as const;
  readonly version = '1.0.0';
  readonly author = 'Test';
  readonly description = 'Test effect plugin';

  private params: PluginParamValues = { gain: 0.5, mix: 1.0 };
  private _disposed = false;

  getParameterDescriptors(): PluginParamDescriptor[] {
    return [
      { id: 'gain', name: 'Gain', type: 'float', min: 0, max: 1, defaultValue: 0.5 },
      { id: 'mix', name: 'Mix', type: 'float', min: 0, max: 1, defaultValue: 1.0 },
    ];
  }

  createAudioNode(ctx: AudioContext): PluginAudioNode {
    const input = ctx.createGain();
    const output = ctx.createGain();
    return { inputNode: input as unknown as AudioNode, outputNode: output as unknown as AudioNode };
  }

  setParameter(paramId: string, value: PluginParamValue): void {
    this.params[paramId] = value;
  }

  getParameter(paramId: string): PluginParamValue | undefined {
    return this.params[paramId];
  }

  getParameters(): PluginParamValues {
    return { ...this.params };
  }

  dispose(): void {
    this._disposed = true;
  }

  get disposed() { return this._disposed; }
}

class MockInstrumentPlugin implements WAPPlugin {
  readonly name = 'Mock Instrument';
  readonly pluginType = 'instrument' as const;
  readonly version = '1.0.0';
  readonly author = 'Test';
  readonly description = 'Test instrument plugin';

  private params: PluginParamValues = { attack: 0.01, release: 0.3 };
  noteOnCalls: { note: number; velocity: number }[] = [];
  noteOffCalls: number[] = [];

  getParameterDescriptors(): PluginParamDescriptor[] {
    return [
      { id: 'attack', name: 'Attack', type: 'float', min: 0.001, max: 2, defaultValue: 0.01 },
      { id: 'release', name: 'Release', type: 'float', min: 0.001, max: 5, defaultValue: 0.3 },
    ];
  }

  createAudioNode(ctx: AudioContext): PluginAudioNode {
    const output = ctx.createGain();
    return { inputNode: null, outputNode: output as unknown as AudioNode };
  }

  noteOn(note: number, velocity: number): void {
    this.noteOnCalls.push({ note, velocity });
  }

  noteOff(note: number): void {
    this.noteOffCalls.push(note);
  }

  setParameter(paramId: string, value: PluginParamValue): void {
    this.params[paramId] = value;
  }

  getParameter(paramId: string): PluginParamValue | undefined {
    return this.params[paramId];
  }

  getParameters(): PluginParamValues {
    return { ...this.params };
  }

  dispose(): void {}
}

const createMockEffect: PluginFactory = () => new MockEffectPlugin();
const createMockInstrument: PluginFactory = () => new MockInstrumentPlugin();
const mockCtx = new MockAudioContext() as unknown as AudioContext;

// ─── Plugin Types Tests ──────────────────────────────────────────────────────

describe('Plugin type interfaces', () => {
  it('has correct pluginType for effect plugins', () => {
    const plugin = createMockEffect();
    expect(plugin.pluginType).toBe('effect');
    expect(plugin.name).toBe('Mock Effect');
    expect(plugin.version).toBe('1.0.0');
    plugin.dispose();
  });

  it('has correct pluginType for instrument plugins', () => {
    const plugin = createMockInstrument();
    expect(plugin.pluginType).toBe('instrument');
    plugin.dispose();
  });

  it('returns parameter descriptors', () => {
    const plugin = createMockEffect();
    const descs = plugin.getParameterDescriptors();
    expect(descs).toHaveLength(2);
    expect(descs[0].id).toBe('gain');
    expect(descs[0].type).toBe('float');
    expect((descs[0] as { defaultValue: number }).defaultValue).toBe(0.5);
    plugin.dispose();
  });

  it('sets and gets parameters', () => {
    const plugin = createMockEffect();
    plugin.setParameter('gain', 0.8);
    expect(plugin.getParameter('gain')).toBe(0.8);
    expect(plugin.getParameter('unknown')).toBeUndefined();
    plugin.dispose();
  });

  it('gets all parameters', () => {
    const plugin = createMockEffect();
    const params = plugin.getParameters();
    expect(params).toEqual({ gain: 0.5, mix: 1.0 });
    plugin.dispose();
  });

  it('instrument plugins support noteOn/noteOff', () => {
    const plugin = createMockInstrument() as MockInstrumentPlugin;
    expect(typeof plugin.noteOn).toBe('function');
    expect(typeof plugin.noteOff).toBe('function');
    plugin.noteOn(60, 0.8);
    plugin.noteOff(60);
    expect(plugin.noteOnCalls).toEqual([{ note: 60, velocity: 0.8 }]);
    expect(plugin.noteOffCalls).toEqual([60]);
    plugin.dispose();
  });
});

// ─── Plugin Registry Tests ───────────────────────────────────────────────────

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  it('registers a plugin and returns manifest', () => {
    const manifest = registry.registerPlugin('test-effect', createMockEffect);
    expect(manifest.id).toBe('test-effect');
    expect(manifest.name).toBe('Mock Effect');
    expect(manifest.pluginType).toBe('effect');
    expect(manifest.parameters).toHaveLength(2);
  });

  it('checks if plugin is registered', () => {
    expect(registry.isRegistered('test-effect')).toBe(false);
    registry.registerPlugin('test-effect', createMockEffect);
    expect(registry.isRegistered('test-effect')).toBe(true);
  });

  it('lists available plugins', () => {
    registry.registerPlugin('test-effect', createMockEffect);
    registry.registerPlugin('test-instrument', createMockInstrument);
    const plugins = registry.getAvailablePlugins();
    expect(plugins).toHaveLength(2);
    expect(plugins.map((p) => p.id)).toContain('test-effect');
    expect(plugins.map((p) => p.id)).toContain('test-instrument');
  });

  it('gets manifest by ID', () => {
    registry.registerPlugin('test-effect', createMockEffect);
    const manifest = registry.getManifest('test-effect');
    expect(manifest).not.toBeUndefined();
    expect(manifest?.name).toBe('Mock Effect');
    expect(registry.getManifest('nonexistent')).toBeUndefined();
  });

  it('creates plugin instances with default params', () => {
    registry.registerPlugin('test-effect', createMockEffect);
    const { instance, plugin } = registry.createInstance('test-effect', mockCtx);

    expect(instance.pluginId).toBe('test-effect');
    expect(instance.enabled).toBe(true);
    expect(instance.params.gain).toBe(0.5);
    expect(instance.params.mix).toBe(1.0);
    expect(plugin).not.toBeUndefined();
  });

  it('throws when creating instance of unregistered plugin', () => {
    expect(() => registry.createInstance('nonexistent', mockCtx)).toThrow('not registered');
  });

  it('disposes instances', () => {
    registry.registerPlugin('test-effect', createMockEffect);
    const { instance } = registry.createInstance('test-effect', mockCtx);

    expect(registry.getInstance(instance.id)).not.toBeUndefined();
    registry.disposeInstance(instance.id);
    expect(registry.getInstance(instance.id)).toBeUndefined();
  });

  it('dispose clears everything', () => {
    registry.registerPlugin('test-effect', createMockEffect);
    registry.dispose();
    expect(registry.isRegistered('test-effect')).toBe(false);
    expect(registry.getAvailablePlugins()).toHaveLength(0);
  });
});

// ─── Plugin Engine Tests ─────────────────────────────────────────────────────

describe('PluginEngine', () => {
  let engine: PluginEngine;

  beforeEach(() => {
    engine = new PluginEngine();
  });

  it('adds a plugin and returns audio nodes', () => {
    const plugin = createMockEffect();
    const audioNode = engine.addPlugin('track-1', 'inst-1', plugin, mockCtx);

    expect(audioNode.inputNode).not.toBeNull();
    expect(audioNode.outputNode).not.toBeNull();
    expect(engine.getInputNode('track-1')).toBe(audioNode.inputNode);
    expect(engine.getOutputNode('track-1')).toBe(audioNode.outputNode);
  });

  it('chains multiple plugins', () => {
    const plugin1 = createMockEffect();
    const plugin2 = createMockEffect();

    engine.addPlugin('track-1', 'inst-1', plugin1, mockCtx);
    const audioNode2 = engine.addPlugin('track-1', 'inst-2', plugin2, mockCtx);

    const firstInput = engine.getInputNode('track-1');
    const lastOutput = engine.getOutputNode('track-1');
    expect(firstInput).not.toBe(audioNode2.inputNode);
    expect(lastOutput).toBe(audioNode2.outputNode);
  });

  it('updates plugin parameters', () => {
    const plugin = createMockEffect();
    engine.addPlugin('track-1', 'inst-1', plugin, mockCtx);

    engine.updateParam('track-1', 'inst-1', 'gain', 0.9);
    expect(plugin.getParameter('gain')).toBe(0.9);
  });

  it('returns null for empty chain', () => {
    expect(engine.getInputNode('track-1')).toBeNull();
    expect(engine.getOutputNode('track-1')).toBeNull();
  });

  it('gets plugin by instance ID', () => {
    const plugin = createMockEffect();
    engine.addPlugin('track-1', 'inst-1', plugin, mockCtx);

    expect(engine.getPlugin('track-1', 'inst-1')).toBe(plugin);
    expect(engine.getPlugin('track-1', 'nonexistent')).toBeUndefined();
    expect(engine.getPlugin('track-2', 'inst-1')).toBeUndefined();
  });

  it('triggers noteOn/noteOff on instrument plugins', () => {
    const plugin = createMockInstrument() as MockInstrumentPlugin;
    engine.addPlugin('track-1', 'inst-1', plugin, mockCtx);

    engine.noteOn('track-1', 60, 0.8);
    engine.noteOff('track-1', 60);

    expect(plugin.noteOnCalls).toEqual([{ note: 60, velocity: 0.8 }]);
    expect(plugin.noteOffCalls).toEqual([60]);
  });

  it('disposes chain', () => {
    const plugin = createMockEffect() as MockEffectPlugin;
    engine.addPlugin('track-1', 'inst-1', plugin, mockCtx);

    engine.disposeChain('track-1');
    expect(engine.getInputNode('track-1')).toBeNull();
    expect(plugin.disposed).toBe(true);
  });

  it('dispose clears all chains', () => {
    engine.addPlugin('track-1', 'inst-1', createMockEffect(), mockCtx);
    engine.addPlugin('track-2', 'inst-2', createMockEffect(), mockCtx);

    engine.dispose();
    expect(engine.getInputNode('track-1')).toBeNull();
    expect(engine.getInputNode('track-2')).toBeNull();
  });
});

// ─── Example Plugins Tests ──────────────────────────────────────────────────

describe('BitCrusher plugin', () => {
  it('implements the WAPPlugin interface correctly', async () => {
    const { createBitCrusherPlugin } = await import('../../src/plugins/bitCrusherPlugin');
    const plugin = createBitCrusherPlugin();

    expect(plugin.name).toBe('Bit Crusher');
    expect(plugin.pluginType).toBe('effect');
    expect(plugin.version).toBe('1.0.0');

    const descs = plugin.getParameterDescriptors();
    expect(descs.length).toBeGreaterThanOrEqual(3);
    expect(descs.map((d) => d.id)).toContain('bitDepth');
    expect(descs.map((d) => d.id)).toContain('sampleRateReduction');
    expect(descs.map((d) => d.id)).toContain('wet');

    plugin.setParameter('bitDepth', 4);
    expect(plugin.getParameter('bitDepth')).toBe(4);

    const allParams = plugin.getParameters();
    expect(allParams.bitDepth).toBe(4);

    plugin.dispose();
  });

  it('creates audio nodes with input and output', async () => {
    const { createBitCrusherPlugin } = await import('../../src/plugins/bitCrusherPlugin');
    const plugin = createBitCrusherPlugin();

    const audioNode = plugin.createAudioNode(mockCtx);
    expect(audioNode.inputNode).not.toBeNull();
    expect(audioNode.outputNode).not.toBeNull();

    plugin.dispose();
  });
});

describe('FM Synth plugin', () => {
  it('implements the WAPPlugin interface correctly', async () => {
    const { createFMSynthPlugin } = await import('../../src/plugins/fmSynthPlugin');
    const plugin = createFMSynthPlugin();

    expect(plugin.name).toBe('FM Synth');
    expect(plugin.pluginType).toBe('instrument');
    expect(plugin.version).toBe('1.0.0');

    const descs = plugin.getParameterDescriptors();
    expect(descs.length).toBeGreaterThanOrEqual(6);
    expect(descs.map((d) => d.id)).toContain('modulationIndex');
    expect(descs.map((d) => d.id)).toContain('harmonicRatio');
    expect(descs.map((d) => d.id)).toContain('attack');

    plugin.setParameter('modulationIndex', 5);
    expect(plugin.getParameter('modulationIndex')).toBe(5);

    plugin.dispose();
  });

  it('creates audio nodes with output only (no input for instruments)', async () => {
    const { createFMSynthPlugin } = await import('../../src/plugins/fmSynthPlugin');
    const plugin = createFMSynthPlugin();

    const audioNode = plugin.createAudioNode(mockCtx);
    expect(audioNode.inputNode).toBeNull();
    expect(audioNode.outputNode).not.toBeNull();

    plugin.dispose();
  });

  it('handles noteOn and noteOff without throwing', async () => {
    const { createFMSynthPlugin } = await import('../../src/plugins/fmSynthPlugin');
    const plugin = createFMSynthPlugin();
    plugin.createAudioNode(mockCtx);

    expect(typeof plugin.noteOn).toBe('function');
    expect(typeof plugin.noteOff).toBe('function');
    // Should not throw — uses mock ctx
    plugin.noteOn!(60, 0.8);
    plugin.noteOff!(60);

    plugin.dispose();
  });
});

// ─── Plugin Store Integration Tests ──────────────────────────────────────────

describe('Plugin store actions', () => {
  // Pre-import projectStore to warm the module cache (Tone.js init takes ~5s)
  beforeAll(async () => {
    await import('../../src/store/projectStore');
  }, 15_000);

  it('adds and removes plugins on tracks', async () => {
    const { useProjectStore } = await import('../../src/store/projectStore');

    useProjectStore.getState().createProject({ name: 'test-plugin-project' });
    useProjectStore.getState().addTrack('pianoRoll');

    const tracks = useProjectStore.getState().project?.tracks ?? [];
    expect(tracks.length).toBeGreaterThan(0);
    const trackId = tracks[0].id;

    const pluginInstance: PluginInstance = {
      id: 'test-inst-1',
      pluginId: 'test-effect',
      enabled: true,
      params: { gain: 0.5 },
      manifest: {
        id: 'test-effect',
        name: 'Test Effect',
        pluginType: 'effect',
        version: '1.0.0',
        author: 'Test',
        description: 'Test',
        parameters: [],
      },
    };

    useProjectStore.getState().addPlugin(trackId, pluginInstance);
    const track = useProjectStore.getState().project?.tracks.find((t) => t.id === trackId);
    expect(track?.plugins).toHaveLength(1);
    expect(track?.plugins?.[0].id).toBe('test-inst-1');

    useProjectStore.getState().removePlugin(trackId, 'test-inst-1');
    const trackAfter = useProjectStore.getState().project?.tracks.find((t) => t.id === trackId);
    expect(trackAfter?.plugins ?? []).toHaveLength(0);
  });

  it('updates plugin parameters in store', async () => {
    const { useProjectStore } = await import('../../src/store/projectStore');

    useProjectStore.getState().createProject({ name: 'test-plugin-param' });
    useProjectStore.getState().addTrack('pianoRoll');

    const trackId = useProjectStore.getState().project!.tracks[0].id;
    const pluginInstance: PluginInstance = {
      id: 'param-test-1',
      pluginId: 'test-effect',
      enabled: true,
      params: { gain: 0.5, mix: 1.0 },
      manifest: {
        id: 'test-effect',
        name: 'Test',
        pluginType: 'effect',
        version: '1.0.0',
        author: 'Test',
        description: 'Test',
        parameters: [],
      },
    };

    useProjectStore.getState().addPlugin(trackId, pluginInstance);
    useProjectStore.getState().updatePluginParam(trackId, 'param-test-1', 'gain', 0.9);

    const track = useProjectStore.getState().project?.tracks.find((t) => t.id === trackId);
    expect(track?.plugins?.[0].params.gain).toBe(0.9);
    expect(track?.plugins?.[0].params.mix).toBe(1.0);
  });

  it('toggles plugin enabled state', async () => {
    const { useProjectStore } = await import('../../src/store/projectStore');

    useProjectStore.getState().createProject({ name: 'test-plugin-toggle' });
    useProjectStore.getState().addTrack('pianoRoll');

    const trackId = useProjectStore.getState().project!.tracks[0].id;
    const pluginInstance: PluginInstance = {
      id: 'toggle-test-1',
      pluginId: 'test-effect',
      enabled: true,
      params: {},
      manifest: {
        id: 'test-effect',
        name: 'Test',
        pluginType: 'effect',
        version: '1.0.0',
        author: 'Test',
        description: 'Test',
        parameters: [],
      },
    };

    useProjectStore.getState().addPlugin(trackId, pluginInstance);
    useProjectStore.getState().togglePlugin(trackId, 'toggle-test-1');

    const track = useProjectStore.getState().project?.tracks.find((t) => t.id === trackId);
    expect(track?.plugins?.[0].enabled).toBe(false);

    useProjectStore.getState().togglePlugin(trackId, 'toggle-test-1');
    const track2 = useProjectStore.getState().project?.tracks.find((t) => t.id === trackId);
    expect(track2?.plugins?.[0].enabled).toBe(true);
  });
});
