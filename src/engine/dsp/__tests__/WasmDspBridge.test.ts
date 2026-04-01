import { describe, it, expect } from 'vitest';
import {
  hasWasmImplementation,
  isWasmDspReady,
  getWasmDspStatus,
} from '../WasmDspBridge';

describe('WasmDspBridge', () => {
  it('reports supported WASM effect types', () => {
    expect(hasWasmImplementation('compressor')).toBe(true);
    expect(hasWasmImplementation('gate')).toBe(true);
    expect(hasWasmImplementation('parametricEq')).toBe(true);
    expect(hasWasmImplementation('reverb')).toBe(true);
    expect(hasWasmImplementation('delay')).toBe(true);
    expect(hasWasmImplementation('biquad')).toBe(true);
  });

  it('reports unsupported effect types', () => {
    expect(hasWasmImplementation('eq3')).toBe(false);
    expect(hasWasmImplementation('chorus')).toBe(false);
    expect(hasWasmImplementation('flanger')).toBe(false);
    expect(hasWasmImplementation('phaser')).toBe(false);
    expect(hasWasmImplementation('distortion')).toBe(false);
    expect(hasWasmImplementation('convolver')).toBe(false);
    expect(hasWasmImplementation('unknown')).toBe(false);
  });

  it('reports not ready before initialization', () => {
    expect(isWasmDspReady()).toBe(false);
  });

  it('status reports not supported in Node env', () => {
    const status = getWasmDspStatus();
    expect(status.registered).toBe(false);
    // In Node.js test env, supported may be false (no AudioWorkletNode)
    expect(typeof status.supported).toBe('boolean');
  });
});
