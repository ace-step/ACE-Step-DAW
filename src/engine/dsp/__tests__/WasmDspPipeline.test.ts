/**
 * WASM DSP Pipeline smoke tests.
 *
 * Tests that verify WASM build artifacts are skipped when the artifacts
 * haven't been built (CI doesn't run wasm-pack). The TypeScript API
 * tests always run.
 */
import { describe, it, expect } from 'vitest';
import { isWasmAudioSupported } from '../WasmEffectNode';
import { hasWasmImplementation, isWasmDspReady, getWasmDspStatus } from '../WasmDspBridge';
import * as fs from 'fs';
import * as path from 'path';

const wasmDir = path.resolve(__dirname, '../../../../public/wasm');
const wasmBuilt = fs.existsSync(path.join(wasmDir, 'ace_dsp_wasm_bg.wasm'));

describe('WASM DSP Pipeline — TypeScript API', () => {
  it('isWasmAudioSupported returns boolean in Node', () => {
    const result = isWasmAudioSupported();
    expect(typeof result).toBe('boolean');
    expect(result).toBe(false); // No AudioWorkletNode in Node
  });

  it('hasWasmImplementation reports correct types', () => {
    expect(hasWasmImplementation('compressor')).toBe(true);
    expect(hasWasmImplementation('parametricEq')).toBe(true);
    expect(hasWasmImplementation('reverb')).toBe(true);
    expect(hasWasmImplementation('chorus')).toBe(true);
    expect(hasWasmImplementation('distortion')).toBe(true);
    expect(hasWasmImplementation('limiter')).toBe(true);
    expect(hasWasmImplementation('eq3')).toBe(false);
    expect(hasWasmImplementation('convolver')).toBe(false);
  });

  it('reports not ready before initialization', () => {
    expect(isWasmDspReady()).toBe(false);
    expect(getWasmDspStatus().registered).toBe(false);
  });
});

describe.skipIf(!wasmBuilt)('WASM DSP Pipeline — Build Artifacts', () => {
  it('WASM binary exists and is reasonably sized', () => {
    const wasmPath = path.join(wasmDir, 'ace_dsp_wasm_bg.wasm');
    const stats = fs.statSync(wasmPath);
    expect(stats.size).toBeLessThan(500 * 1024);
    expect(stats.size).toBeGreaterThan(100);
  });

  it('JS glue exports all effect symbols', () => {
    const content = fs.readFileSync(path.join(wasmDir, 'ace_dsp_wasm.js'), 'utf-8');

    // Phase 0: primitives
    expect(content).toContain('add');
    expect(content).toContain('dsp_version');
    expect(content).toContain('WasmBiquadStereo');
    expect(content).toContain('WasmFeedbackDelay');

    // Phase 1: core effects
    expect(content).toContain('WasmCompressor');
    expect(content).toContain('WasmGate');
    expect(content).toContain('WasmParametricEQ');
    expect(content).toContain('WasmReverb');

    // Phase 2: modulation + character
    expect(content).toContain('WasmChorus');
    expect(content).toContain('WasmFlanger');
    expect(content).toContain('WasmPhaser');
    expect(content).toContain('WasmDistortion');
    expect(content).toContain('WasmLimiter');
    expect(content).toContain('WasmLufsMeter');

    // Phase 3: time-stretch
    expect(content).toContain('WasmPhaseVocoder');
    expect(content).toContain('WasmWsola');
  });

  it('TypeScript declarations are generated', () => {
    const content = fs.readFileSync(path.join(wasmDir, 'ace_dsp_wasm.d.ts'), 'utf-8');
    expect(content).toContain('export function add');
    expect(content).toContain('WasmCompressor');
    expect(content).toContain('WasmParametricEQ');
    expect(content).toContain('WasmPhaseVocoder');
    expect(content).toContain('magnitude_response');
    expect(content).toContain('gain_reduction_db');
  });
});
