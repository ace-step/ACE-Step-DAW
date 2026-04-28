/**
 * ACE DSP — Audio effects engine abstraction.
 *
 * Public API for:
 * - DSP Provider interfaces (backend-agnostic)
 * - Tone.js adapter (legacy default backend)
 * - Native Web Audio factory (Tone.js-free replacement)
 * - Core DSP library (zero-dependency AudioWorklet-safe primitives)
 * - WASM DSP integration (optional GPU-accelerated path)
 *
 * Migration path (Phases 0-6 of #1118):
 *   1. Import { NativeDSPFactory, setDSPFactory } from './dsp'
 *   2. Call setDSPFactory(new NativeDSPFactory(audioContext))
 *   3. All engine code automatically uses native nodes
 */

// DSP Provider abstraction layer (Phase 0)
export type {
  IDSPNode,
  IDSPGain,
  IDSPFilter,
  IDSPCompressor,
  IDSPReverb,
  IDSPDelay,
  IDSPDistortion,
  IDSPChorus,
  IDSPPhaser,
  IDSPEQ3,
  IDSPConvolver,
  IDSPLFO,
  IDSPPanner,
  IDSPPolySynth,
  IDSPFMSynth,
  IDSPMembraneSynth,
  IDSPNoiseSynth,
  IDSPMetalSynth,
  IDSPSynth,
  IDSPFrequencyEnvelope,
  IDSPBufferSource,
  IDSPFactory,
} from './interfaces';

// Factory management (the `ToneAdapter` filename is historical —
// Phase 5P, the Tone-backed factory is gone).
export { getDSPFactory, setDSPFactory } from './ToneAdapter';

// Native Web Audio factory — Tone.js-free (Phases 3+4)
export { NativeDSPFactory } from './NativeAdapter';

// Native synth implementations (Phase 4)
export {
  NativePolySynth,
  NativeFMSynth,
  NativeMembraneSynth,
  NativeNoiseSynth,
  NativeMetalSynth,
  NativeSynth,
  NativeFrequencyEnvelope,
  NativeBufferSource,
} from './NativeSynths';

// Migration helper (Phase 6)
export {
  configureNativeDsp,
  revertToToneDsp,
  isNativeDsp,
} from './configureNativeDsp';

// AudioWorklet infrastructure (Phase 1)
export { RingBuffer, nextPowerOf2 } from './RingBuffer';
export { ParamBuffer } from './ParamBuffer';

// WASM DSP (optional acceleration path)
export {
  WasmEffectNode,
  isWasmAudioSupported,
  registerWasmProcessor,
  type WasmMeterData,
  type MeterCallback,
} from './WasmEffectNode';

export {
  initWasmDsp,
  createWasmEffect,
  hasWasmImplementation,
  isWasmDspReady,
  getWasmDspStatus,
  type WasmEffectType,
} from './WasmDspBridge';
