import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VST3PluginAdapter } from '../VST3PluginAdapter';
import type { VST3BridgeClient } from '../VST3BridgeClient';
import type {
  VST3PluginInfo,
  VST3ParamInfo,
  InstantiatedResponse,
} from '../VST3BridgeProtocol';

// Mock VST3AudioWorkletNode to avoid needing real AudioWorklet in tests
vi.mock('../VST3AudioWorklet', () => ({
  VST3AudioWorkletNode: {
    create: vi.fn(async () => ({
      inputNode: null,
      outputNode: { connect: vi.fn(), disconnect: vi.fn() },
      outputSAB: new SharedArrayBuffer(1024),
      inputSAB: null,
      dropoutCount: 0,
      disposed: false,
      dispose: vi.fn(),
    })),
  },
}));

// ─── Test helpers ───────────────────────────────────────────────────────────

function createMockBridgeClient(): VST3BridgeClient & {
  _listeners: Map<string, Set<(msg: Record<string, unknown>) => void>>;
  _emit: (event: string, msg: Record<string, unknown>) => void;
} {
  const listeners = new Map<string, Set<(msg: Record<string, unknown>) => void>>();

  const client = {
    _listeners: listeners,
    _emit(event: string, msg: Record<string, unknown>) {
      const set = listeners.get(event);
      if (set) {
        for (const cb of set) cb(msg);
      }
    },
    on: vi.fn((event: string, cb: (msg: Record<string, unknown>) => void) => {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
    }),
    off: vi.fn((event: string, cb: (msg: Record<string, unknown>) => void) => {
      listeners.get(event)?.delete(cb);
    }),
    setParam: vi.fn(),
    sendMidi: vi.fn(),
    sendAudioFrame: vi.fn(),
    send: vi.fn(),
    onAudioFrame: vi.fn(() => vi.fn()),
    offAudioFrame: vi.fn(),
    openEditor: vi.fn(async () => ({ width: 800, height: 600 })),
    getState: vi.fn(async () => 'base64-state-data'),
    setState: vi.fn(async () => {}),
    destroy: vi.fn(),
  };

  return client as unknown as VST3BridgeClient & {
    _listeners: Map<string, Set<(msg: Record<string, unknown>) => void>>;
    _emit: (event: string, msg: Record<string, unknown>) => void;
  };
}

function makePluginInfo(overrides?: Partial<VST3PluginInfo>): VST3PluginInfo {
  return {
    uid: 'ABC123',
    name: 'TestSynth',
    vendor: 'TestVendor',
    category: 'instrument',
    audioInputs: 0,
    audioOutputs: 2,
    ...overrides,
  };
}

function makeParams(): VST3ParamInfo[] {
  return [
    { id: 0, title: 'Volume', units: 'dB', min: 0, max: 1, defaultValue: 0.8, stepCount: 0 },
    { id: 1, title: 'Filter', units: 'Hz', min: 0, max: 1, defaultValue: 0.5, stepCount: 100 },
  ];
}

function makeInstantiatedResponse(
  params?: VST3ParamInfo[],
  latency?: number,
): InstantiatedResponse {
  return {
    instanceId: 'inst-001',
    parameters: params ?? makeParams(),
    latencySamples: latency ?? 256,
  };
}

// ─── Mock AudioContext for createAudioNode ───────────────────────────────

function createMockAudioContext(): AudioContext {
  const gainNode = {
    gain: { value: 1 },
    connect: vi.fn(),
    disconnect: vi.fn(),
  };
  return {
    createGain: vi.fn(() => ({ ...gainNode })),
    destination: {},
  } as unknown as AudioContext;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('VST3PluginAdapter', () => {
  let bridgeClient: ReturnType<typeof createMockBridgeClient>;

  beforeEach(() => {
    bridgeClient = createMockBridgeClient();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createAdapter(
    pluginInfoOverrides?: Partial<VST3PluginInfo>,
    params?: VST3ParamInfo[],
    latency?: number,
  ) {
    const pluginInfo = makePluginInfo(pluginInfoOverrides);
    const response = makeInstantiatedResponse(params, latency);
    return new VST3PluginAdapter('inst-001', pluginInfo, response, bridgeClient);
  }

  // ─── 1. Constructor maps VST3PluginInfo to WAPPlugin properties ─────

  describe('constructor', () => {
    it('maps instrument plugin info correctly', () => {
      const adapter = createAdapter({ name: 'MySynth', vendor: 'Acme', category: 'instrument' });

      expect(adapter.name).toBe('MySynth');
      expect(adapter.pluginType).toBe('instrument');
      expect(adapter.version).toBe('1.0.0');
      expect(adapter.author).toBe('Acme');
      expect(adapter.description).toBe('VST3: MySynth by Acme');
    });

    it('maps effect plugin info correctly', () => {
      const adapter = createAdapter({ name: 'MyReverb', vendor: 'FXCo', category: 'effect' });

      expect(adapter.pluginType).toBe('effect');
      expect(adapter.description).toBe('VST3: MyReverb by FXCo');
    });

    it('treats "other" category as effect', () => {
      const adapter = createAdapter({ category: 'other' });
      expect(adapter.pluginType).toBe('effect');
    });

    it('exposes instanceIdentifier and pluginLatency', () => {
      const adapter = createAdapter(undefined, undefined, 512);
      expect(adapter.instanceIdentifier).toBe('inst-001');
      expect(adapter.pluginLatency).toBe(512);
    });

    it('registers paramChanged listener on bridge client', () => {
      createAdapter();
      expect(bridgeClient.on).toHaveBeenCalledWith('paramChanged', expect.any(Function));
    });
  });

  // ─── 2. Parameter descriptors mapped from VST3 params ────────────────

  describe('parameter descriptors', () => {
    it('maps VST3 params to FloatParamDescriptors', () => {
      const params = makeParams();
      const adapter = createAdapter(undefined, params);
      const descriptors = adapter.getParameterDescriptors();

      expect(descriptors).toHaveLength(2);

      expect(descriptors[0]).toEqual({
        id: '0',
        name: 'Volume',
        type: 'float',
        min: 0,
        max: 1,
        defaultValue: 0.8,
        step: undefined, // stepCount 0 = continuous
      });

      expect(descriptors[1]).toEqual({
        id: '1',
        name: 'Filter',
        type: 'float',
        min: 0,
        max: 1,
        defaultValue: 0.5,
        step: 0.01, // (1 - 0) / 100
      });
    });

    it('builds default param values from VST3 defaults', () => {
      const adapter = createAdapter();
      const values = adapter.getParameters();

      expect(values['0']).toBe(0.8);
      expect(values['1']).toBe(0.5);
    });

    it('returns undefined for unknown parameter', () => {
      const adapter = createAdapter();
      expect(adapter.getParameter('999')).toBeUndefined();
    });
  });

  // ─── 3. setParameter forwards to bridge client ───────────────────────

  describe('setParameter', () => {
    it('updates local value and forwards to bridge client', () => {
      const adapter = createAdapter();

      adapter.setParameter('0', 0.6);

      expect(adapter.getParameter('0')).toBe(0.6);
      expect(bridgeClient.setParam).toHaveBeenCalledWith('inst-001', 0, 0.6);
    });

    it('sends correct numeric param ID for string key', () => {
      const adapter = createAdapter();

      adapter.setParameter('1', 0.75);

      expect(bridgeClient.setParam).toHaveBeenCalledWith('inst-001', 1, 0.75);
    });
  });

  // ─── 4. noteOn/noteOff sends MIDI via bridge client ──────────────────

  describe('MIDI', () => {
    it('noteOn sends noteOn MIDI event', () => {
      const adapter = createAdapter();

      adapter.noteOn(60, 0.9);

      expect(bridgeClient.sendMidi).toHaveBeenCalledWith('inst-001', [
        { type: 'noteOn', note: 60, velocity: 0.9, sampleOffset: 0 },
      ]);
    });

    it('noteOff sends noteOff MIDI event with velocity 0', () => {
      const adapter = createAdapter();

      adapter.noteOff(60);

      expect(bridgeClient.sendMidi).toHaveBeenCalledWith('inst-001', [
        { type: 'noteOff', note: 60, velocity: 0, sampleOffset: 0 },
      ]);
    });
  });

  // ─── 5. dispose calls bridge client destroy ──────────────────────────

  describe('dispose', () => {
    it('calls bridge client destroy with instance ID', () => {
      const adapter = createAdapter();

      adapter.dispose();

      expect(bridgeClient.destroy).toHaveBeenCalledWith('inst-001');
    });

    it('unregisters paramChanged listener', () => {
      const adapter = createAdapter();

      adapter.dispose();

      expect(bridgeClient.off).toHaveBeenCalledWith('paramChanged', expect.any(Function));
    });

    it('is idempotent — second dispose is a no-op', () => {
      const adapter = createAdapter();

      adapter.dispose();
      adapter.dispose();

      expect(bridgeClient.destroy).toHaveBeenCalledTimes(1);
    });

    it('stops audio pump timer after createAudioNode', () => {
      const adapter = createAdapter({ category: 'instrument' });
      const ctx = createMockAudioContext();
      adapter.createAudioNode(ctx);

      adapter.dispose();

      // Advance timers to confirm pump does not fire after dispose
      vi.advanceTimersByTime(100);
      // No assertion needed — if pump fires after dispose with null
      // buffers it would throw, which would fail the test.
    });
  });

  // ─── 6. Param change from companion updates local state ──────────────

  describe('paramChanged from companion', () => {
    it('updates local param value when companion sends change', () => {
      const adapter = createAdapter();

      // Simulate companion pushing a param change
      bridgeClient._emit('paramChanged', { instanceId: 'inst-001', paramId: 0, value: 0.42 });

      expect(adapter.getParameter('0')).toBe(0.42);
    });

    it('ignores param changes for other instances', () => {
      const adapter = createAdapter();

      bridgeClient._emit('paramChanged', { instanceId: 'other-instance', paramId: 0, value: 0.1 });

      // Value should remain at default
      expect(adapter.getParameter('0')).toBe(0.8);
    });
  });

  // ─── 7. createAudioNode ──────────────────────────────────────────────

  describe('createAudioNode', () => {
    it('returns null inputNode for instrument plugins', () => {
      const adapter = createAdapter({ category: 'instrument' });
      const ctx = createMockAudioContext();

      const audioNode = adapter.createAudioNode(ctx);

      expect(audioNode.inputNode).toBeNull();
      expect(audioNode.outputNode).not.toBeNull();

      adapter.dispose();
    });

    it('returns a GainNode inputNode for effect plugins', () => {
      const adapter = createAdapter({ category: 'effect' });
      const ctx = createMockAudioContext();

      const audioNode = adapter.createAudioNode(ctx);

      expect(audioNode.inputNode).not.toBeNull();
      expect(audioNode.outputNode).not.toBeNull();

      adapter.dispose();
    });
  });

  // ─── 8. Audio receiving pipeline ────────────────────────────────────

  describe('audio receiving pipeline', () => {
    it('subscribes to audio frames on createAudioNodeAsync', async () => {
      const adapter = createAdapter({ category: 'instrument' });
      const ctx = createMockAudioContext();

      await adapter.createAudioNodeAsync(ctx);

      expect(bridgeClient.onAudioFrame).toHaveBeenCalledOnce();
      adapter.dispose();
    });

    it('sends startAudioStream message on createAudioNodeAsync', async () => {
      const adapter = createAdapter({ category: 'instrument' });
      const ctx = createMockAudioContext();

      await adapter.createAudioNodeAsync(ctx);

      expect(bridgeClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'startAudioStream',
          instanceId: 'inst-001',
        }),
      );
      adapter.dispose();
    });

    it('sends stopAudioStream on dispose after audio node created', async () => {
      const adapter = createAdapter({ category: 'instrument' });
      const ctx = createMockAudioContext();

      await adapter.createAudioNodeAsync(ctx);
      adapter.dispose();

      expect(bridgeClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'stopAudioStream',
          instanceId: 'inst-001',
        }),
      );
    });

    it('unsubscribes audio frame handler on dispose', async () => {
      const adapter = createAdapter({ category: 'instrument' });
      const ctx = createMockAudioContext();

      await adapter.createAudioNodeAsync(ctx);
      adapter.dispose();

      expect(bridgeClient.offAudioFrame).toHaveBeenCalledOnce();
    });
  });

  // ─── 9. VST3-specific methods ────────────────────────────────────────

  describe('VST3-specific API', () => {
    it('openEditor delegates to bridge client', async () => {
      const adapter = createAdapter();

      const result = await adapter.openEditor();

      expect(bridgeClient.openEditor).toHaveBeenCalledWith('inst-001');
      expect(result).toEqual({ width: 800, height: 600 });
    });

    it('getState delegates to bridge client', async () => {
      const adapter = createAdapter();

      const state = await adapter.getState();

      expect(bridgeClient.getState).toHaveBeenCalledWith('inst-001');
      expect(state).toBe('base64-state-data');
    });

    it('setState delegates to bridge client', async () => {
      const adapter = createAdapter();

      await adapter.setState('new-state-data');

      expect(bridgeClient.setState).toHaveBeenCalledWith('inst-001', 'new-state-data');
    });
  });
});
