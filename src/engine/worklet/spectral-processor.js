/**
 * SpectralProcessor — AudioWorkletProcessor for real-time spectral effects.
 *
 * Modes: freeze, blur, filter, morph
 * Uses overlap-add FFT/IFFT with Hann windowing.
 *
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/963
 */

/* eslint-disable no-undef */
// AudioWorkletGlobalScope — no imports allowed, all code must be self-contained.

const FFT_SIZE = 2048;
const HOP_SIZE = FFT_SIZE / 4; // 75% overlap for smooth output
const HALF_FFT = FFT_SIZE / 2;

// ─── Inline FFT (same algorithm as spectralDsp.ts) ────────────────────────────

function fftInPlace(real, imag) {
  const n = real.length;
  if (n <= 1) return;
  let j = 0;
  for (let i = 0; i < n - 1; i++) {
    if (i < j) {
      let t = real[i]; real[i] = real[j]; real[j] = t;
      t = imag[i]; imag[i] = imag[j]; imag[j] = t;
    }
    let m = n >> 1;
    while (m >= 1 && j >= m) { j -= m; m >>= 1; }
    j += m;
  }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const angle = (-2 * Math.PI) / size;
    const wR = Math.cos(angle);
    const wI = Math.sin(angle);
    for (let i = 0; i < n; i += size) {
      let cR = 1, cI = 0;
      for (let k = 0; k < half; k++) {
        const e = i + k;
        const o = e + half;
        const tR = cR * real[o] - cI * imag[o];
        const tI = cR * imag[o] + cI * real[o];
        real[o] = real[e] - tR;
        imag[o] = imag[e] - tI;
        real[e] += tR;
        imag[e] += tI;
        const nR = cR * wR - cI * wI;
        cI = cR * wI + cI * wR;
        cR = nR;
      }
    }
  }
}

function ifftInPlace(real, imag) {
  const n = real.length;
  for (let i = 0; i < n; i++) imag[i] = -imag[i];
  fftInPlace(real, imag);
  for (let i = 0; i < n; i++) {
    real[i] /= n;
    imag[i] = -imag[i] / n;
  }
}

// ─── Hann window (precomputed) ────────────────────────────────────────────────

function makeHannWindow(size) {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

// ─── Processor ────────────────────────────────────────────────────────────────

class SpectralProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // Buffers
    this._inputRing = new Float32Array(FFT_SIZE);
    this._outputRing = new Float32Array(FFT_SIZE * 2); // overlap-add output
    this._writePos = 0;
    this._readPos = 0;
    this._hopCount = 0;
    this._window = makeHannWindow(FFT_SIZE);

    // FFT scratch
    this._fftReal = new Float32Array(FFT_SIZE);
    this._fftImag = new Float32Array(FFT_SIZE);
    this._magnitude = new Float32Array(FFT_SIZE);
    this._phase = new Float32Array(FFT_SIZE);

    // Effect state
    this._mode = 'freeze'; // freeze | blur | filter | morph
    this._params = {
      wet: 1.0,
      freeze: false,
      blurDecay: 0.85,
      morphAmount: 0.5,
    };

    // Freeze: stored magnitude snapshot
    this._frozenMag = null;

    // Blur: running average accumulator
    this._blurAcc = new Float32Array(FFT_SIZE);

    // Filter: spectral mask (32 bands, linearly interpolated to FFT bins)
    this._filterMask = new Float32Array(32).fill(1);

    // Morph: reference magnitude snapshot
    this._morphRef = null;

    // FFT data for visualization (sent to main thread)
    this._vizCounter = 0;

    this.port.onmessage = (e) => this._handleMessage(e.data);
    this.port.postMessage({ type: 'ready' });
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'setMode':
        this._mode = msg.mode;
        break;
      case 'setParams':
        Object.assign(this._params, msg.params);
        break;
      case 'captureFreeze':
        // Capture current magnitude as freeze snapshot
        if (this._magnitude) {
          this._frozenMag = Float32Array.from(this._magnitude);
        }
        break;
      case 'releaseFreeze':
        this._frozenMag = null;
        break;
      case 'setFilterMask':
        if (msg.mask && msg.mask.length > 0) {
          this._filterMask = new Float32Array(msg.mask);
        }
        break;
      case 'captureMorphReference':
        if (this._magnitude) {
          this._morphRef = Float32Array.from(this._magnitude);
        }
        break;
    }
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || !output || !output[0]) return true;

    const inChannel = input[0];
    const outChannel = output[0];
    const blockSize = inChannel.length; // typically 128

    for (let i = 0; i < blockSize; i++) {
      // Write input sample into ring buffer
      this._inputRing[this._writePos] = inChannel[i];

      // Read from overlap-add output buffer
      const wet = this._params.wet;
      const processed = this._outputRing[this._readPos];
      outChannel[i] = inChannel[i] * (1 - wet) + processed * wet;
      this._outputRing[this._readPos] = 0; // clear after reading

      this._writePos = (this._writePos + 1) % FFT_SIZE;
      this._readPos = (this._readPos + 1) % (FFT_SIZE * 2);
      this._hopCount++;

      if (this._hopCount >= HOP_SIZE) {
        this._hopCount = 0;
        this._processFrame();
      }
    }

    // Copy to all output channels
    for (let ch = 1; ch < output.length; ch++) {
      output[ch].set(outChannel);
    }

    return true;
  }

  _processFrame() {
    // Extract frame from ring buffer (latest FFT_SIZE samples)
    for (let i = 0; i < FFT_SIZE; i++) {
      const idx = (this._writePos - FFT_SIZE + i + FFT_SIZE) % FFT_SIZE;
      this._fftReal[i] = this._inputRing[idx] * this._window[i];
      this._fftImag[i] = 0;
    }

    // Forward FFT
    fftInPlace(this._fftReal, this._fftImag);

    // Convert to magnitude/phase
    for (let i = 0; i < FFT_SIZE; i++) {
      this._magnitude[i] = Math.sqrt(
        this._fftReal[i] * this._fftReal[i] + this._fftImag[i] * this._fftImag[i]
      );
      this._phase[i] = Math.atan2(this._fftImag[i], this._fftReal[i]);
    }

    // Apply spectral processing
    this._applyEffect();

    // Send visualization data periodically (every 4th frame)
    this._vizCounter++;
    if (this._vizCounter >= 4) {
      this._vizCounter = 0;
      // Send only positive frequency bins for display
      const vizData = new Float32Array(HALF_FFT);
      for (let i = 0; i < HALF_FFT; i++) {
        vizData[i] = this._magnitude[i];
      }
      this.port.postMessage({ type: 'fftData', data: vizData }, [vizData.buffer]);
    }

    // Convert back to complex
    for (let i = 0; i < FFT_SIZE; i++) {
      this._fftReal[i] = this._magnitude[i] * Math.cos(this._phase[i]);
      this._fftImag[i] = this._magnitude[i] * Math.sin(this._phase[i]);
    }

    // Inverse FFT
    ifftInPlace(this._fftReal, this._fftImag);

    // Overlap-add into output ring buffer
    const outputBase = this._readPos;
    for (let i = 0; i < FFT_SIZE; i++) {
      const idx = (outputBase + i) % (FFT_SIZE * 2);
      this._outputRing[idx] += this._fftReal[i] * this._window[i];
    }
  }

  _applyEffect() {
    switch (this._mode) {
      case 'freeze':
        if (this._params.freeze && this._frozenMag) {
          for (let i = 0; i < FFT_SIZE; i++) {
            this._magnitude[i] = this._frozenMag[i];
          }
        } else if (this._params.freeze && !this._frozenMag) {
          // Auto-capture on first freeze frame
          this._frozenMag = Float32Array.from(this._magnitude);
        }
        break;

      case 'blur': {
        const decay = this._params.blurDecay;
        for (let i = 0; i < FFT_SIZE; i++) {
          this._blurAcc[i] = this._blurAcc[i] * decay + this._magnitude[i] * (1 - decay);
          this._magnitude[i] = this._blurAcc[i];
        }
        break;
      }

      case 'filter': {
        const mask = this._filterMask;
        const maskLen = mask.length;
        const n = FFT_SIZE;
        for (let i = 0; i < n; i++) {
          const pos = (i / n) * maskLen;
          const lo = Math.floor(pos);
          const hi = Math.min(lo + 1, maskLen - 1);
          const t = pos - lo;
          const gain = mask[lo] * (1 - t) + mask[hi] * t;
          this._magnitude[i] *= gain;
        }
        break;
      }

      case 'morph':
        if (this._morphRef) {
          const amount = this._params.morphAmount;
          for (let i = 0; i < FFT_SIZE; i++) {
            this._magnitude[i] =
              this._magnitude[i] * (1 - amount) + this._morphRef[i] * amount;
          }
        }
        break;
    }
  }
}

registerProcessor('spectral-processor', SpectralProcessor);
