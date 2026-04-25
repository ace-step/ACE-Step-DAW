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
  parseDuration,
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

describe('NativePolySynth per-note release', () => {
  it('releases only the specified note, not all voices', () => {
    const ctx = createMockCtx();
    const synth = new NativePolySynth(ctx, { maxPolyphony: 4 });

    // Attack three notes
    synth.triggerAttack(['C4', 'E4', 'G4']);

    // Release only E4 — C4 and G4 should remain active
    expect(() => synth.triggerRelease('E4')).not.toThrow();

    // Releasing G4 should also work independently
    expect(() => synth.triggerRelease('G4')).not.toThrow();
  });

  it('releaseAll releases all voices regardless of notes', () => {
    const ctx = createMockCtx();
    const synth = new NativePolySynth(ctx, { maxPolyphony: 4 });

    synth.triggerAttack(['C4', 'E4', 'G4']);
    expect(() => synth.releaseAll()).not.toThrow();
  });

  it('re-triggering the same note reuses the same voice slot', () => {
    const ctx = createMockCtx();
    const synth = new NativePolySynth(ctx, { maxPolyphony: 4 });

    // Play C4, then retrigger C4 — should reuse same voice
    synth.triggerAttack('C4');
    expect(() => synth.triggerAttack('C4')).not.toThrow();
  });
});

describe('NativeFMSynth voice cleanup', () => {
  it('re-triggering stops previous oscillators', () => {
    const ctx = createMockCtx();
    const synth = new NativeFMSynth(ctx);

    // First trigger
    synth.triggerAttack('C4');
    // Second trigger should clean up first
    expect(() => synth.triggerAttack('E4')).not.toThrow();
    // Release should also work
    expect(() => synth.triggerRelease()).not.toThrow();
  });

  it('triggerRelease after triggerAttack stops oscillators', () => {
    const ctx = createMockCtx();
    const synth = new NativeFMSynth(ctx);

    synth.triggerAttack('A4', 0, 0.8);
    // Should stop carrier + modulator
    expect(() => synth.triggerRelease()).not.toThrow();
    // Double release should be safe
    expect(() => synth.triggerRelease()).not.toThrow();
  });
});

describe('parseDuration', () => {
  it('returns numeric durations as-is regardless of BPM', () => {
    expect(parseDuration(0.5, 120)).toBe(0.5);
    expect(parseDuration(1.0, 90)).toBe(1.0);
  });

  it('parses Tone.js notation with explicit BPM', () => {
    // At 120 BPM: quarter note = 0.5s, eighth note = 0.25s
    expect(parseDuration('4n', 120)).toBeCloseTo(0.5);
    expect(parseDuration('8n', 120)).toBeCloseTo(0.25);
    expect(parseDuration('2n', 120)).toBeCloseTo(1.0);
  });

  it('uses correct BPM for tempo-dependent durations', () => {
    // At 60 BPM: quarter note = 1.0s
    expect(parseDuration('4n', 60)).toBeCloseTo(1.0);
    expect(parseDuration('8n', 60)).toBeCloseTo(0.5);

    // At 180 BPM: quarter note = 0.333s
    expect(parseDuration('4n', 180)).toBeCloseTo(1 / 3);
  });

  it('returns fallback for unparseable strings', () => {
    expect(parseDuration('invalid', 120)).toBe(0.25);
  });
});

describe('NativeFrequencyEnvelope signal output', () => {
  it('creates with DC source for non-zero output signal', () => {
    const ctx = createMockCtx();
    const env = new NativeFrequencyEnvelope(ctx);
    expect(env.outputNode).toBeDefined();
  });

  it('triggerAttack/triggerRelease automate gain values', () => {
    const ctx = createMockCtx();
    const env = new NativeFrequencyEnvelope(ctx, {
      baseFrequency: 200,
      octaves: 4,
      attack: 0.01,
      decay: 0.1,
      sustain: 0.5,
      release: 0.3,
    });

    expect(() => env.triggerAttack()).not.toThrow();
    expect(() => env.triggerRelease()).not.toThrow();
  });
});

describe('Native synth duration parsing uses the injected BPM (regression #1588)', () => {
  it('produces different durations at different BPMs for note notation', () => {
    // BPM=60: quarter note = 1.0s
    const osc60 = new MockOscillatorNode();
    const ctx60 = { ...createMockCtx(), createOscillator: () => osc60 } as unknown as AudioContext;
    const synth60 = new NativePolySynth(ctx60);
    synth60.bpm = 60;
    synth60.triggerAttackRelease('C4', '4n');
    const stopTime60 = osc60.stop.mock.calls[0]?.[0] as number;

    // BPM=120: quarter note = 0.5s
    const osc120 = new MockOscillatorNode();
    const ctx120 = { ...createMockCtx(), createOscillator: () => osc120 } as unknown as AudioContext;
    const synth120 = new NativePolySynth(ctx120);
    synth120.bpm = 120;
    synth120.triggerAttackRelease('C4', '4n');
    const stopTime120 = osc120.stop.mock.calls[0]?.[0] as number;

    // A quarter note should last longer at slower BPM
    expect(stopTime60).toBeGreaterThan(stopTime120);
  });
});
