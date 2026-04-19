/**
 * DSP factory registry (formerly `ToneAdapter`).
 *
 * Phase 5P: the Tone-backed `ToneDSPFactory` is gone. This module
 * holds the global factory slot + the `set/getDSPFactory` accessors.
 *
 * `getDSPFactory()` fails fast if nothing has been set — in
 * production AudioEngine's constructor installs the factory via
 * `configureNativeDsp(this.ctx)`, so every DSP node shares the
 * engine's single AudioContext. A lazy default would risk creating
 * a second AudioContext (cross-context connect throws, plus the
 * autoplay-policy / leak hazards Copilot called out on #1753).
 *
 * Tests that exercise DSP factory behaviour should either call
 * `configureNativeDsp(mockCtx)` themselves or mock the factory via
 * `setDSPFactory(...)`.
 *
 * The file keeps its old name so callers don't need to update imports
 * in lockstep; a future PR can rename it.
 */

import type { IDSPFactory } from './interfaces';

let _factory: IDSPFactory | null = null;

export function setDSPFactory(factory: IDSPFactory): void {
  _factory = factory;
}

export function getDSPFactory(): IDSPFactory {
  if (_factory) return _factory;
  throw new Error(
    'DSP factory not initialised. Call `configureNativeDsp(ctx)` during app startup before using DSP nodes.',
  );
}
