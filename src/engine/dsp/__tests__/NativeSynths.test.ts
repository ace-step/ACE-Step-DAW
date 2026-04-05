import { describe, it, expect, vi } from 'vitest';
import {
  NativePolySynth,
  NativeFMSynth,
  NativeMembraneSynth,
  NativeNoiseSynth,
  NativeMetalSynth,
  NativeSynth,
  NativeFrequencyEnvelope,
  NativeBufferSource,
} from '../NativeSynths';

// ---------------------------------------------------------------------------
// Mock Web Audio API
// ---------------------------------------------------------------------------

class MockAudioParam {
  value = 0;
  cancelScheduledValues = vi.fn().mockReturnThis();
  setValueAtTime = vi.fn().mockReturnThis();
  linearRampToValueAtTime = vi.fn().mockReturnThis();
  exponentialRampToValueAtTime = vi.fn().mockReturnThis();
}

class MockAudioNode {
  connected: unknown[] = [];
  connect(dest: unknown) { this.connected.push(dest); return dest; }
  disconnect() { this.connected = []; }
}

class MockGainNode extends MockAudioNode {
  gain = new MockAudioParam();
  constructor() { super(); this.gain.value = 1; }
}

class MockOscillatorNode extends MockAudioNode {
  frequency = new MockAudioParam();
  type = 'sine';
  start = vi.fn();
  stop = vi.fn();
}

class MockBiquadFilterNode extends MockAudioNode {
  frequency = new MockAudioParam();
  Q = new MockAudioParam();
  gain = new MockAudioParam();
  type = 'lowpass';
}

class MockBufferSourceNode extends MockAudioNode {
  buffer: unknown = null;
  playbackRate = new MockAudioParam();
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

function createMockCtx(): AudioContext {
  return {
    currentTime: 0,
    sampleRate: 44100,
    createGain: () => new MockGainNode(),
    createOscillator: () => new MockOscillatorNode(),
    createBiquadFilter: () => new MockBiquadFilterNode(),
    createBuffer: (channels: number, length: number, sr: number) => ({
      getChannelData: () => new Float32Array(length),
      numberOfChannels: channels,
      length,
      sampleRate: sr,
      duration: length / sr,
    }),
    createBufferSource: () => new MockBufferSourceNode(),
  } as unknown as AudioContext;
}

describe('NativePolySynth', () => {
  it('creates with default options', () => {
    const synth = new NativePolySynth(createMockCtx());
    expect(synth.inputNode).toBeDefined();
    expect(synth.outputNode).toBeDefined();
  });

  it('triggerAttack does not throw', () => {
    const synth = new NativePolySynth(createMockCtx());
    expect(() => synth.triggerAttack('C4')).not.toThrow();
    expect(() => synth.triggerAttack(['C4', 'E4', 'G4'])).not.toThrow();
  });

  it('triggerRelease does not throw', () => {
    const synth = new NativePolySynth(createMockCtx());
    synth.triggerAttack('C4');
    expect(() => synth.triggerRelease('C4')).not.toThrow();
  });

  it('triggerAttackRelease does not throw', () => {
    const synth = new NativePolySynth(createMockCtx());
    expect(() => synth.triggerAttackRelease('C4', 0.5)).not.toThrow();
    expect(() => synth.triggerAttackRelease(['C4', 'E4'], '8n')).not.toThrow();
  });

  it('releaseAll does not throw', () => {
    const synth = new NativePolySynth(createMockCtx());
    synth.triggerAttack(['C4', 'E4']);
    expect(() => synth.releaseAll()).not.toThrow();
  });

  it('set() does not throw', () => {
    const synth = new NativePolySynth(createMockCtx());
    expect(() => synth.set({ oscillator: { type: 'sine' } })).not.toThrow();
  });

  it('connect/disconnect/dispose work', () => {
    const ctx = createMockCtx();
    const synth = new NativePolySynth(ctx);
    const gain = new MockGainNode() as unknown as AudioNode;
    expect(() => synth.connectNative(gain)).not.toThrow();
    expect(() => synth.disconnect()).not.toThrow();
    expect(() => synth.dispose()).not.toThrow();
  });
});

describe('NativeSynth', () => {
  it('creates with default options', () => {
    const synth = new NativeSynth(createMockCtx());
    expect(synth).toBeDefined();
  });

  it('triggerAttackRelease does not throw', () => {
    const synth = new NativeSynth(createMockCtx());
    expect(() => synth.triggerAttackRelease('A4', 0.5)).not.toThrow();
  });
});

describe('NativeFMSynth', () => {
  it('creates with options', () => {
    const synth = new NativeFMSynth(createMockCtx(), {
      modulationIndex: 5,
      harmonicity: 2,
    });
    expect(synth).toBeDefined();
  });

  it('triggerAttack and triggerRelease do not throw', () => {
    const synth = new NativeFMSynth(createMockCtx());
    expect(() => synth.triggerAttack('C4')).not.toThrow();
    expect(() => synth.triggerRelease()).not.toThrow();
  });

  it('triggerAttackRelease does not throw', () => {
    const synth = new NativeFMSynth(createMockCtx());
    expect(() => synth.triggerAttackRelease('C4', 0.5)).not.toThrow();
  });
});

describe('NativeMembraneSynth', () => {
  it('creates with default options', () => {
    const synth = new NativeMembraneSynth(createMockCtx());
    expect(synth).toBeDefined();
  });

  it('triggerAttackRelease does not throw', () => {
    const synth = new NativeMembraneSynth(createMockCtx());
    expect(() => synth.triggerAttackRelease('C2', 0.5)).not.toThrow();
  });
});

describe('NativeNoiseSynth', () => {
  it('creates with default options', () => {
    const synth = new NativeNoiseSynth(createMockCtx());
    expect(synth).toBeDefined();
  });

  it('triggerAttackRelease does not throw', () => {
    const synth = new NativeNoiseSynth(createMockCtx());
    expect(() => synth.triggerAttackRelease(0.1)).not.toThrow();
  });
});

describe('NativeMetalSynth', () => {
  it('creates with options', () => {
    const synth = new NativeMetalSynth(createMockCtx(), {
      frequency: 400,
      harmonicity: 5.1,
    });
    expect(synth).toBeDefined();
  });

  it('triggerAttackRelease does not throw', () => {
    const synth = new NativeMetalSynth(createMockCtx());
    expect(() => synth.triggerAttackRelease(0.5)).not.toThrow();
  });
});

describe('NativeFrequencyEnvelope', () => {
  it('creates with options', () => {
    const env = new NativeFrequencyEnvelope(createMockCtx(), {
      baseFrequency: 200,
      octaves: 4,
    });
    expect(env.baseFrequency).toBe(200);
    expect(env.octaves).toBe(4);
  });

  it('triggerAttack and triggerRelease do not throw', () => {
    const env = new NativeFrequencyEnvelope(createMockCtx());
    expect(() => env.triggerAttack()).not.toThrow();
    expect(() => env.triggerRelease()).not.toThrow();
  });
});

describe('NativeBufferSource', () => {
  it('creates and has correct initial state', () => {
    const src = new NativeBufferSource(createMockCtx());
    expect(src.buffer).toBeNull();
    expect(src.playbackRate).toBe(1);
    expect(src.loop).toBe(false);
  });

  it('buffer is settable', () => {
    const ctx = createMockCtx();
    const src = new NativeBufferSource(ctx);
    const buf = ctx.createBuffer(1, 44100, 44100);
    src.buffer = buf as unknown as AudioBuffer;
    expect(src.buffer).toBe(buf);
  });

  it('start and stop do not throw', () => {
    const src = new NativeBufferSource(createMockCtx());
    expect(() => src.start()).not.toThrow();
    expect(() => src.stop()).not.toThrow();
  });

  it('loop properties are settable', () => {
    const src = new NativeBufferSource(createMockCtx());
    src.loop = true;
    expect(src.loop).toBe(true);
    src.loopStart = 0.5;
    expect(src.loopStart).toBe(0.5);
    src.loopEnd = 2.0;
    expect(src.loopEnd).toBe(2.0);
  });
});
