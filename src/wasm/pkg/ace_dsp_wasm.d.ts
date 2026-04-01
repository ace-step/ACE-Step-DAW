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
     * Get current compressor gain reduction in dB.
     */
    compressor_gr_db(): number;
    /**
     * Disable auto-pan.
     */
    disable_autopan(): void;
    /**
     * Disable the chorus/flanger.
     */
    disable_chorus(): void;
    /**
     * Disable the compressor.
     */
    disable_compressor(): void;
    /**
     * Disable the DC blocker.
     */
    disable_dc_blocker(): void;
    /**
     * Disable the delay.
     */
    disable_delay(): void;
    /**
     * Disable the distortion.
     */
    disable_distortion(): void;
    /**
     * Disable the parametric EQ entirely.
     */
    disable_eq(): void;
    /**
     * Disable the filter.
     */
    disable_filter(): void;
    /**
     * Disable the noise gate.
     */
    disable_gate(): void;
    /**
     * Disable the limiter.
     */
    disable_limiter(): void;
    /**
     * Disable the phaser.
     */
    disable_phaser(): void;
    /**
     * Disable the reverb.
     */
    disable_reverb(): void;
    /**
     * Disable the ring modulator.
     */
    disable_ringmod(): void;
    /**
     * Disable the stereo imager.
     */
    disable_stereo_imager(): void;
    /**
     * Disable the tremolo.
     */
    disable_tremolo(): void;
    /**
     * Get the current gain value.
     */
    get_gain(): number;
    /**
     * Get current limiter gain reduction in dB.
     */
    limiter_gr_db(): number;
    /**
     * Create a new DSP processor.
     */
    constructor(sample_rate: number);
    /**
     * Process a mono audio buffer in-place.
     * Called from the AudioWorklet's process() method.
     * Signal chain: Gate → Filter → EQ → Distortion → Compressor → Chorus → Phaser → Delay → Reverb → Gain
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
     * Enable auto-pan.
     * - `rate_hz`: LFO rate (0.05–20 Hz)
     * - `depth`: panning depth (0.0–1.0)
     * - `shape`: 0=Sine, 1=Triangle
     */
    set_autopan(rate_hz: number, depth: number, shape: number): void;
    /**
     * Enable chorus/flanger effect.
     * - `rate_hz`: LFO rate (0.1–10 Hz)
     * - `depth_ms`: modulation depth in ms
     * - `delay_ms`: base delay time in ms
     * - `feedback`: feedback (0.0–0.95, >0 for flanger)
     * - `wet`: wet level (0.0–1.0)
     * - `dry`: dry level (0.0–1.0)
     */
    set_chorus(rate_hz: number, depth_ms: number, delay_ms: number, feedback: number, wet: number, dry: number): void;
    /**
     * Enable compressor.
     * - `threshold_db`: compression threshold (e.g., -20)
     * - `ratio`: compression ratio (e.g., 4.0 for 4:1)
     * - `attack_ms`: attack time in ms
     * - `release_ms`: release time in ms
     * - `knee_db`: knee width (0 = hard knee)
     * - `makeup_db`: makeup gain in dB
     */
    set_compressor(threshold_db: number, ratio: number, attack_ms: number, release_ms: number, knee_db: number, makeup_db: number): void;
    /**
     * Enable DC blocker.
     * - `cutoff_hz`: highpass cutoff (typically 3–10 Hz)
     */
    set_dc_blocker(cutoff_hz: number): void;
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
     * Enable distortion/waveshaper.
     * - `dist_type`: 0=HardClip, 1=SoftClip, 2=Overdrive, 3=Fuzz, 4=Bitcrush
     * - `drive`: input gain (1.0–100.0)
     * - `mix`: wet/dry (0.0–1.0)
     * - `output_gain`: post level (0.0–2.0)
     * - `bit_depth`: for Bitcrush mode (1.0–16.0)
     */
    set_distortion(dist_type: number, drive: number, mix: number, output_gain: number, bit_depth: number): void;
    /**
     * Set a parametric EQ band.
     * - `band_index`: 0-7
     * - `filter_type`: 0=LP, 1=HP, 2=BP, 3=Notch, 4=Allpass, 5=Peaking, 6=LowShelf, 7=HighShelf
     * - `frequency`: center frequency in Hz
     * - `q`: Q factor
     * - `gain_db`: gain in dB (for peaking/shelf types)
     * - `enabled`: whether this band is active
     */
    set_eq_band(band_index: number, filter_type: number, frequency: number, q: number, gain_db: number, enabled: boolean): void;
    /**
     * Enable a biquad filter with the given parameters.
     * filter_type: 0=LP, 1=HP, 2=BP, 3=Notch, 4=Allpass, 5=Peaking, 6=LowShelf, 7=HighShelf
     */
    set_filter(filter_type: number, frequency: number, q: number, gain_db: number): void;
    /**
     * Set gain value (linear, 0.0 to ~2.0).
     */
    set_gain(gain: number): void;
    /**
     * Enable noise gate.
     * - `threshold_db`: gate threshold
     * - `attack_ms`: gate open time
     * - `hold_ms`: hold time after signal drops
     * - `release_ms`: gate close time
     * - `range_db`: attenuation when closed (-80 = full gate, -12 = expander)
     */
    set_gate(threshold_db: number, attack_ms: number, hold_ms: number, release_ms: number, range_db: number): void;
    /**
     * Enable limiter.
     * - `ceiling_db`: max output level (≤ 0.0 dB)
     * - `release_ms`: gain recovery time
     * - `lookahead_ms`: anticipation window (1–10ms)
     */
    set_limiter(ceiling_db: number, release_ms: number, lookahead_ms: number): void;
    /**
     * Enable phaser.
     * - `rate_hz`: LFO rate (0.05–10 Hz)
     * - `depth`: modulation depth (0.0–1.0)
     * - `feedback`: resonance (0.0–0.95)
     * - `stages`: allpass stages (2–12, even)
     * - `mix`: wet/dry (0.0–1.0)
     */
    set_phaser(rate_hz: number, depth: number, feedback: number, stages: number, mix: number): void;
    /**
     * Enable reverb effect.
     * - `room_size`: 0.0 (small) to 1.0 (large)
     * - `damping`: 0.0 (bright) to 1.0 (dark)
     * - `wet`: wet signal level (0.0–1.0)
     * - `dry`: dry signal level (0.0–1.0)
     */
    set_reverb(room_size: number, damping: number, wet: number, dry: number): void;
    /**
     * Enable ring modulator.
     * - `freq_hz`: carrier frequency (1–5000 Hz)
     * - `mix`: wet/dry (0.0–1.0)
     * - `shape`: 0=Sine, 1=Square, 2=Saw
     */
    set_ringmod(freq_hz: number, mix: number, shape: number): void;
    /**
     * Set stereo imager width.
     * - `width`: 0.0 (mono) to 2.0 (extra wide), 1.0 = unchanged
     */
    set_stereo_width(width: number): void;
    /**
     * Enable tremolo.
     * - `rate_hz`: LFO rate (0.1–20 Hz)
     * - `depth`: modulation depth (0.0–1.0)
     * - `shape`: 0=Sine, 1=Triangle, 2=Square
     */
    set_tremolo(rate_hz: number, depth: number, shape: number): void;
}

/**
 * Allocate a f32 buffer in WASM linear memory.
 * Returns a pointer the caller can write into and pass to `process_mono`.
 * This is a stable, named replacement for the internal `__wbindgen_export` symbol.
 */
export function alloc_f32_buffer(len: number): number;

/**
 * Free a buffer previously allocated by `alloc_f32_buffer`.
 *
 * # Safety
 * `len` must be the exact value that was passed to `alloc_f32_buffer`.
 * Passing a different `len` is undefined behavior.
 */
export function free_f32_buffer(ptr: number, len: number): void;

/**
 * Version string for debugging.
 */
export function version(): string;

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_dspprocessor_free: (a: number, b: number) => void;
    readonly alloc_f32_buffer: (a: number) => number;
    readonly dspprocessor_compressor_gr_db: (a: number) => number;
    readonly dspprocessor_disable_autopan: (a: number) => void;
    readonly dspprocessor_disable_chorus: (a: number) => void;
    readonly dspprocessor_disable_compressor: (a: number) => void;
    readonly dspprocessor_disable_dc_blocker: (a: number) => void;
    readonly dspprocessor_disable_delay: (a: number) => void;
    readonly dspprocessor_disable_distortion: (a: number) => void;
    readonly dspprocessor_disable_eq: (a: number) => void;
    readonly dspprocessor_disable_filter: (a: number) => void;
    readonly dspprocessor_disable_gate: (a: number) => void;
    readonly dspprocessor_disable_limiter: (a: number) => void;
    readonly dspprocessor_disable_phaser: (a: number) => void;
    readonly dspprocessor_disable_reverb: (a: number) => void;
    readonly dspprocessor_disable_ringmod: (a: number) => void;
    readonly dspprocessor_disable_stereo_imager: (a: number) => void;
    readonly dspprocessor_disable_tremolo: (a: number) => void;
    readonly dspprocessor_get_gain: (a: number) => number;
    readonly dspprocessor_limiter_gr_db: (a: number) => number;
    readonly dspprocessor_new: (a: number) => number;
    readonly dspprocessor_process_mono: (a: number, b: number, c: number, d: number) => void;
    readonly dspprocessor_process_stereo_interleaved: (a: number, b: number, c: number, d: number) => void;
    readonly dspprocessor_reset: (a: number) => void;
    readonly dspprocessor_set_autopan: (a: number, b: number, c: number, d: number) => void;
    readonly dspprocessor_set_chorus: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly dspprocessor_set_compressor: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly dspprocessor_set_dc_blocker: (a: number, b: number) => void;
    readonly dspprocessor_set_delay: (a: number, b: number, c: number, d: number) => void;
    readonly dspprocessor_set_delay_params: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly dspprocessor_set_distortion: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly dspprocessor_set_eq_band: (a: number, b: number, c: number, d: number, e: number, f: number, g: number) => void;
    readonly dspprocessor_set_filter: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly dspprocessor_set_gain: (a: number, b: number) => void;
    readonly dspprocessor_set_gate: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly dspprocessor_set_limiter: (a: number, b: number, c: number, d: number) => void;
    readonly dspprocessor_set_phaser: (a: number, b: number, c: number, d: number, e: number, f: number) => void;
    readonly dspprocessor_set_reverb: (a: number, b: number, c: number, d: number, e: number) => void;
    readonly dspprocessor_set_ringmod: (a: number, b: number, c: number, d: number) => void;
    readonly dspprocessor_set_stereo_width: (a: number, b: number) => void;
    readonly dspprocessor_set_tremolo: (a: number, b: number, c: number, d: number) => void;
    readonly free_f32_buffer: (a: number, b: number) => void;
    readonly version: (a: number) => void;
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
