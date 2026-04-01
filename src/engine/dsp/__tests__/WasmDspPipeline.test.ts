/**
 * WASM DSP Pipeline smoke tests.
 *
 * These tests verify the build artifacts exist and the TypeScript
 * types are correct. Full AudioWorklet integration tests require
 * a browser environment (covered by E2E tests).
 */
import { describe, it, expect } from 'vitest';
import { isWasmAudioSupported } from '../WasmEffectNode';
import * as fs from 'fs';
import * as path from 'path';

describe('WASM DSP Pipeline', () => {
  const wasmDir = path.resolve(__dirname, '../../../../public/wasm');

  it('WASM binary exists', () => {
    const wasmPath = path.join(wasmDir, 'ace_dsp_wasm_bg.wasm');
    expect(fs.existsSync(wasmPath)).toBe(true);
  });

  it('WASM JS glue exists', () => {
    const jsPath = path.join(wasmDir, 'ace_dsp_wasm.js');
    expect(fs.existsSync(jsPath)).toBe(true);
  });

  it('WASM binary is reasonably sized (<500KB)', () => {
    const wasmPath = path.join(wasmDir, 'ace_dsp_wasm_bg.wasm');
    const stats = fs.statSync(wasmPath);
    expect(stats.size).toBeLessThan(500 * 1024);
    expect(stats.size).toBeGreaterThan(100); // sanity: not empty
  });

  it('WASM JS glue exports Phase 0 symbols', () => {
    const jsPath = path.join(wasmDir, 'ace_dsp_wasm.js');
    const content = fs.readFileSync(jsPath, 'utf-8');

    expect(content).toContain('add');
    expect(content).toContain('dsp_version');
    expect(content).toContain('WasmBiquadStereo');
    expect(content).toContain('WasmFeedbackDelay');
  });

  it('WASM JS glue exports Phase 1 symbols (compressor, EQ, reverb)', () => {
    const jsPath = path.join(wasmDir, 'ace_dsp_wasm.js');
    const content = fs.readFileSync(jsPath, 'utf-8');

    expect(content).toContain('WasmCompressor');
    expect(content).toContain('WasmGate');
    expect(content).toContain('WasmParametricEQ');
    expect(content).toContain('WasmReverb');
  });

  it('WASM JS glue exports Phase 2 symbols (modulation, distortion, limiter)', () => {
    const jsPath = path.join(wasmDir, 'ace_dsp_wasm.js');
    const content = fs.readFileSync(jsPath, 'utf-8');

    expect(content).toContain('WasmChorus');
    expect(content).toContain('WasmFlanger');
    expect(content).toContain('WasmPhaser');
    expect(content).toContain('WasmDistortion');
    expect(content).toContain('WasmLimiter');
    expect(content).toContain('WasmLufsMeter');
  });

  it('WASM JS glue exports Phase 3 symbols (time-stretch)', () => {
    const jsPath = path.join(wasmDir, 'ace_dsp_wasm.js');
    const content = fs.readFileSync(jsPath, 'utf-8');

    expect(content).toContain('WasmPhaseVocoder');
    expect(content).toContain('WasmWsola');
  });

  it('TypeScript types are exported for all modules', () => {
    const dtsPath = path.join(wasmDir, 'ace_dsp_wasm.d.ts');
    expect(fs.existsSync(dtsPath)).toBe(true);
    const content = fs.readFileSync(dtsPath, 'utf-8');

    // Phase 0
    expect(content).toContain('export function add');
    expect(content).toContain('export function dsp_version');
    expect(content).toContain('WasmBiquadStereo');
    expect(content).toContain('WasmFeedbackDelay');

    // Phase 1
    expect(content).toContain('WasmCompressor');
    expect(content).toContain('WasmGate');
    expect(content).toContain('WasmParametricEQ');
    expect(content).toContain('WasmReverb');
    expect(content).toContain('gain_reduction_db');
    expect(content).toContain('magnitude_response');
  });

  it('isWasmAudioSupported returns boolean in Node', () => {
    // In Node.js (test env), AudioWorkletNode doesn't exist
    const result = isWasmAudioSupported();
    expect(typeof result).toBe('boolean');
    // In Node, this should be false since there's no AudioWorkletNode
    expect(result).toBe(false);
  });
});
