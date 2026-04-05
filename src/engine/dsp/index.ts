/**
 * ACE DSP — Audio effects engine abstraction.
 *
 * Public API for:
 * - DSP Provider interfaces (backend-agnostic)
 * - Tone.js adapter (current default backend)
 * - WASM DSP integration (optional GPU-accelerated path)
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

export { ToneDSPFactory, getDSPFactory, setDSPFactory } from './ToneAdapter';

// Native Web Audio factory (Phase 3 — Tone.js-free effects)
export { NativeDSPFactory } from './NativeAdapter';

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
