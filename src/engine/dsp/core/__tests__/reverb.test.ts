import { describe, it, expect, beforeEach } from 'vitest';
import { FreeVerb } from '../reverb';

const SR = 44100;

describe('FreeVerb', () => {
  let verb: FreeVerb;

  beforeEach(() => {
    verb = new FreeVerb(SR);
  });

  it('produces output from impulse', () => {
    verb.wet = 1;
    verb.dry = 0;
    verb.roomSize = 0.5;

    // Process impulse through multiple blocks to build up reverb
    const blockSize = 1024;
    const totalBlocks = 16;
    const output = new Float32Array(blockSize * totalBlocks);

    for (let b = 0; b < totalBlocks; b++) {
      const input = new Float32Array(blockSize);
      if (b === 0) input[0] = 1; // impulse in first block
      const blockOut = new Float32Array(blockSize);
      verb.processMono(input, blockOut, 0, blockSize);
      output.set(blockOut, b * blockSize);
    }

    // Should have reverb tail — check that some output is non-zero
    const hasOutput = output.some(v => Math.abs(v) > 0.0001);
    expect(hasOutput).toBe(true);
  });

  it('dry/wet mix works correctly', () => {
    // Full dry
    verb.wet = 0;
    verb.dry = 1;
    const input = new Float32Array(1024).fill(0.5);
    const dryOut = new Float32Array(1024);
    verb.processMono(input, dryOut, 0, 1024);

    // Output should be same as input
    for (let i = 0; i < 1024; i++) {
      expect(dryOut[i]).toBeCloseTo(0.5, 1);
    }
  });

  it('stereo processing produces different L/R', () => {
    verb.wet = 1;
    verb.dry = 0;
    verb.roomSize = 0.8;

    const inputL = new Float32Array(4096);
    const inputR = new Float32Array(4096);
    inputL[0] = 1;
    inputR[0] = 1;

    const outL = new Float32Array(4096);
    const outR = new Float32Array(4096);

    verb.processStereo(inputL, inputR, outL, outR, 0, 4096);

    // L and R should differ due to stereo spread
    let diff = 0;
    for (let i = 0; i < 4096; i++) {
      diff += Math.abs(outL[i] - outR[i]);
    }
    expect(diff).toBeGreaterThan(0);
  });

  it('roomSize affects decay length', () => {
    // Short room
    verb.roomSize = 0.1;
    verb.wet = 1;
    verb.dry = 0;
    const input1 = new Float32Array(8192);
    input1[0] = 1;
    const out1 = new Float32Array(8192);
    verb.processMono(input1, out1, 0, 8192);

    verb.reset();

    // Long room
    verb.roomSize = 0.9;
    const input2 = new Float32Array(8192);
    input2[0] = 1;
    const out2 = new Float32Array(8192);
    verb.processMono(input2, out2, 0, 8192);

    // Measure tail energy in late portion
    let late1 = 0, late2 = 0;
    for (let i = 6000; i < 8192; i++) {
      late1 += out1[i] * out1[i];
      late2 += out2[i] * out2[i];
    }

    // Longer room should have more tail energy
    expect(late2).toBeGreaterThan(late1);
  });

  it('reset clears reverb tail', () => {
    verb.wet = 1;
    verb.dry = 0;

    const impulse = new Float32Array(1024);
    impulse[0] = 1;
    verb.processMono(impulse, new Float32Array(1024), 0, 1024);

    verb.reset();

    // After reset, silence in should produce silence out
    const silence = new Float32Array(1024);
    const out = new Float32Array(1024);
    verb.processMono(silence, out, 0, 1024);

    for (let i = 0; i < 1024; i++) {
      expect(Math.abs(out[i])).toBeLessThan(0.0001);
    }
  });

  it('processes silence without artifacts', () => {
    const silence = new Float32Array(4096);
    const out = new Float32Array(4096);
    verb.processMono(silence, out, 0, 4096);

    for (let i = 0; i < 4096; i++) {
      expect(Math.abs(out[i])).toBeLessThan(0.0001);
    }
  });

  it('damping parameter is settable', () => {
    verb.damping = 0.9;
    expect(verb.damping).toBe(0.9);
    verb.damping = 0.1;
    expect(verb.damping).toBe(0.1);
  });
});
