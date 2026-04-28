import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EngineWorkletHost } from '../EngineWorkletHost';

// Mock AudioWorkletNode and AudioContext
class MockPort {
  onmessage: ((e: MessageEvent) => void) | null = null;
  postMessage = vi.fn((msg: Record<string, unknown>) => {
    // Auto-reply 'ready' to 'init' messages for faster tests
    if (msg.type === 'init' && this.onmessage) {
      setTimeout(() => {
        this.onmessage?.(new MessageEvent('message', { data: { type: 'ready' } }));
      }, 0);
    }
  });
  close = vi.fn();
}

const mockPort = new MockPort();

vi.stubGlobal('AudioWorkletNode', class {
  port = mockPort;
  connect = vi.fn();
  disconnect = vi.fn();
  constructor() {
    mockPort.onmessage = null;
    mockPort.postMessage.mockClear();
  }
});

function createMockContext(): AudioContext {
  return {
    audioWorklet: {
      addModule: vi.fn().mockResolvedValue(undefined),
    },
    sampleRate: 48000,
  } as unknown as AudioContext;
}

describe('EngineWorkletHost', () => {
  let host: EngineWorkletHost;
  let ctx: AudioContext;

  beforeEach(() => {
    ctx = createMockContext();
    host = new EngineWorkletHost({ context: ctx });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('starts in uninitialized state', () => {
    expect(host.state).toBe('uninitialized');
    expect(host.node).toBeNull();
    expect(host.audioBuffer).toBeNull();
    expect(host.paramBuffer).toBeNull();
  });

  it('isSupported returns boolean', () => {
    expect(typeof EngineWorkletHost.isSupported()).toBe('boolean');
  });

  it('initialize registers worklet and creates buffers', async () => {
    const result = await host.initialize();
    expect(result).toBe(true);
    expect(host.state).toBe('ready');
    expect(host.audioBuffer).not.toBeNull();
    expect(host.paramBuffer).not.toBeNull();
    expect(ctx.audioWorklet.addModule).toHaveBeenCalledWith('/engine-worklet-processor.js');
  });

  it('initialize sends SABs to worklet via port', async () => {
    await host.initialize();
    expect(mockPort.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'init',
        audioSab: expect.any(SharedArrayBuffer),
        paramSab: expect.any(SharedArrayBuffer),
      }),
    );
  });

  it('play sends play command', async () => {
    await host.initialize();
    mockPort.postMessage.mockClear();
    host.play();
    expect(host.state).toBe('playing');
    expect(mockPort.postMessage).toHaveBeenCalledWith({ type: 'play' });
  });

  it('stop sends stop command', async () => {
    await host.initialize();
    host.play();
    mockPort.postMessage.mockClear();
    host.stop();
    expect(host.state).toBe('stopped');
    expect(mockPort.postMessage).toHaveBeenCalledWith({ type: 'stop' });
  });

  it('writeAudio writes to ring buffer', async () => {
    await host.initialize();
    const data = new Float32Array(256); // 128 frames x 2ch
    const written = host.writeAudio(data, 128);
    expect(written).toBe(128);
  });

  it('writeAudioDeinterleaved writes to ring buffer', async () => {
    await host.initialize();
    const left = new Float32Array(128);
    const right = new Float32Array(128);
    const written = host.writeAudioDeinterleaved([left, right], 128);
    expect(written).toBe(128);
  });

  it('setParam updates param buffer', async () => {
    await host.initialize();
    host.setParam(0, 440);
    expect(host.paramBuffer!.get(0)).toBeCloseTo(440, 1);
  });

  it('dispose cleans up resources', async () => {
    await host.initialize();
    host.dispose();
    expect(host.state).toBe('uninitialized');
    expect(host.node).toBeNull();
    expect(host.audioBuffer).toBeNull();
  });

  it('fires onStateChange callback', async () => {
    const states: string[] = [];
    host.onStateChange((s) => states.push(s));
    await host.initialize();
    expect(states).toContain('initializing');
    expect(states).toContain('ready');
  });

  it('fires onDropout callback on dropout message', async () => {
    await host.initialize();
    const dropouts: { count: number; deficit: number }[] = [];
    host.onDropout((info) => dropouts.push(info));

    // Simulate dropout message from worklet
    mockPort.onmessage?.(new MessageEvent('message', {
      data: { type: 'dropout', count: 1, deficit: 32 },
    }));

    expect(dropouts).toHaveLength(1);
    expect(dropouts[0].count).toBe(1);
    expect(dropouts[0].deficit).toBe(32);
    expect(host.dropoutCount).toBe(1);
  });

  it('does not re-initialize if already ready', async () => {
    await host.initialize();
    const result = await host.initialize();
    expect(result).toBe(true);
    // addModule should only be called once
    expect(ctx.audioWorklet.addModule).toHaveBeenCalledTimes(1);
  });
});
