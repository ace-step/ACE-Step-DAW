/**
 * Stub for @kabelsalat/web — Strudel's optional modular synth engine.
 * ACE-Step DAW doesn't use kabelsalat synths; we use Strudel for pattern
 * evaluation (queryArc) and our own audio engine for playback.
 *
 * This stub prevents the broken SalatRepl import from crashing @strudel/core.
 */

// Minimal SalatRepl stub — constructor does nothing, methods are no-ops
export class SalatRepl {
  constructor(_options?: Record<string, unknown>) {}
  evaluate(_code: string) { return {}; }
  stop() {}
}

// Re-export everything else as empty to satisfy any other imports
export function exportModule() {}
