/**
 * ACE DSP — Rust WASM audio effects engine.
 *
 * Public API for integrating WASM DSP effects into the DAW.
 */

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
