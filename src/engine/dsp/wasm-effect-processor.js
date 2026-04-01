/**
 * WasmEffectProcessor — AudioWorkletProcessor that runs Rust DSP via WASM.
 *
 * Loaded into the AudioWorklet scope. Communicates with the main thread
 * via MessagePort for initialization, parameter updates, and metering.
 *
 * Protocol:
 *   Main → Worklet:
 *     { type: 'init', wasmUrl: string, effectType: string, params: object }
 *     { type: 'param', paramId: string, value: number }
 *     { type: 'reset' }
 *
 *   Worklet → Main:
 *     { type: 'ready' }
 *     { type: 'meter', rmsL: number, rmsR: number, peak: number }
 *     { type: 'error', message: string }
 */
class WasmEffectProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    /** @type {WebAssembly.Instance | null} */
    this._wasm = null;
    /** @type {object | null} */
    this._effect = null;
    this._ready = false;
    this._effectType = 'passthrough';
    this._meterCounter = 0;

    this.port.onmessage = (e) => this._handleMessage(e.data);
  }

  async _handleMessage(msg) {
    try {
      switch (msg.type) {
        case 'init':
          await this._initWasm(msg.wasmUrl, msg.effectType, msg.params);
          break;
        case 'param':
          this._setParam(msg.paramId, msg.value);
          break;
        case 'reset':
          if (this._effect && this._effect.reset) {
            this._effect.reset();
          }
          break;
      }
    } catch (err) {
      this.port.postMessage({ type: 'error', message: err.message });
    }
  }

  async _initWasm(wasmUrl, effectType, params) {
    // NOTE: Full WASM integration requires loading wasm-bindgen's JS glue
    // alongside the .wasm binary. In AudioWorklet scope, ES module imports
    // are limited. For now, we validate the WASM URL is fetchable and
    // operate in passthrough mode. Per-effect WASM processing will be
    // wired when the AudioWorklet module loading story is resolved
    // (see: https://github.com/nicolo-ribaudo/tc39-proposal-structs-wasm).
    try {
      const response = await fetch(wasmUrl);
      if (!response.ok) {
        throw new Error(`WASM fetch failed: ${response.status}`);
      }
      // Validate the binary is valid WASM (compile but don't instantiate
      // without the wasm-bindgen import object — that would throw)
      const bytes = await response.arrayBuffer();
      await WebAssembly.compile(bytes);

      this._effectType = effectType;
      this._ready = true;

      // Signal ready — audio passes through until per-effect wiring is done
      this.port.postMessage({ type: 'ready', mode: 'passthrough' });
    } catch (err) {
      this.port.postMessage({ type: 'error', message: `WASM init: ${err.message}` });
    }
  }

  _setParam(paramId, value) {
    // Parameter updates will be routed to the specific effect instance
    // once effect types are fully implemented
    if (this._effect && typeof this._effect[`set_${paramId}`] === 'function') {
      this._effect[`set_${paramId}`](value);
    }
  }

  process(inputs, outputs, _parameters) {
    if (!this._ready) {
      // Pass through when not initialized
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

    // For now, pass through audio (WASM processing will be wired per-effect)
    for (let ch = 0; ch < output.length; ch++) {
      if (input[ch]) {
        output[ch].set(input[ch]);
      }
    }

    // Metering: send RMS levels every ~16 blocks (~21ms at 128 samples/block)
    this._meterCounter++;
    if (this._meterCounter >= 16) {
      this._meterCounter = 0;
      const left = output[0] || new Float32Array(128);
      const right = output[1] || output[0] || new Float32Array(128);

      let sumL = 0, sumR = 0, peakL = 0, peakR = 0;
      for (let i = 0; i < left.length; i++) {
        const l = left[i];
        const r = right[i];
        sumL += l * l;
        sumR += r * r;
        peakL = Math.max(peakL, Math.abs(l));
        peakR = Math.max(peakR, Math.abs(r));
      }

      this.port.postMessage({
        type: 'meter',
        rmsL: Math.sqrt(sumL / left.length),
        rmsR: Math.sqrt(sumR / right.length),
        peakL,
        peakR,
      });
    }

    return true;
  }
}

registerProcessor('wasm-effect-processor', WasmEffectProcessor);
