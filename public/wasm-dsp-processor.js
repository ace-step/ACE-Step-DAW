/**
 * AudioWorklet processor that loads and runs the Rust WASM DSP engine.
 *
 * This processor is loaded via `audioContext.audioWorklet.addModule()` and
 * receives the WASM binary from the main thread via MessagePort.
 *
 * Architecture:
 *   Main Thread (WasmDspEngine.ts)
 *     → MessagePort → AudioWorklet Thread (this file)
 *       → FFI → ace-dsp-wasm (Rust → WASM)
 *
 * The wasm-bindgen JS glue cannot be imported directly in AudioWorklet scope,
 * so we inline the minimal wasm-bindgen runtime (heap, memory views, imports)
 * needed to instantiate the WASM module and call the DspProcessor API.
 *
 * Message protocol (main → worklet):
 *   { type: 'init', wasmBytes: ArrayBuffer, sampleRate: number }
 *   { type: 'set-gain', value: number }
 *   { type: 'set-filter', filterType: number, frequency: number, q: number, gainDb: number }
 *   { type: 'disable-filter' }
 *   { type: 'reset' }
 *
 * Message protocol (worklet → main):
 *   { type: 'ready' }
 *   { type: 'error', message: string }
 */

// ---------------------------------------------------------------------------
// Minimal wasm-bindgen runtime (inlined for AudioWorklet compatibility)
// ---------------------------------------------------------------------------

let wasm = null;

// Object heap for wasm-bindgen interop (handles JS objects passed to WASM)
const heap = new Array(1024).fill(undefined);
heap.push(undefined, null, true, false);
let heap_next = heap.length;

function addHeapObject(obj) {
  if (heap_next === heap.length) heap.push(heap.length + 1);
  const idx = heap_next;
  heap_next = heap[idx];
  heap[idx] = obj;
  return idx;
}

function getObject(idx) { return heap[idx]; }

function dropObject(idx) {
  if (idx < 1028) return;
  heap[idx] = heap_next;
  heap_next = idx;
}

function takeObject(idx) {
  const ret = getObject(idx);
  dropObject(idx);
  return ret;
}

// Cached typed-array views over WASM memory (invalidated on memory growth)
let cachedUint8ArrayMemory = null;
function getUint8ArrayMemory() {
  if (cachedUint8ArrayMemory === null || cachedUint8ArrayMemory.byteLength === 0) {
    cachedUint8ArrayMemory = new Uint8Array(wasm.memory.buffer);
  }
  return cachedUint8ArrayMemory;
}

let cachedFloat32ArrayMemory = null;
function getFloat32ArrayMemory() {
  if (cachedFloat32ArrayMemory === null || cachedFloat32ArrayMemory.byteLength === 0) {
    cachedFloat32ArrayMemory = new Float32Array(wasm.memory.buffer);
  }
  return cachedFloat32ArrayMemory;
}

function getArrayU8FromWasm(ptr, len) {
  ptr = ptr >>> 0;
  return getUint8ArrayMemory().subarray(ptr, ptr + len);
}

/**
 * Build the import object that wasm-bindgen expects.
 * The WASM binary imports from "./ace_dsp_wasm_bg.js" namespace.
 */
function getWasmImports() {
  return {
    './ace_dsp_wasm_bg.js': {
      // Copy bytes from WASM memory into a JS TypedArray (for process_mono/process_stereo_interleaved)
      __wbg___wbindgen_copy_to_typed_array_8b0dfa977e1be59b: function(arg0, arg1, arg2) {
        new Uint8Array(getObject(arg2).buffer, getObject(arg2).byteOffset, getObject(arg2).byteLength)
          .set(getArrayU8FromWasm(arg0, arg1));
      },
      // Throw an error from WASM
      __wbg___wbindgen_throw_bd5a70920abf0236: function(arg0, arg1) {
        const decoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
        const ptr = arg0 >>> 0;
        const bytes = getUint8ArrayMemory().subarray(ptr, ptr + arg1);
        throw new Error(decoder.decode(bytes));
      },
      // Drop a heap object reference
      __wbindgen_object_drop_ref: function(arg0) {
        takeObject(arg0);
      },
    },
  };
}

// ---------------------------------------------------------------------------
// AudioWorklet Processor
// ---------------------------------------------------------------------------

class WasmDspProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._processorPtr = 0;
    this._ready = false;
    // Pre-allocated WASM buffer pointer for 128 frames (standard render quantum)
    this._bufPtr = 0;
    this._bufLen = 0;

    this.port.onmessage = (event) => this._handleMessage(event.data);
  }

  async _handleMessage(msg) {
    try {
      switch (msg.type) {
        case 'init':
          await this._initWasm(msg.wasmBytes, msg.sampleRate);
          break;
        case 'set-gain':
          if (this._ready) {
            wasm.dspprocessor_set_gain(this._processorPtr, msg.value);
          }
          break;
        case 'set-filter':
          if (this._ready) {
            wasm.dspprocessor_set_filter(
              this._processorPtr,
              msg.filterType,
              msg.frequency,
              msg.q,
              msg.gainDb
            );
          }
          break;
        case 'disable-filter':
          if (this._ready) {
            wasm.dspprocessor_disable_filter(this._processorPtr);
          }
          break;
        case 'set-delay':
          if (this._ready) {
            wasm.dspprocessor_set_delay(
              this._processorPtr,
              msg.delayMs,
              msg.feedback,
              msg.wet
            );
          }
          break;
        case 'set-delay-params':
          if (this._ready) {
            wasm.dspprocessor_set_delay_params(
              this._processorPtr,
              msg.delayMs,
              msg.feedback,
              msg.wet,
              msg.dry
            );
          }
          break;
        case 'disable-delay':
          if (this._ready) {
            wasm.dspprocessor_disable_delay(this._processorPtr);
          }
          break;
        case 'set-compressor':
          if (this._ready) {
            wasm.dspprocessor_set_compressor(
              this._processorPtr,
              msg.thresholdDb,
              msg.ratio,
              msg.attackMs,
              msg.releaseMs,
              msg.kneeDb,
              msg.makeupDb
            );
          }
          break;
        case 'disable-compressor':
          if (this._ready) {
            wasm.dspprocessor_disable_compressor(this._processorPtr);
          }
          break;
        case 'set-gate':
          if (this._ready) {
            wasm.dspprocessor_set_gate(
              this._processorPtr,
              msg.thresholdDb,
              msg.attackMs,
              msg.holdMs,
              msg.releaseMs,
              msg.rangeDb
            );
          }
          break;
        case 'disable-gate':
          if (this._ready) {
            wasm.dspprocessor_disable_gate(this._processorPtr);
          }
          break;
        case 'set-eq-band':
          if (this._ready) {
            wasm.dspprocessor_set_eq_band(
              this._processorPtr,
              msg.bandIndex,
              msg.filterType,
              msg.frequency,
              msg.q,
              msg.gainDb,
              msg.enabled
            );
          }
          break;
        case 'disable-eq':
          if (this._ready) {
            wasm.dspprocessor_disable_eq(this._processorPtr);
          }
          break;
        case 'set-reverb':
          if (this._ready) {
            wasm.dspprocessor_set_reverb(
              this._processorPtr,
              msg.roomSize,
              msg.damping,
              msg.wet,
              msg.dry
            );
          }
          break;
        case 'disable-reverb':
          if (this._ready) {
            wasm.dspprocessor_disable_reverb(this._processorPtr);
          }
          break;
        case 'set-chorus':
          if (this._ready) {
            wasm.dspprocessor_set_chorus(
              this._processorPtr,
              msg.rateHz,
              msg.depthMs,
              msg.delayMs,
              msg.feedback,
              msg.wet,
              msg.dry
            );
          }
          break;
        case 'disable-chorus':
          if (this._ready) {
            wasm.dspprocessor_disable_chorus(this._processorPtr);
          }
          break;
        case 'set-distortion':
          if (this._ready) {
            wasm.dspprocessor_set_distortion(
              this._processorPtr,
              msg.distType,
              msg.drive,
              msg.mix,
              msg.outputGain,
              msg.bitDepth
            );
          }
          break;
        case 'disable-distortion':
          if (this._ready) {
            wasm.dspprocessor_disable_distortion(this._processorPtr);
          }
          break;
        case 'set-phaser':
          if (this._ready) {
            wasm.dspprocessor_set_phaser(
              this._processorPtr,
              msg.rateHz,
              msg.depth,
              msg.feedback,
              msg.stages,
              msg.mix
            );
          }
          break;
        case 'disable-phaser':
          if (this._ready) {
            wasm.dspprocessor_disable_phaser(this._processorPtr);
          }
          break;
        case 'set-tremolo':
          if (this._ready) {
            wasm.dspprocessor_set_tremolo(
              this._processorPtr,
              msg.rateHz,
              msg.depth,
              msg.shape
            );
          }
          break;
        case 'disable-tremolo':
          if (this._ready) {
            wasm.dspprocessor_disable_tremolo(this._processorPtr);
          }
          break;
        case 'set-autopan':
          if (this._ready) {
            wasm.dspprocessor_set_autopan(
              this._processorPtr,
              msg.rateHz,
              msg.depth,
              msg.shape
            );
          }
          break;
        case 'disable-autopan':
          if (this._ready) {
            wasm.dspprocessor_disable_autopan(this._processorPtr);
          }
          break;
        case 'set-stereo-width':
          if (this._ready) {
            wasm.dspprocessor_set_stereo_width(this._processorPtr, msg.width);
          }
          break;
        case 'disable-stereo-imager':
          if (this._ready) {
            wasm.dspprocessor_disable_stereo_imager(this._processorPtr);
          }
          break;
        case 'set-limiter':
          if (this._ready) {
            wasm.dspprocessor_set_limiter(
              this._processorPtr,
              msg.ceilingDb,
              msg.releaseMs,
              msg.lookaheadMs
            );
          }
          break;
        case 'disable-limiter':
          if (this._ready) {
            wasm.dspprocessor_disable_limiter(this._processorPtr);
          }
          break;
        case 'set-ringmod':
          if (this._ready) {
            wasm.dspprocessor_set_ringmod(
              this._processorPtr,
              msg.freqHz,
              msg.mix,
              msg.shape
            );
          }
          break;
        case 'disable-ringmod':
          if (this._ready) {
            wasm.dspprocessor_disable_ringmod(this._processorPtr);
          }
          break;
        case 'set-dc-blocker':
          if (this._ready) {
            wasm.dspprocessor_set_dc_blocker(this._processorPtr, msg.cutoffHz);
          }
          break;
        case 'disable-dc-blocker':
          if (this._ready) {
            wasm.dspprocessor_disable_dc_blocker(this._processorPtr);
          }
          break;
        case 'reset':
          if (this._ready) {
            wasm.dspprocessor_reset(this._processorPtr);
          }
          break;
        case 'dispose':
          if (this._ready && this._processorPtr !== 0) {
            // Free pre-allocated audio buffer first to prevent memory leak
            if (this._bufPtr !== 0) {
              wasm.free_f32_buffer(this._bufPtr, this._bufLen);
              this._bufPtr = 0;
              this._bufLen = 0;
            }
            wasm.__wbg_dspprocessor_free(this._processorPtr, 0);
            this._processorPtr = 0;
            this._ready = false;
          }
          break;
      }
    } catch (err) {
      this.port.postMessage({ type: 'error', message: err.message });
    }
  }

  /**
   * Pre-allocate a WASM buffer for the given frame count.
   * Reused across process() calls to avoid real-time allocation.
   * Uses our named Rust exports (alloc_f32_buffer / free_f32_buffer)
   * instead of unstable __wbindgen_export internals.
   */
  _ensureBuffer(frames) {
    if (this._bufLen >= frames) return;
    // Free previous buffer if any
    if (this._bufPtr !== 0) {
      wasm.free_f32_buffer(this._bufPtr, this._bufLen);
    }
    this._bufPtr = wasm.alloc_f32_buffer(frames) >>> 0;
    this._bufLen = frames;
  }

  async _initWasm(wasmBytes, sampleRate) {
    // Guard: share a single WASM instance across all processor instances.
    // Each processor gets its own _processorPtr within the shared linear memory.
    if (wasm === null) {
      const wasmModule = await WebAssembly.compile(wasmBytes);
      const imports = getWasmImports();
      const instance = await WebAssembly.instantiate(wasmModule, imports);

      wasm = instance.exports;

      // Invalidate cached views after WASM instantiation
      cachedUint8ArrayMemory = null;
      cachedFloat32ArrayMemory = null;
    }

    this._processorPtr = wasm.dspprocessor_new(sampleRate);

    // Pre-allocate buffer for up to 2048 frames to avoid any malloc
    // in the real-time process() callback (standard quantum is 128).
    this._ensureBuffer(2048);

    this._ready = true;
    this.port.postMessage({ type: 'ready' });
  }

  process(inputs, outputs, _parameters) {
    if (!this._ready || !wasm) {
      // Pass-through until WASM is ready
      const input = inputs[0];
      const output = outputs[0];
      if (input && output) {
        for (let ch = 0; ch < output.length; ch++) {
          if (input[ch]) {
            output[ch].set(input[ch]);
          }
        }
      }
      return true;
    }

    const input = inputs[0];
    const output = outputs[0];
    if (!input || !output || input.length === 0) {
      return true;
    }

    const frames = output[0].length;

    // Ensure our pre-allocated buffer is large enough
    this._ensureBuffer(frames);

    try {
      // Process each channel through the WASM DSP engine
      for (let ch = 0; ch < output.length; ch++) {
        const inChannel = input[ch];
        const outChannel = output[ch];
        if (!inChannel) continue;

        // Copy input data into pre-allocated WASM buffer
        getFloat32ArrayMemory().set(inChannel, this._bufPtr / 4);

        // Call process_mono using the wasm-bindgen ABI:
        // process_mono(self_ptr, data_ptr, data_len, heap_handle)
        // The last argument is a heap handle to the output Float32Array
        // so wasm-bindgen can copy results back via __wbindgen_copy_to_typed_array
        const handle = addHeapObject(outChannel);
        wasm.dspprocessor_process_mono(
          this._processorPtr,
          this._bufPtr,
          frames,
          handle
        );
      }
    } catch (err) {
      // On WASM trap, fall back to pass-through to avoid killing the worklet
      this._ready = false;
      this.port.postMessage({ type: 'error', message: 'WASM process error: ' + err.message });
      for (let ch = 0; ch < output.length; ch++) {
        if (input[ch]) output[ch].set(input[ch]);
      }
    }

    return true;
  }
}

registerProcessor('wasm-dsp-processor', WasmDspProcessor);
