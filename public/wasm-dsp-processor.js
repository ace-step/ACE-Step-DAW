/**
 * AudioWorklet processor that loads and runs the Rust WASM DSP engine.
 *
 * This processor is loaded via `audioContext.audioWorklet.addModule()` and
 * receives the WASM binary from the main thread via MessagePort.
 *
 * Architecture:
 *   Main Thread (WasmEffectsEngine.ts)
 *     → MessagePort → AudioWorklet Thread (this file)
 *       → FFI → ace-dsp-wasm (Rust → WASM)
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

class WasmDspProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._processor = null;
    this._wasm = null;
    this._ready = false;

    this.port.onmessage = (event) => this._handleMessage(event.data);
  }

  async _handleMessage(msg) {
    try {
      switch (msg.type) {
        case 'init':
          await this._initWasm(msg.wasmBytes, msg.sampleRate);
          break;
        case 'set-gain':
          if (this._processor) {
            this._processor.set_gain(msg.value);
          }
          break;
        case 'set-filter':
          if (this._processor) {
            this._processor.set_filter(
              msg.filterType,
              msg.frequency,
              msg.q,
              msg.gainDb
            );
          }
          break;
        case 'disable-filter':
          if (this._processor) {
            this._processor.disable_filter();
          }
          break;
        case 'set-delay':
          if (this._processor) {
            this._processor.set_delay(msg.delayMs, msg.feedback, msg.wet);
          }
          break;
        case 'set-delay-params':
          if (this._processor) {
            this._processor.set_delay_params(
              msg.delayMs,
              msg.feedback,
              msg.wet,
              msg.dry
            );
          }
          break;
        case 'disable-delay':
          if (this._processor) {
            this._processor.disable_delay();
          }
          break;
        case 'set-compressor':
          if (this._processor) {
            this._processor.set_compressor(
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
          if (this._processor) {
            this._processor.disable_compressor();
          }
          break;
        case 'set-gate':
          if (this._processor) {
            this._processor.set_gate(
              msg.thresholdDb,
              msg.attackMs,
              msg.holdMs,
              msg.releaseMs,
              msg.rangeDb
            );
          }
          break;
        case 'disable-gate':
          if (this._processor) {
            this._processor.disable_gate();
          }
          break;
        case 'set-eq-band':
          if (this._processor) {
            this._processor.set_eq_band(
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
          if (this._processor) {
            this._processor.disable_eq();
          }
          break;
        case 'set-reverb':
          if (this._processor) {
            this._processor.set_reverb(
              msg.roomSize,
              msg.damping,
              msg.wet,
              msg.dry
            );
          }
          break;
        case 'disable-reverb':
          if (this._processor) {
            this._processor.disable_reverb();
          }
          break;
        case 'reset':
          if (this._processor) {
            this._processor.reset();
          }
          break;
      }
    } catch (err) {
      this.port.postMessage({ type: 'error', message: err.message });
    }
  }

  async _initWasm(wasmBytes, sampleRate) {
    // Import the wasm-bindgen glue code
    // The glue JS is inlined at build time or loaded via importScripts
    // For AudioWorklet, we use WebAssembly.instantiate directly
    const wasmModule = await WebAssembly.compile(wasmBytes);
    const instance = await WebAssembly.instantiate(wasmModule, {});

    this._wasm = instance.exports;

    // Use the low-level WASM exports directly since we can't import
    // the wasm-bindgen wrapper in AudioWorklet context.
    // We'll create a thin wrapper that mirrors the DspProcessor API.
    this._processorPtr = this._wasm.dspprocessor_new(sampleRate);
    this._ready = true;

    this.port.postMessage({ type: 'ready' });
  }

  process(inputs, outputs, _parameters) {
    if (!this._ready || !this._wasm) {
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

    // Process each channel through the WASM DSP engine
    for (let ch = 0; ch < output.length; ch++) {
      const inChannel = input[ch];
      const outChannel = output[ch];
      if (!inChannel) continue;

      // Copy input to output, then process in-place via WASM
      outChannel.set(inChannel);

      // Allocate WASM memory for the buffer
      const len = outChannel.length;
      const ptr = this._wasm.__wbindgen_export(len * 4, 4);
      const wasmBuf = new Float32Array(
        this._wasm.memory.buffer,
        ptr,
        len
      );
      wasmBuf.set(outChannel);

      // Call the WASM processor
      this._wasm.dspprocessor_process_mono(this._processorPtr, ptr, len, ptr);

      // Copy result back
      outChannel.set(
        new Float32Array(this._wasm.memory.buffer, ptr, len)
      );

      // Free the buffer
      this._wasm.__wbindgen_export2(ptr, len * 4, 4);
    }

    return true;
  }
}

registerProcessor('wasm-dsp-processor', WasmDspProcessor);
