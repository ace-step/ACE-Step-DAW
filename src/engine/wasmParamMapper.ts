/**
 * wasmParamMapper.ts — Translates TrackEffect parameters to WASM DSP message format.
 *
 * Determines which effect chains are WASM-compatible and maps
 * Tone.js-style params (seconds, strings) to WASM-style params (ms, enums).
 */
import type { TrackEffect } from '../types/project';
import { FilterType } from '../wasm/WasmDspEngine';
import type { WasmDspNode } from '../wasm/WasmDspEngine';

/** Effect types that have a production-ready WASM implementation. */
export const WASM_SUPPORTED_EFFECTS = new Set([
  'compressor',
  'parametricEq',
  'reverb',
  'delay',
  'distortion',
  'filter',
  'chorus',
  'phaser',
  'gate',
  'limiter',
  'stereoImager',
] as const);

type WasmSupportedType = typeof WASM_SUPPORTED_EFFECTS extends Set<infer T> ? T : never;

/**
 * Check if ALL enabled effects in a chain have WASM equivalents.
 * Also rejects sidechain compression (no WASM sidechain support).
 */
export function canUseWasmForChain(effects: TrackEffect[]): boolean {
  for (const effect of effects) {
    if (!effect.enabled) continue;
    if (!WASM_SUPPORTED_EFFECTS.has(effect.type as WasmSupportedType)) return false;
    // Reject sidechain
    if (effect.type === 'compressor') {
      const p = effect.params as { sidechainSourceTrackId?: string };
      if (p.sidechainSourceTrackId) return false;
    }
  }
  return true;
}

/** Distortion type string → WASM int mapping */
const DIST_TYPE_MAP: Record<string, number> = { soft: 0, overdrive: 1, fuzz: 2 };

/** Filter type string → WASM FilterType enum */
const FILTER_TYPE_MAP: Record<string, number> = {
  lowpass: FilterType.Lowpass,
  highpass: FilterType.Highpass,
  bandpass: FilterType.Bandpass,
};

/**
 * Map a single effect's params to a WASM message object.
 * Returns null if the effect type is not WASM-supported.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function mapEffectToWasm(type: string, params: Record<string, any>): Record<string, any> | null {
  switch (type) {
    case 'compressor':
      return {
        type: 'set-compressor',
        threshold: params.threshold,
        ratio: params.ratio,
        attackMs: params.attack * 1000,
        releaseMs: params.release * 1000,
        kneeDb: params.knee,
        makeupDb: 0,
      };

    case 'delay':
      return {
        type: 'set-delay',
        delayMs: params.time * 1000,
        feedback: params.feedback,
        wet: params.wet,
      };

    case 'distortion':
      return {
        type: 'set-distortion',
        distType: DIST_TYPE_MAP[params.distortionType] ?? 0,
        drive: params.amount,
        mix: params.wet,
        outputGain: 0,
        bitDepth: 8,
      };

    case 'filter':
      return {
        type: 'set-filter',
        filterType: FILTER_TYPE_MAP[params.filterType] ?? FilterType.Lowpass,
        frequency: params.frequency,
        q: params.resonance,
        gainDb: 0,
      };

    case 'reverb':
      return {
        type: 'set-reverb',
        roomSize: Math.min(1, params.decay / 10),
        damping: 0.5,
        wet: params.wet,
        dry: 1 - params.wet,
      };

    case 'chorus':
      return {
        type: 'set-chorus',
        rateHz: params.frequency,
        depthMs: params.depth * params.delayTime,
        delayMs: params.delayTime,
        feedback: params.feedback,
        wet: params.wet,
        dry: 1 - params.wet,
      };

    case 'phaser':
      return {
        type: 'set-phaser',
        rateHz: params.frequency,
        depth: params.octaves / 6, // normalize octaves (1-6) to 0-1
        feedback: Math.min(0.95, params.Q / 20), // Q (0-20) → feedback (0-0.95)
        stages: params.stages ?? 4,
        mix: params.wet ?? 0.5,
      };

    case 'gate':
      return {
        type: 'set-gate',
        threshold: params.threshold,
        attackMs: params.attack * 1000,
        holdMs: params.hold * 1000,
        releaseMs: params.release * 1000,
        rangeDb: params.range,
      };

    case 'limiter':
      return {
        type: 'set-limiter',
        ceilingDb: params.ceiling,
        releaseMs: params.release * 1000,
        lookaheadMs: (params.lookahead ?? 0.005) * 1000,
      };

    case 'stereoImager':
      return {
        type: 'set-stereo-width',
        width: params.width,
      };

    case 'parametricEq':
      // ParametricEQ is special — multiple bands
      return {
        type: 'set-parametric-eq',
        bands: params.bands,
      };

    default:
      return null;
  }
}

/** All WASM disable messages keyed by effect type. */
const DISABLE_MESSAGES: Record<string, string> = {
  compressor: 'disable-compressor',
  delay: 'disable-delay',
  distortion: 'disable-distortion',
  filter: 'disable-filter',
  reverb: 'disable-reverb',
  chorus: 'disable-chorus',
  phaser: 'disable-phaser',
  gate: 'disable-gate',
  limiter: 'disable-limiter',
  stereoImager: 'disable-stereo-imager',
  parametricEq: 'disable-eq',
};

/**
 * Apply a full effects chain to a WasmDspNode.
 * Disables all effects first, then enables + configures each active one.
 */
export function applyEffectsToWasmNode(node: WasmDspNode, effects: TrackEffect[]): void {
  // 1. Disable all WASM effects to start clean
  for (const disableType of Object.values(DISABLE_MESSAGES)) {
    node.audioNode.port.postMessage({ type: disableType });
  }

  // 2. Enable + configure each active effect
  for (const effect of effects) {
    if (!effect.enabled) continue;
    const msg = mapEffectToWasm(effect.type, effect.params as unknown as Record<string, unknown>);
    if (msg) {
      node.audioNode.port.postMessage(msg);
    }
  }
}
