/**
 * DSP factory registry (formerly `ToneAdapter`).
 *
 * Phase 5P: the Tone-backed `ToneDSPFactory` is gone. This module
 * holds the global factory slot + the `set/getDSPFactory` accessors.
 * If no factory is set by the time `getDSPFactory()` is called, we
 * lazy-install a `NativeDSPFactory` backed by a fresh AudioContext
 * — this lets production code and unit tests that never call
 * `configureNativeDsp` still receive a working factory.
 *
 * The file keeps its old name so callers don't need to update imports
 * in lockstep; a future PR can rename it.
 */

import { NativeDSPFactory } from './NativeAdapter';
import type { IDSPFactory } from './interfaces';

let _factory: IDSPFactory | null = null;

/**
 * Lazily materialize a NativeDSPFactory. Production startup overrides
 * this by calling `configureNativeDsp(engine.ctx)` before any engine
 * code runs; this path is primarily for tests that haven't gotten
 * around to initialising the factory explicitly.
 */
function lazyDefault(): IDSPFactory | null {
  const globalAny = globalThis as unknown as { AudioContext?: typeof AudioContext };
  const Ctor = globalAny.AudioContext;
  if (!Ctor) return null;
  try {
    const ctx = new Ctor();
    return new NativeDSPFactory(ctx);
  } catch {
    return null;
  }
}

export function setDSPFactory(factory: IDSPFactory): void {
  _factory = factory;
}

export function getDSPFactory(): IDSPFactory {
  if (_factory) return _factory;
  const lazy = lazyDefault();
  if (lazy) {
    _factory = lazy;
    return lazy;
  }
  throw new Error(
    'DSP factory not initialised. Call `configureNativeDsp(ctx)` during app startup before using DSP nodes.',
  );
}
