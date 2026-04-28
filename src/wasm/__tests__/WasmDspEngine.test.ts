import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WasmDspEngine, FilterType } from '../WasmDspEngine';

// Mock AudioWorkletNode
class MockAudioWorkletNode {
  port = {
    postMessage: vi.fn(),
    onmessage: null as ((event: MessageEvent) => void) | null,
  };
  disconnect = vi.fn();

  // Simulate receiving a message from the worklet
  simulateMessage(data: Record<string, unknown>) {
    if (this.port.onmessage) {
      this.port.onmessage(new MessageEvent('message', { data }));
    }
  }
}

// Mock AudioContext
function createMockAudioContext(sampleRate = 48000) {
  const mockWorkletNodes: MockAudioWorkletNode[] = [];

  const ctx = {
    sampleRate,
    audioWorklet: {
      addModule: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as AudioContext;

  // Override AudioWorkletNode constructor in test.
  // Must use a real class (not vi.fn()) so `new` works.
  class StubAudioWorkletNode extends MockAudioWorkletNode {
    constructor(_ctx: unknown, _name: string, _opts?: unknown) {
      super();
      mockWorkletNodes.push(this);
      setTimeout(() => this.simulateMessage({ type: 'ready' }), 0);
    }
  }
  vi.stubGlobal('AudioWorkletNode', StubAudioWorkletNode);

  return { ctx, mockWorkletNodes };
}

describe('WasmDspEngine', () => {
  let engine: WasmDspEngine;

  beforeEach(() => {
    engine = new WasmDspEngine();

    // Mock fetch for WASM binary
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(100)),
      })
    );
  });

  afterEach(() => {
    engine.dispose();
    vi.restoreAllMocks();
  });

  describe('initialization', () => {
    it('should not be initialized before calling initialize()', () => {
      expect(engine.initialized).toBe(false);
    });

    it('should initialize successfully', async () => {
      const { ctx } = createMockAudioContext();
      await engine.initialize(ctx);
      expect(engine.initialized).toBe(true);
    });

    it('should fetch WASM binary during initialization', async () => {
      const { ctx } = createMockAudioContext();
      await engine.initialize(ctx);
      expect(fetch).toHaveBeenCalledWith(
        expect.stringContaining('ace_dsp_wasm_bg.wasm')
      );
    });

    it('should register AudioWorklet module during initialization', async () => {
      const { ctx } = createMockAudioContext();
      await engine.initialize(ctx);
      expect(ctx.audioWorklet.addModule).toHaveBeenCalledWith(
        '/wasm-dsp-processor.js'
      );
    });

    it('should not re-initialize if already initialized', async () => {
      const { ctx } = createMockAudioContext();
      await engine.initialize(ctx);
      await engine.initialize(ctx);
      // fetch should only be called once
      expect(fetch).toHaveBeenCalledTimes(1);
    });

    it('should throw if WASM fetch fails', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 404 })
      );
      const { ctx } = createMockAudioContext();
      await expect(engine.initialize(ctx)).rejects.toThrow(
        'Failed to fetch WASM binary: 404'
      );
    });
  });

  describe('createProcessor', () => {
    it('should throw if engine not initialized', () => {
      const { ctx } = createMockAudioContext();
      expect(() => engine.createProcessor(ctx, 'track-1')).toThrow(
        'not initialized'
      );
    });

    it('should create a processor node', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      expect(node).not.toBeUndefined();
      expect(node.audioNode).not.toBeUndefined();
      expect(mockWorkletNodes.length).toBe(1);
    });

    it('should send init message with WASM bytes', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      engine.createProcessor(ctx, 'track-1');
      const postMessage = mockWorkletNodes[0].port.postMessage;
      expect(postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'init',
          sampleRate: 48000,
        })
      );
      // Verify wasmBytes is an ArrayBuffer
      const initCall = postMessage.mock.calls.find(
        (c: unknown[]) =>
          (c[0] as Record<string, unknown>).type === 'init'
      );
      expect(initCall?.[0].wasmBytes).toBeInstanceOf(ArrayBuffer);
    });

    it('should dispose previous node when creating a new one for same track', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      engine.createProcessor(ctx, 'track-1');
      engine.createProcessor(ctx, 'track-1');

      // First node should be disconnected
      expect(mockWorkletNodes[0].disconnect).toHaveBeenCalled();
      expect(mockWorkletNodes.length).toBe(2);
    });
  });

  describe('parameter control', () => {
    it('should send set-gain message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.setGain(0.75);

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'set-gain',
        value: 0.75,
      });
    });

    it('should send set-filter message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.setFilter(FilterType.Lowpass, 1000, 0.707, 0);

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'set-filter',
        filterType: 0,
        frequency: 1000,
        q: 0.707,
        gainDb: 0,
      });
    });

    it('should send disable-filter message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.disableFilter();

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'disable-filter',
      });
    });

    it('should send reset message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.reset();

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'reset',
      });
    });

    it('should send set-delay message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.setDelay(250, 0.5, 0.7);

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'set-delay',
        delayMs: 250,
        feedback: 0.5,
        wet: 0.7,
      });
    });

    it('should send set-delay-params message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.setDelayParams(300, 0.4, 0.6, 0.8);

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'set-delay-params',
        delayMs: 300,
        feedback: 0.4,
        wet: 0.6,
        dry: 0.8,
      });
    });

    it('should send disable-delay message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.disableDelay();

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'disable-delay',
      });
    });

    it('should send set-compressor message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.setCompressor(-20, 4, 10, 100, 6, 3);

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'set-compressor',
        thresholdDb: -20,
        ratio: 4,
        attackMs: 10,
        releaseMs: 100,
        kneeDb: 6,
        makeupDb: 3,
      });
    });

    it('should send disable-compressor message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.disableCompressor();

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'disable-compressor',
      });
    });

    it('should send set-gate message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.setGate(-40, 0.5, 50, 200, -80);

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'set-gate',
        thresholdDb: -40,
        attackMs: 0.5,
        holdMs: 50,
        releaseMs: 200,
        rangeDb: -80,
      });
    });

    it('should send disable-gate message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.disableGate();

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'disable-gate',
      });
    });

    it('should send set-eq-band message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.setEqBand(0, FilterType.Peaking, 1000, 1.0, 6.0, true);

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'set-eq-band',
        bandIndex: 0,
        filterType: 5,
        frequency: 1000,
        q: 1.0,
        gainDb: 6.0,
        enabled: true,
      });
    });

    it('should send disable-eq message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.disableEq();

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'disable-eq',
      });
    });

    it('should send set-reverb message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.setReverb(0.7, 0.4, 0.5, 0.8);

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'set-reverb',
        roomSize: 0.7,
        damping: 0.4,
        wet: 0.5,
        dry: 0.8,
      });
    });

    it('should send disable-reverb message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.disableReverb();

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'disable-reverb',
      });
    });

    it('should send set-chorus message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.setChorus(1.5, 5.0, 10.0, 0.3, 0.5, 0.8);

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'set-chorus',
        rateHz: 1.5,
        depthMs: 5.0,
        delayMs: 10.0,
        feedback: 0.3,
        wet: 0.5,
        dry: 0.8,
      });
    });

    it('should send disable-chorus message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.disableChorus();

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'disable-chorus',
      });
    });

    it('should send set-distortion message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.setDistortion(1, 5.0, 0.8, 1.0, 8.0);

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'set-distortion',
        distType: 1,
        drive: 5.0,
        mix: 0.8,
        outputGain: 1.0,
        bitDepth: 8.0,
      });
    });

    it('should send disable-distortion message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.disableDistortion();

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'disable-distortion',
      });
    });

    it('should send set-phaser message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.setPhaser(1.5, 0.8, 0.5, 6, 0.7);

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'set-phaser',
        rateHz: 1.5,
        depth: 0.8,
        feedback: 0.5,
        stages: 6,
        mix: 0.7,
      });
    });

    it('should send disable-phaser message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.disablePhaser();

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'disable-phaser',
      });
    });

    it('should send set-tremolo message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.setTremolo(5.0, 0.8, 0);

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'set-tremolo',
        rateHz: 5.0,
        depth: 0.8,
        shape: 0,
      });
    });

    it('should send disable-tremolo message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.disableTremolo();

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'disable-tremolo',
      });
    });

    it('should send set-autopan message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.setAutoPan(2.0, 0.8, 0);

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'set-autopan',
        rateHz: 2.0,
        depth: 0.8,
        shape: 0,
      });
    });

    it('should send disable-autopan message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.disableAutoPan();

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'disable-autopan',
      });
    });

    it('should send set-ringmod message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.setRingMod(440, 0.8, 0);

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'set-ringmod',
        freqHz: 440,
        mix: 0.8,
        shape: 0,
      });
    });

    it('should send disable-ringmod message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.disableRingMod();

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'disable-ringmod',
      });
    });

    it('should send set-stereo-width message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.setStereoWidth(1.5);

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'set-stereo-width',
        width: 1.5,
      });
    });

    it('should send disable-stereo-imager message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.disableStereoImager();

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'disable-stereo-imager',
      });
    });

    it('should send set-limiter message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.setLimiter(-0.1, 100, 5);

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'set-limiter',
        ceilingDb: -0.1,
        releaseMs: 100,
        lookaheadMs: 5,
      });
    });

    it('should send set-dc-blocker message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.setDcBlocker(5.0);

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'set-dc-blocker',
        cutoffHz: 5.0,
      });
    });

    it('should send disable-dc-blocker message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.disableDcBlocker();

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'disable-dc-blocker',
      });
    });

    it('should send disable-limiter message', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      node.disableLimiter();

      expect(mockWorkletNodes[0].port.postMessage).toHaveBeenCalledWith({
        type: 'disable-limiter',
      });
    });
  });

  describe('lifecycle', () => {
    it('should get processor by track ID', async () => {
      const { ctx } = createMockAudioContext();
      await engine.initialize(ctx);

      const node = engine.createProcessor(ctx, 'track-1');
      expect(engine.getProcessor('track-1')).toBe(node);
      expect(engine.getProcessor('nonexistent')).toBeUndefined();
    });

    it('should dispose a specific processor', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      engine.createProcessor(ctx, 'track-1');
      engine.disposeProcessor('track-1');

      expect(mockWorkletNodes[0].disconnect).toHaveBeenCalled();
      expect(engine.getProcessor('track-1')).toBeUndefined();
    });

    it('should dispose all processors', async () => {
      const { ctx, mockWorkletNodes } = createMockAudioContext();
      await engine.initialize(ctx);

      engine.createProcessor(ctx, 'track-1');
      engine.createProcessor(ctx, 'track-2');
      engine.dispose();

      expect(mockWorkletNodes[0].disconnect).toHaveBeenCalled();
      expect(mockWorkletNodes[1].disconnect).toHaveBeenCalled();
      expect(engine.initialized).toBe(false);
    });
  });

  describe('FilterType constants', () => {
    it('should have correct filter type values', () => {
      expect(FilterType.Lowpass).toBe(0);
      expect(FilterType.Highpass).toBe(1);
      expect(FilterType.Bandpass).toBe(2);
      expect(FilterType.Notch).toBe(3);
      expect(FilterType.Allpass).toBe(4);
      expect(FilterType.Peaking).toBe(5);
      expect(FilterType.LowShelf).toBe(6);
      expect(FilterType.HighShelf).toBe(7);
    });
  });
});
