/* @ts-self-types="./ace_dsp_wasm.d.ts" */

/**
 * WASM-exported DSP processor that handles a chain of effects for one track.
 *
 * Designed to be instantiated once per AudioWorkletNode and called from
 * the worklet's `process()` method on every audio render quantum (128 frames).
 */
export class DspProcessor {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        DspProcessorFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_dspprocessor_free(ptr, 0);
    }
    /**
     * Get current compressor gain reduction in dB.
     * @returns {number}
     */
    compressor_gr_db() {
        const ret = wasm.dspprocessor_compressor_gr_db(this.__wbg_ptr);
        return ret;
    }
    /**
     * Disable the chorus/flanger.
     */
    disable_chorus() {
        wasm.dspprocessor_disable_chorus(this.__wbg_ptr);
    }
    /**
     * Disable the compressor.
     */
    disable_compressor() {
        wasm.dspprocessor_disable_compressor(this.__wbg_ptr);
    }
    /**
     * Disable the delay.
     */
    disable_delay() {
        wasm.dspprocessor_disable_delay(this.__wbg_ptr);
    }
    /**
     * Disable the parametric EQ entirely.
     */
    disable_eq() {
        wasm.dspprocessor_disable_eq(this.__wbg_ptr);
    }
    /**
     * Disable the filter.
     */
    disable_filter() {
        wasm.dspprocessor_disable_filter(this.__wbg_ptr);
    }
    /**
     * Disable the noise gate.
     */
    disable_gate() {
        wasm.dspprocessor_disable_gate(this.__wbg_ptr);
    }
    /**
     * Disable the reverb.
     */
    disable_reverb() {
        wasm.dspprocessor_disable_reverb(this.__wbg_ptr);
    }
    /**
     * Get the current gain value.
     * @returns {number}
     */
    get_gain() {
        const ret = wasm.dspprocessor_get_gain(this.__wbg_ptr);
        return ret;
    }
    /**
     * Create a new DSP processor.
     * @param {number} sample_rate
     */
    constructor(sample_rate) {
        const ret = wasm.dspprocessor_new(sample_rate);
        this.__wbg_ptr = ret >>> 0;
        DspProcessorFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    /**
     * Process a mono audio buffer in-place.
     * Called from the AudioWorklet's process() method.
     * Signal chain: Gate → Filter → EQ → Compressor → Chorus → Delay → Reverb → Gain
     * @param {Float32Array} buffer
     */
    process_mono(buffer) {
        var ptr0 = passArrayF32ToWasm0(buffer, wasm.__wbindgen_export);
        var len0 = WASM_VECTOR_LEN;
        wasm.dspprocessor_process_mono(this.__wbg_ptr, ptr0, len0, addHeapObject(buffer));
    }
    /**
     * Process interleaved stereo audio buffer in-place.
     * Samples arranged as [L, R, L, R, ...].
     * @param {Float32Array} buffer
     */
    process_stereo_interleaved(buffer) {
        var ptr0 = passArrayF32ToWasm0(buffer, wasm.__wbindgen_export);
        var len0 = WASM_VECTOR_LEN;
        wasm.dspprocessor_process_stereo_interleaved(this.__wbg_ptr, ptr0, len0, addHeapObject(buffer));
    }
    /**
     * Reset all processor state (call on seek or transport stop).
     */
    reset() {
        wasm.dspprocessor_reset(this.__wbg_ptr);
    }
    /**
     * Enable chorus/flanger effect.
     * - `rate_hz`: LFO rate (0.1–10 Hz)
     * - `depth_ms`: modulation depth in ms
     * - `delay_ms`: base delay time in ms
     * - `feedback`: feedback (0.0–0.95, >0 for flanger)
     * - `wet`: wet level (0.0–1.0)
     * - `dry`: dry level (0.0–1.0)
     * @param {number} rate_hz
     * @param {number} depth_ms
     * @param {number} delay_ms
     * @param {number} feedback
     * @param {number} wet
     * @param {number} dry
     */
    set_chorus(rate_hz, depth_ms, delay_ms, feedback, wet, dry) {
        wasm.dspprocessor_set_chorus(this.__wbg_ptr, rate_hz, depth_ms, delay_ms, feedback, wet, dry);
    }
    /**
     * Enable compressor.
     * - `threshold_db`: compression threshold (e.g., -20)
     * - `ratio`: compression ratio (e.g., 4.0 for 4:1)
     * - `attack_ms`: attack time in ms
     * - `release_ms`: release time in ms
     * - `knee_db`: knee width (0 = hard knee)
     * - `makeup_db`: makeup gain in dB
     * @param {number} threshold_db
     * @param {number} ratio
     * @param {number} attack_ms
     * @param {number} release_ms
     * @param {number} knee_db
     * @param {number} makeup_db
     */
    set_compressor(threshold_db, ratio, attack_ms, release_ms, knee_db, makeup_db) {
        wasm.dspprocessor_set_compressor(this.__wbg_ptr, threshold_db, ratio, attack_ms, release_ms, knee_db, makeup_db);
    }
    /**
     * Enable a delay effect.
     * - `delay_ms`: delay time in milliseconds
     * - `feedback`: feedback amount (0.0 to 0.99)
     * - `wet`: wet mix level (0.0 to 1.0)
     * @param {number} delay_ms
     * @param {number} feedback
     * @param {number} wet
     */
    set_delay(delay_ms, feedback, wet) {
        wasm.dspprocessor_set_delay(this.__wbg_ptr, delay_ms, feedback, wet);
    }
    /**
     * Update delay parameters without recreating.
     * @param {number} delay_ms
     * @param {number} feedback
     * @param {number} wet
     * @param {number} dry
     */
    set_delay_params(delay_ms, feedback, wet, dry) {
        wasm.dspprocessor_set_delay_params(this.__wbg_ptr, delay_ms, feedback, wet, dry);
    }
    /**
     * Set a parametric EQ band.
     * - `band_index`: 0-7
     * - `filter_type`: 0=LP, 1=HP, 2=BP, 3=Notch, 4=Allpass, 5=Peaking, 6=LowShelf, 7=HighShelf
     * - `frequency`: center frequency in Hz
     * - `q`: Q factor
     * - `gain_db`: gain in dB (for peaking/shelf types)
     * - `enabled`: whether this band is active
     * @param {number} band_index
     * @param {number} filter_type
     * @param {number} frequency
     * @param {number} q
     * @param {number} gain_db
     * @param {boolean} enabled
     */
    set_eq_band(band_index, filter_type, frequency, q, gain_db, enabled) {
        wasm.dspprocessor_set_eq_band(this.__wbg_ptr, band_index, filter_type, frequency, q, gain_db, enabled);
    }
    /**
     * Enable a biquad filter with the given parameters.
     * filter_type: 0=LP, 1=HP, 2=BP, 3=Notch, 4=Allpass, 5=Peaking, 6=LowShelf, 7=HighShelf
     * @param {number} filter_type
     * @param {number} frequency
     * @param {number} q
     * @param {number} gain_db
     */
    set_filter(filter_type, frequency, q, gain_db) {
        wasm.dspprocessor_set_filter(this.__wbg_ptr, filter_type, frequency, q, gain_db);
    }
    /**
     * Set gain value (linear, 0.0 to ~2.0).
     * @param {number} gain
     */
    set_gain(gain) {
        wasm.dspprocessor_set_gain(this.__wbg_ptr, gain);
    }
    /**
     * Enable noise gate.
     * - `threshold_db`: gate threshold
     * - `attack_ms`: gate open time
     * - `hold_ms`: hold time after signal drops
     * - `release_ms`: gate close time
     * - `range_db`: attenuation when closed (-80 = full gate, -12 = expander)
     * @param {number} threshold_db
     * @param {number} attack_ms
     * @param {number} hold_ms
     * @param {number} release_ms
     * @param {number} range_db
     */
    set_gate(threshold_db, attack_ms, hold_ms, release_ms, range_db) {
        wasm.dspprocessor_set_gate(this.__wbg_ptr, threshold_db, attack_ms, hold_ms, release_ms, range_db);
    }
    /**
     * Enable reverb effect.
     * - `room_size`: 0.0 (small) to 1.0 (large)
     * - `damping`: 0.0 (bright) to 1.0 (dark)
     * - `wet`: wet signal level (0.0–1.0)
     * - `dry`: dry signal level (0.0–1.0)
     * @param {number} room_size
     * @param {number} damping
     * @param {number} wet
     * @param {number} dry
     */
    set_reverb(room_size, damping, wet, dry) {
        wasm.dspprocessor_set_reverb(this.__wbg_ptr, room_size, damping, wet, dry);
    }
}
if (Symbol.dispose) DspProcessor.prototype[Symbol.dispose] = DspProcessor.prototype.free;

/**
 * Version string for debugging.
 * @returns {string}
 */
export function version() {
    let deferred1_0;
    let deferred1_1;
    try {
        const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
        wasm.version(retptr);
        var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
        var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
        deferred1_0 = r0;
        deferred1_1 = r1;
        return getStringFromWasm0(r0, r1);
    } finally {
        wasm.__wbindgen_add_to_stack_pointer(16);
        wasm.__wbindgen_export2(deferred1_0, deferred1_1, 1);
    }
}

function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg___wbindgen_copy_to_typed_array_8b0dfa977e1be59b: function(arg0, arg1, arg2) {
            new Uint8Array(getObject(arg2).buffer, getObject(arg2).byteOffset, getObject(arg2).byteLength).set(getArrayU8FromWasm0(arg0, arg1));
        },
        __wbg___wbindgen_throw_bd5a70920abf0236: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_object_drop_ref: function(arg0) {
            takeObject(arg0);
        },
    };
    return {
        __proto__: null,
        "./ace_dsp_wasm_bg.js": import0,
    };
}

const DspProcessorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_dspprocessor_free(ptr >>> 0, 1));

function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];

    heap[idx] = obj;
    return idx;
}

function dropObject(idx) {
    if (idx < 1028) return;
    heap[idx] = heap_next;
    heap_next = idx;
}

function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
}

let cachedDataViewMemory0 = null;
function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
        cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
}

let cachedFloat32ArrayMemory0 = null;
function getFloat32ArrayMemory0() {
    if (cachedFloat32ArrayMemory0 === null || cachedFloat32ArrayMemory0.byteLength === 0) {
        cachedFloat32ArrayMemory0 = new Float32Array(wasm.memory.buffer);
    }
    return cachedFloat32ArrayMemory0;
}

function getStringFromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return decodeText(ptr, len);
}

let cachedUint8ArrayMemory0 = null;
function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
        cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
}

function getObject(idx) { return heap[idx]; }

let heap = new Array(1024).fill(undefined);
heap.push(undefined, null, true, false);

let heap_next = heap.length;

function passArrayF32ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 4, 4) >>> 0;
    getFloat32ArrayMemory0().set(arg, ptr / 4);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}

function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
}

let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
cachedTextDecoder.decode();
const MAX_SAFARI_DECODE_BYTES = 2146435072;
let numBytesDecoded = 0;
function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= MAX_SAFARI_DECODE_BYTES) {
        cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        cachedTextDecoder.decode();
        numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
}

let WASM_VECTOR_LEN = 0;

let wasmModule, wasm;
function __wbg_finalize_init(instance, module) {
    wasm = instance.exports;
    wasmModule = module;
    cachedDataViewMemory0 = null;
    cachedFloat32ArrayMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    return wasm;
}

async function __wbg_load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);
            } catch (e) {
                const validResponse = module.ok && expectedResponseType(module.type);

                if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else { throw e; }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);
    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };
        } else {
            return instance;
        }
    }

    function expectedResponseType(type) {
        switch (type) {
            case 'basic': case 'cors': case 'default': return true;
        }
        return false;
    }
}

function initSync(module) {
    if (wasm !== undefined) return wasm;


    if (module !== undefined) {
        if (Object.getPrototypeOf(module) === Object.prototype) {
            ({module} = module)
        } else {
            console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
        }
    }

    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
        module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    return __wbg_finalize_init(instance, module);
}

async function __wbg_init(module_or_path) {
    if (wasm !== undefined) return wasm;


    if (module_or_path !== undefined) {
        if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
            ({module_or_path} = module_or_path)
        } else {
            console.warn('using deprecated parameters for the initialization function; pass a single object instead')
        }
    }

    if (module_or_path === undefined) {
        module_or_path = new URL('ace_dsp_wasm_bg.wasm', import.meta.url);
    }
    const imports = __wbg_get_imports();

    if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
        module_or_path = fetch(module_or_path);
    }

    const { instance, module } = await __wbg_load(await module_or_path, imports);

    return __wbg_finalize_init(instance, module);
}

export { initSync, __wbg_init as default };
