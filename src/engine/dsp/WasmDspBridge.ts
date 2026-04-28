/**
 * WasmDspBridge — Bridge between EffectsEngine and Rust WASM DSP.
 *
 * Provides a clean interface for the EffectsEngine to optionally route
 * audio processing through the Rust WASM engine instead of Tone.js.
 *
 * Migration strategy: per-effect opt-in via `useWasmDsp` flag.
 * When enabled, audio is processed by Rust WASM in an AudioWorklet.
 * When disabled (default), existing Tone.js code path is used.
 *
 * This module handles:
 * - WASM module loading and caching
 * - AudioWorklet registration
 * - Effect creation with correct parameter mapping
 * - Metering data bridge
 */

import {
  WasmEffectNode,
  registerWasmProcessor,
  isWasmAudioSupported,
  type WasmMeterData,
} from './WasmEffectNode';
import { createDebugLogger } from '../../utils/debugLogger';

const logger = createDebugLogger('ace-step:wasm-dsp-bridge');

/** Supported WASM effect types — complete DSP suite */
export type WasmEffectType =
  | 'compressor'
  | 'gate'
  | 'parametricEq'
  | 'reverb'
  | 'delay'
  | 'biquad'
  | 'chorus'
  | 'flanger'
  | 'phaser'
  | 'distortion'
  | 'limiter';

/** Check if a given effect type has a WASM implementation available */
export function hasWasmImplementation(effectType: string): boolean {
  const supported: Set<string> = new Set([
    'compressor',
    'gate',
    'parametricEq',
    'reverb',
    'delay',
    'biquad',
    'chorus',
    'flanger',
    'phaser',
    'distortion',
    'limiter',
  ]);
  return supported.has(effectType);
}

/** Global state for the WASM DSP bridge */
let _wasmRegistered = false;
let _wasmSupported: boolean | null = null;

/**
 * Initialize the WASM DSP bridge for a given AudioContext.
 * Must be called once before creating any WASM effects.
 * Safe to call multiple times (idempotent).
 */
export async function initWasmDsp(ctx: AudioContext): Promise<boolean> {
  if (_wasmSupported === null) {
    _wasmSupported = isWasmAudioSupported();
  }

  if (!_wasmSupported) {
    logger.error('WASM AudioWorklet not supported in this browser');
    return false;
  }

  if (_wasmRegistered) {
    return true;
  }

  try {
    await registerWasmProcessor(ctx);
    _wasmRegistered = true;
    logger.info('WASM effect processor registered');
    return true;
  } catch (err) {
    logger.error('Failed to register WASM processor:', err);
    _wasmSupported = false;
    return false;
  }
}

/**
 * Create a WASM-powered effect node.
 *
 * Returns null if WASM is not available (caller should fall back to Tone.js).
 */
export function createWasmEffect(
  ctx: AudioContext,
  effectType: WasmEffectType,
  params: Record<string, number> = {}
): WasmEffectNode | null {
  if (!_wasmRegistered || !_wasmSupported) {
    return null;
  }

  try {
    return new WasmEffectNode(ctx, effectType, params);
  } catch (err) {
    logger.error(`Failed to create WASM ${effectType}:`, err);
    return null;
  }
}

/**
 * Check if the WASM DSP engine is ready to use.
 */
export function isWasmDspReady(): boolean {
  return _wasmRegistered && _wasmSupported === true;
}

/**
 * Get the WASM support status.
 */
export function getWasmDspStatus(): {
  supported: boolean;
  registered: boolean;
} {
  return {
    supported: _wasmSupported ?? false,
    registered: _wasmRegistered,
  };
}
