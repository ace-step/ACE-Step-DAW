/* tslint:disable */
/* eslint-disable */

/**
 * Compute a mipmap pyramid from stereo audio samples.
 *
 * Accepts left/right channel Float32Arrays and sample rate.
 * Returns the serialized mipmap as a Uint8Array (compact binary format).
 */
export function compute_mipmap_wasm(left: Float32Array, right: Float32Array, sample_rate: number): Uint8Array;

/**
 * Extract legacy peaks in the old stride-4 format for backward compatibility.
 *
 * Returns a flat Float32Array: [Lmax, Lmin, Rmax, Rmin, ...] × num_peaks.
 * Used to populate `Clip.waveformPeaks` for old rendering paths.
 */
export function extract_legacy_peaks_wasm(mipmap_bytes: Uint8Array, num_peaks: number): Float32Array;

/**
 * Query peaks from a serialized mipmap for a given sample range and column count.
 *
 * Returns a flat Float32Array with stride 6 per column:
 * [min_l, max_l, rms_l, min_r, max_r, rms_r, ...]
 *
 * The optimal mipmap level is selected automatically.
 */
export function query_peaks_wasm(mipmap_bytes: Uint8Array, start_sample: number, end_sample: number, num_columns: number): Float32Array;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly compute_mipmap_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly extract_legacy_peaks_wasm: (a: number, b: number, c: number, d: number) => void;
    readonly query_peaks_wasm: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number) => void;
}

export type SyncInitInput = BufferSource | WebAssembly.Module;

/**
 * Instantiates the given `module`, which can either be bytes or
 * a precompiled `WebAssembly.Module`.
 *
 * @param {{ module: SyncInitInput }} module - Passing `SyncInitInput` directly is deprecated.
 *
 * @returns {InitOutput}
 */
export function initSync(module: { module: SyncInitInput } | SyncInitInput): InitOutput;

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
export default function __wbg_init (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
