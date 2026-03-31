/* tslint:disable */
/* eslint-disable */

/**
 * WASM-exported DSP processor that handles a chain of effects for one track.
 *
 * Designed to be instantiated once per AudioWorkletNode and called from
 * the worklet's `process()` method on every audio render quantum (128 frames).
 */
export class DspProcessor {
    free(): void;
    [Symbol.dispose](): void;
    /**
     * Disable the delay.
     */
    disable_delay(): void;
    /**
     * Disable the filter.
     */
    disable_filter(): void;
    /**
     * Get the current gain value.
     */
    get_gain(): number;
    /**
     * Create a new DSP processor.
     */
    constructor(sample_rate: number);
    /**
     * Process a mono audio buffer in-place.
     * Called from the AudioWorklet's process() method.
     * Signal chain: Filter → Delay → Gain
     */
    process_mono(buffer: Float32Array): void;
    /**
     * Process interleaved stereo audio buffer in-place.
     * Samples arranged as [L, R, L, R, ...].
     */
    process_stereo_interleaved(buffer: Float32Array): void;
    /**
     * Reset all processor state (call on seek or transport stop).
     */
    reset(): void;
    /**
     * Enable a delay effect.
     * - `delay_ms`: delay time in milliseconds
     * - `feedback`: feedback amount (0.0 to 0.99)
     * - `wet`: wet mix level (0.0 to 1.0)
     */
    set_delay(delay_ms: number, feedback: number, wet: number): void;
    /**
     * Update delay parameters without recreating.
     */
    set_delay_params(delay_ms: number, feedback: number, wet: number, dry: number): void;
    /**
     * Enable a biquad filter with the given parameters.
     * filter_type: 0=LP, 1=HP, 2=BP, 3=Notch, 4=Allpass, 5=Peaking, 6=LowShelf, 7=HighShelf
     */
    set_filter(filter_type: number, frequency: number, q: number, gain_db: number): void;
    /**
     * Set gain value (linear, 0.0 to ~2.0).
     */
    set_gain(gain: number): void;
}

/**
 * Version string for debugging.
 */
export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_dspprocessor_free: (a: number, b: number) => void;
    readonly dspprocessor_disable_delay: (a: number) => void;
    readonly dspprocessor_disable_filter: (a: number) => void;
    readonly dspprocessor_get_gain: (a: number) => number;
    readonly dspprocessor_new: (a: number) => number;
    readonly dspprocessor_process_mono: (a: number, b: number, c: number, d: number) => void;
    readonly dspprocessor_reset: (a: number) => void;
    readonly dspprocessor_set_delay: (a: number, b: number, c: number, d: number) => void;
    readonly dspprocessor_set_delay_params: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly dspprocessor_set_filter: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly dspprocessor_set_gain: (a: number, b: number) => void;
    readonly version: (a: number) => void;
    readonly dspprocessor_process_stereo_interleaved: (a: number, b: number, c: number, d: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
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
