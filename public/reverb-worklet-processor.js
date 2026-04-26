/**
 * Reverb AudioWorklet Processor — FreeVerb algorithm (Schroeder-Moorer topology).
 *
 * Ported from src/engine/dsp/core/reverb.ts for AudioWorklet thread.
 * Zero dependencies, allocation-free in process().
 */

/* eslint-disable no-undef */

const ANTI_DENORMAL = 1e-18;

// Tuning constants (FreeVerb standard, adjusted for 44100 Hz)
const COMB_TUNING = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
const ALLPASS_TUNING = [556, 441, 341, 225];
const STEREO_SPREAD = 23;
const FIXED_GAIN = 0.015;
const SCALE_DAMP = 0.4;
const SCALE_ROOM = 0.28;
const OFFSET_ROOM = 0.7;

class CombFilter {
  constructor(size) {
    this._buf = new Float32Array(size);
    this._size = size;
    this._idx = 0;
    this._filterStore = 0;
    this.damp = 0.5;
    this.feedback = 0.5;
  }
  process(input) {
    const output = this._buf[this._idx];
    this._filterStore = output * (1 - this.damp) + this._filterStore * this.damp
      + ANTI_DENORMAL - ANTI_DENORMAL;
    this._buf[this._idx] = input + this._filterStore * this.feedback;
    this._idx = (this._idx + 1) % this._size;
    return output;
  }
}

class AllpassFilter {
  constructor(size) {
    this._buf = new Float32Array(size);
    this._size = size;
    this._idx = 0;
    this.feedback = 0.5;
  }
  process(input) {
    const bufOut = this._buf[this._idx];
    const output = -input + bufOut;
    this._buf[this._idx] = input + bufOut * this.feedback + ANTI_DENORMAL - ANTI_DENORMAL;
    this._idx = (this._idx + 1) % this._size;
    return output;
  }
}

class ReverbWorkletProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const sr = options.processorOptions?.sampleRate ?? sampleRate ?? 44100;
    const srFactor = sr / 44100;

    this._combL = COMB_TUNING.map(t => new CombFilter(Math.round(t * srFactor)));
    this._combR = COMB_TUNING.map(t => new CombFilter(Math.round((t + STEREO_SPREAD) * srFactor)));
    this._allpassL = ALLPASS_TUNING.map(t => new AllpassFilter(Math.round(t * srFactor)));
    this._allpassR = ALLPASS_TUNING.map(t => new AllpassFilter(Math.round((t + STEREO_SPREAD) * srFactor)));
    for (const ap of [...this._allpassL, ...this._allpassR]) ap.feedback = 0.5;

    this._roomSize = 0.5;
    this._damping = 0.5;
    this._wet = 1;
    this._dry = 0;
    this._alive = true;

    this._updateParams();

    this.port.onmessage = (e) => {
      const { type, value } = e.data;
      if (type === 'roomSize') { this._roomSize = value; this._updateParams(); }
      else if (type === 'damping') { this._damping = value; this._updateParams(); }
      else if (type === 'wet') { this._wet = value; }
      else if (type === 'dry') { this._dry = value; }
      else if (type === 'dispose') { this._alive = false; }
    };

    // Apply initial options
    const opts = options.processorOptions ?? {};
    if (opts.roomSize != null) { this._roomSize = opts.roomSize; }
    if (opts.damping != null) { this._damping = opts.damping; }
    if (opts.wet != null) { this._wet = opts.wet; }
    if (opts.dry != null) { this._dry = opts.dry; }
    this._updateParams();
  }

  _updateParams() {
    const roomScaled = this._roomSize * SCALE_ROOM + OFFSET_ROOM;
    const dampScaled = this._damping * SCALE_DAMP;
    for (let i = 0; i < COMB_TUNING.length; i++) {
      this._combL[i].feedback = roomScaled;
      this._combR[i].feedback = roomScaled;
      this._combL[i].damp = dampScaled;
      this._combR[i].damp = dampScaled;
    }
  }

  process(inputs, outputs) {
    if (!this._alive) return false;
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0]) return true;

    const inputL = input[0];
    const inputR = input.length > 1 ? input[1] : inputL;
    const outputL = output[0];
    const outputR = output.length > 1 ? output[1] : output[0];
    const len = inputL.length;
    const wet = this._wet;
    const dry = this._dry;

    for (let i = 0; i < len; i++) {
      const inMono = (inputL[i] + inputR[i]) * FIXED_GAIN;
      let outL = 0;
      let outR = 0;
      for (let c = 0; c < COMB_TUNING.length; c++) {
        outL += this._combL[c].process(inMono);
        outR += this._combR[c].process(inMono);
      }
      for (let a = 0; a < ALLPASS_TUNING.length; a++) {
        outL = this._allpassL[a].process(outL);
        outR = this._allpassR[a].process(outR);
      }
      outputL[i] = inputL[i] * dry + outL * wet;
      outputR[i] = inputR[i] * dry + outR * wet;
    }
    return true;
  }
}

registerProcessor('reverb-worklet-processor', ReverbWorkletProcessor);
