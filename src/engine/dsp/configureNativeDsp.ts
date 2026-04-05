/**
 * Convenience helper to switch the DSP backend from Tone.js to native Web Audio.
 *
 * Usage:
 *   import { configureNativeDsp } from './dsp/configureNativeDsp';
 *   configureNativeDsp(audioContext);
 *   // All subsequent getDSPFactory() calls return NativeDSPFactory
 *
 * Part of Phase 6: Remove Tone.js Dependency (#1132).
 */

import { NativeDSPFactory } from './NativeAdapter';
import { setDSPFactory, getDSPFactory } from './ToneAdapter';
import type { IDSPFactory } from './interfaces';

let _previousFactory: IDSPFactory | null = null;

/**
 * Switch the global DSP factory to NativeDSPFactory.
 * Call this once during app initialization, before any engine code runs.
 *
 * @param ctx  The AudioContext to use for creating native Web Audio nodes
 * @returns The new NativeDSPFactory instance
 */
export function configureNativeDsp(ctx: AudioContext): NativeDSPFactory {
  if (_previousFactory === null) {
    _previousFactory = getDSPFactory();
  }
  const factory = new NativeDSPFactory(ctx);
  setDSPFactory(factory);
  return factory;
}

/**
 * Revert to the previous DSP factory (Tone.js).
 * Useful for A/B testing or fallback.
 */
export function revertToToneDsp(): void {
  if (_previousFactory) {
    setDSPFactory(_previousFactory);
    _previousFactory = null;
  }
}

/**
 * Check if the current DSP factory is the native (Tone.js-free) one.
 */
export function isNativeDsp(): boolean {
  return getDSPFactory() instanceof NativeDSPFactory;
}
