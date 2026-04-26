/**
 * Spectral AudioWorklet Processor — FFT/IFFT engine for spectral effects.
 *
 * Ported from src/engine/dsp/core/spectral-processor.ts for AudioWorklet thread.
 * Zero dependencies, allocation-free in process().
 */

/* eslint-disable no-undef */

// In-place radix-2 FFT (Cooley-Tukey DIT)
function fftInPlace(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
      tmp = im[i]; im[i] = im[j]; im[j] = tmp;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angle = -2 * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1, curIm = 0;
      for (let j = 0; j < half; j++) {
        const a = i + j, b = a + half;
        const tRe = curRe * re[b] - curIm * im[b];
        const tIm = curRe * im[b] + curIm * re[b];
        re[b] = re[a] - tRe; im[b] = im[a] - tIm;
        re[a] += tRe; im[a] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

function ifftInPlace(re, im) {
  const n = re.length;
  for (let i = 0; i < n; i++) im[i] = -im[i];
  fftInPlace(re, im);
  const invN = 1 / n;
  for (let i = 0; i < n; i++) { re[i] *= invN; im[i] = -im[i] * invN; }
}

class SpectralWorkletProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const opts = options.processorOptions ?? {};
    const N = opts.fftSize ?? 2048;

    this.N = N;
    this.hopSize = N >> 1;
    this.window = new Float32Array(N);
    for (let i = 0; i < N; i++) this.window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (N - 1)));

    this.fftRe = new Float32Array(N);
    this.fftIm = new Float32Array(N);
    this.magnitude = new Float32Array(N >> 1);
    this.phase = new Float32Array(N >> 1);
    this.inputBuffer = new Float32Array(N);
    this.outputBuffer = new Float32Array(N * 2);
    this.inputWritePos = 0;
    this.outputReadPos = 0;
    this.frozenMag = new Float32Array(N >> 1);
    this.frozenPhase = new Float32Array(N >> 1);
    this.isFrozen = false;
    this.hasSnapshot = false;
    this.windowSum = new Float32Array(N);
    const hop = N >> 1;
    for (let i = 0; i < N; i++) {
      const w1 = this.window[i];
      const w2 = this.window[(i + hop) % N];
      this.windowSum[i] = w1 * w1 + w2 * w2;
    }
    this.blurAccumMag = new Float32Array(N >> 1);
    this.blurFrameCount = 0;
    this.filterCurve = new Float32Array(N >> 1);
    this.filterCurve.fill(1);
    this.morphMag = new Float32Array(N >> 1);
    this.morphPhase = new Float32Array(N >> 1);
    this.hasMorphTarget = false;

    this.mode = opts.mode ?? 'freeze';
    this.freezeDecay = 1.0;
    this.freezeBrightness = 0;
    this.blurAmount = 0.5;
    this.blurFrequencySpread = 0;
    this.blurBrightness = 0;
    this.morphAmount = 0.5;
    this._alive = true;

    this.port.onmessage = (e) => {
      const d = e.data;
      if (d.type === 'param') {
        if (d.name in this) this[d.name] = d.value;
      } else if (d.type === 'freeze') { this.isFrozen = true; }
      else if (d.type === 'unfreeze') { this.isFrozen = false; this.hasSnapshot = false; }
      else if (d.type === 'filterCurve') { this.filterCurve.set(d.value.subarray(0, this.filterCurve.length)); }
      else if (d.type === 'morphTarget') {
        this.morphMag.set(d.mag.subarray(0, this.morphMag.length));
        this.morphPhase.set(d.phase.subarray(0, this.morphPhase.length));
        this.hasMorphTarget = true;
      } else if (d.type === 'dispose') { this._alive = false; }
    };
  }

  processFrame() {
    const N = this.N;
    const halfN = N >> 1;
    for (let i = 0; i < N; i++) { this.fftRe[i] = this.inputBuffer[i] * this.window[i]; this.fftIm[i] = 0; }
    fftInPlace(this.fftRe, this.fftIm);
    for (let i = 0; i < halfN; i++) {
      this.magnitude[i] = Math.sqrt(this.fftRe[i] * this.fftRe[i] + this.fftIm[i] * this.fftIm[i]);
      this.phase[i] = Math.atan2(this.fftIm[i], this.fftRe[i]);
    }

    if (this.mode === 'freeze') this._applyFreeze(halfN);
    else if (this.mode === 'blur') this._applyBlur(halfN);
    else if (this.mode === 'filter') this._applyFilter(halfN);
    else if (this.mode === 'morph') this._applyMorph(halfN);

    for (let i = 0; i < halfN; i++) {
      this.fftRe[i] = this.magnitude[i] * Math.cos(this.phase[i]);
      this.fftIm[i] = this.magnitude[i] * Math.sin(this.phase[i]);
    }
    this.fftIm[0] = 0;
    for (let i = 1; i < halfN; i++) { this.fftRe[N - i] = this.fftRe[i]; this.fftIm[N - i] = -this.fftIm[i]; }
    if (halfN < N) this.fftIm[halfN] = 0;
    ifftInPlace(this.fftRe, this.fftIm);
    for (let i = 0; i < N; i++) {
      const outIdx = (this.outputReadPos + i) % this.outputBuffer.length;
      const w = this.window[i];
      const norm = this.windowSum[i];
      const gain = norm > 1e-12 ? w / norm : 0;
      this.outputBuffer[outIdx] += this.fftRe[i] * gain;
    }
  }

  _applyFreeze(halfN) {
    if (!this.isFrozen) return;
    if (!this.hasSnapshot) {
      this.frozenMag.set(this.magnitude.subarray(0, halfN));
      this.frozenPhase.set(this.phase.subarray(0, halfN));
      this.hasSnapshot = true;
    }
    const decay = this.freezeDecay >= 1 ? 1 : Math.pow(this.freezeDecay, 0.1);
    for (let i = 0; i < halfN; i++) {
      let mag = this.frozenMag[i];
      if (this.freezeBrightness !== 0) {
        const tilt = 1 + this.freezeBrightness * (i / halfN - 0.5) * 2;
        mag *= Math.max(0, tilt);
      }
      this.magnitude[i] = mag;
      if (decay < 1) this.frozenMag[i] *= decay;
    }
  }

  _applyBlur(halfN) {
    const frames = 1 + Math.floor(this.blurAmount * 63);
    const alpha = 1 / frames;
    for (let i = 0; i < halfN; i++) {
      this.blurAccumMag[i] = this.blurAccumMag[i] * (1 - alpha) + this.magnitude[i] * alpha;
    }
    this.blurFrameCount++;
    if (this.blurFrequencySpread > 0) {
      const spread = Math.floor(this.blurFrequencySpread * 16) + 1;
      for (let i = 0; i < halfN; i++) {
        let sum = 0, count = 0;
        const lo = Math.max(0, i - spread), hi = Math.min(halfN - 1, i + spread);
        for (let j = lo; j <= hi; j++) { sum += this.blurAccumMag[j]; count++; }
        this.magnitude[i] = sum / count;
      }
    } else {
      this.magnitude.set(this.blurAccumMag.subarray(0, halfN));
    }
    if (this.blurBrightness !== 0) {
      for (let i = 0; i < halfN; i++) {
        const tilt = 1 + this.blurBrightness * (i / halfN - 0.5) * 2;
        this.magnitude[i] *= Math.max(0, tilt);
      }
    }
  }

  _applyFilter(halfN) {
    for (let i = 0; i < halfN; i++) this.magnitude[i] *= this.filterCurve[i];
  }

  _applyMorph(halfN) {
    if (!this.hasMorphTarget) return;
    const t = this.morphAmount;
    for (let i = 0; i < halfN; i++) {
      this.magnitude[i] = this.magnitude[i] * (1 - t) + this.morphMag[i] * t;
    }
  }

  process(inputs, outputs) {
    if (!this._alive) return false;
    const input = inputs[0];
    const output = outputs[0];
    if (!input || !input[0] || !output || !output[0]) return true;

    const inData = input[0];
    const outData = output[0];
    const blockSize = inData.length;

    for (let i = 0; i < blockSize; i++) {
      this.inputBuffer[this.inputWritePos] = inData[i];
      this.inputWritePos++;
      if (this.inputWritePos >= this.N) {
        this.processFrame();
        this.inputWritePos = this.hopSize;
        this.inputBuffer.copyWithin(0, this.hopSize, this.N);
      }
      outData[i] = this.outputBuffer[this.outputReadPos];
      this.outputBuffer[this.outputReadPos] = 0;
      this.outputReadPos = (this.outputReadPos + 1) % this.outputBuffer.length;
    }
    return true;
  }
}

registerProcessor('spectral-worklet-processor', SpectralWorkletProcessor);
