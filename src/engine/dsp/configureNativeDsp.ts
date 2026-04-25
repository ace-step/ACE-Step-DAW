/**
 * Convenience helper to switch the DSP backend to the native
 * Web Audio implementation. Call once at app startup with the
 * live AudioContext.
 *
 * Phase 5P: Tone.js is gone — `revertToToneDsp` is now a no-op,
 * kept around only so external callers don't have to be updated
 * in lockstep.
 */

import { NativeDSPFactory } from './NativeAdapter';
import { setDSPFactory } from './ToneAdapter';

/**
 * Install the native DSP factory bound to the given AudioContext.
 */
export function configureNativeDsp(ctx: AudioContext): NativeDSPFactory {
  const factory = new NativeDSPFactory(ctx);
  setDSPFactory(factory);
  return factory;
}

/** @deprecated Tone.js backend no longer exists — this is a no-op. */
export function revertToToneDsp(): void {
  // no-op
}

/** @deprecated Only a native factory remains — always true. */
export function isNativeDsp(): boolean {
  return true;
}
