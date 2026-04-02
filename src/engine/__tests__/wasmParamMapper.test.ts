import { describe, it, expect } from 'vitest';
import { canUseWasmForChain, mapEffectToWasm, WASM_SUPPORTED_EFFECTS } from '../wasmParamMapper';
import type { TrackEffect } from '../../types/project';

// Minimal effect factory helpers
function makeEffect(type: string, params: Record<string, unknown> = {}, enabled = true): TrackEffect {
  return { id: `eff-${type}`, type, params, enabled } as unknown as TrackEffect;
}

describe('wasmParamMapper', () => {
  describe('WASM_SUPPORTED_EFFECTS', () => {
    it('contains the expected 11 effect types', () => {
      expect(WASM_SUPPORTED_EFFECTS).toContain('compressor');
      expect(WASM_SUPPORTED_EFFECTS).toContain('parametricEq');
      expect(WASM_SUPPORTED_EFFECTS).toContain('reverb');
      expect(WASM_SUPPORTED_EFFECTS).toContain('delay');
      expect(WASM_SUPPORTED_EFFECTS).toContain('distortion');
      expect(WASM_SUPPORTED_EFFECTS).toContain('filter');
      expect(WASM_SUPPORTED_EFFECTS).toContain('chorus');
      expect(WASM_SUPPORTED_EFFECTS).toContain('phaser');
      expect(WASM_SUPPORTED_EFFECTS).toContain('gate');
      expect(WASM_SUPPORTED_EFFECTS).toContain('limiter');
      expect(WASM_SUPPORTED_EFFECTS).toContain('stereoImager');
    });

    it('does NOT contain unsupported types', () => {
      expect(WASM_SUPPORTED_EFFECTS).not.toContain('eq3');
      expect(WASM_SUPPORTED_EFFECTS).not.toContain('flanger');
      expect(WASM_SUPPORTED_EFFECTS).not.toContain('convolver');
      expect(WASM_SUPPORTED_EFFECTS).not.toContain('saturation');
      expect(WASM_SUPPORTED_EFFECTS).not.toContain('algorithmicReverb');
    });
  });

  describe('canUseWasmForChain', () => {
    it('returns true for empty chain', () => {
      expect(canUseWasmForChain([])).toBe(true);
    });

    it('returns true for all-WASM-supported chain', () => {
      const effects = [
        makeEffect('compressor', { threshold: -20, ratio: 4, attack: 0.01, release: 0.1, knee: 6 }),
        makeEffect('reverb', { decay: 2.5, preDelay: 0.02, wet: 0.3 }),
        makeEffect('delay', { time: 0.25, feedback: 0.3, wet: 0.5 }),
      ];
      expect(canUseWasmForChain(effects)).toBe(true);
    });

    it('returns false when chain contains unsupported effect', () => {
      const effects = [
        makeEffect('compressor', { threshold: -20, ratio: 4, attack: 0.01, release: 0.1, knee: 6 }),
        makeEffect('convolver', { irType: 'plate', wet: 0.5 }),
      ];
      expect(canUseWasmForChain(effects)).toBe(false);
    });

    it('returns false when compressor has sidechain', () => {
      const effects = [
        makeEffect('compressor', {
          threshold: -20, ratio: 4, attack: 0.01, release: 0.1, knee: 6,
          sidechainSourceTrackId: 'other-track',
        }),
      ];
      expect(canUseWasmForChain(effects)).toBe(false);
    });

    it('ignores disabled effects for compatibility check', () => {
      const effects = [
        makeEffect('compressor', { threshold: -20, ratio: 4, attack: 0.01, release: 0.1, knee: 6 }),
        makeEffect('convolver', { irType: 'plate', wet: 0.5 }, false), // disabled
      ];
      expect(canUseWasmForChain(effects)).toBe(true);
    });
  });

  describe('mapEffectToWasm', () => {
    it('maps compressor params with s→ms conversion', () => {
      const msg = mapEffectToWasm('compressor', {
        threshold: -20, ratio: 4, attack: 0.01, release: 0.1, knee: 6,
      });
      expect(msg).toEqual({
        type: 'set-compressor',
        threshold: -20,
        ratio: 4,
        attackMs: 10,   // 0.01s → 10ms
        releaseMs: 100,  // 0.1s → 100ms
        kneeDb: 6,
        makeupDb: 0,
      });
    });

    it('maps delay params with s→ms conversion', () => {
      const msg = mapEffectToWasm('delay', { time: 0.25, feedback: 0.3, wet: 0.5 });
      expect(msg).toEqual({
        type: 'set-delay',
        delayMs: 250,   // 0.25s → 250ms
        feedback: 0.3,
        wet: 0.5,
      });
    });

    it('maps distortion type string to int', () => {
      const msg = mapEffectToWasm('distortion', { amount: 0.5, distortionType: 'overdrive', wet: 0.8 });
      expect(msg.type).toBe('set-distortion');
      expect(msg.distType).toBe(1); // overdrive = 1
      expect(msg.drive).toBe(0.5);
      expect(msg.mix).toBe(0.8);
    });

    it('maps filter type string to FilterType enum', () => {
      const msg = mapEffectToWasm('filter', { frequency: 1000, resonance: 2, filterType: 'highpass' });
      expect(msg.type).toBe('set-filter');
      expect(msg.filterType).toBe(1); // highpass = 1
      expect(msg.frequency).toBe(1000);
      expect(msg.q).toBe(2);
    });

    it('maps reverb params', () => {
      const msg = mapEffectToWasm('reverb', { decay: 2.5, preDelay: 0.02, wet: 0.3 });
      expect(msg.type).toBe('set-reverb');
      expect(msg.roomSize).toBeCloseTo(0.25, 1); // decay/10
      expect(msg.wet).toBe(0.3);
    });

    it('maps chorus params', () => {
      const msg = mapEffectToWasm('chorus', {
        frequency: 1.5, depth: 0.7, delayTime: 3.5, feedback: 0, wet: 0.5,
      });
      expect(msg.type).toBe('set-chorus');
      expect(msg.rateHz).toBe(1.5);
      expect(msg.depthMs).toBeCloseTo(0.7 * 3.5, 2); // depth * delayTime
      expect(msg.delayMs).toBe(3.5);
    });

    it('maps phaser params', () => {
      const msg = mapEffectToWasm('phaser', {
        frequency: 0.5, octaves: 3, stages: 4, Q: 10, baseFrequency: 350, wet: 0.5,
      });
      expect(msg.type).toBe('set-phaser');
      expect(msg.rateHz).toBe(0.5);
      expect(msg.stages).toBe(4);
    });

    it('maps gate params with s→ms conversion', () => {
      const msg = mapEffectToWasm('gate', {
        threshold: -40, range: -80, attack: 0.001, hold: 0.05, release: 0.1,
        hysteresis: 3, mode: 'gate', sidechainHpf: 0, sidechainLpf: 20000,
      });
      expect(msg.type).toBe('set-gate');
      expect(msg.attackMs).toBe(1);
      expect(msg.holdMs).toBe(50);
      expect(msg.releaseMs).toBe(100);
    });

    it('maps limiter params', () => {
      const msg = mapEffectToWasm('limiter', {
        ceiling: -1, release: 0.05, lookahead: 0.005, gain: 0, style: 'transparent',
      });
      expect(msg.type).toBe('set-limiter');
      expect(msg.ceilingDb).toBe(-1);
      expect(msg.releaseMs).toBe(50);
    });

    it('maps stereoImager params', () => {
      const msg = mapEffectToWasm('stereoImager', {
        width: 1.5, midGain: 0, sideGain: 0, monoFreq: 200, pan: 0,
      });
      expect(msg.type).toBe('set-stereo-width');
      expect(msg.width).toBe(1.5);
    });

    it('returns null for unsupported effect type', () => {
      const msg = mapEffectToWasm('convolver', { irType: 'plate', wet: 0.5 });
      expect(msg).toBeNull();
    });
  });
});
