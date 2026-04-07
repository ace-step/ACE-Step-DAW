/**
 * Spectral Processor — FFT/IFFT engine for spectral effects.
 *
 * Zero external dependencies, AudioWorklet-safe.
 * Uses overlap-add reconstruction with Hann windowing.
 * Part of: feat: spectral processing/editing (#963).
 */

// ---------------------------------------------------------------------------
// FFT implementation (Cooley-Tukey radix-2 DIT)
// ---------------------------------------------------------------------------

/**
 * In-place radix-2 FFT. Operates on interleaved real/imag arrays.
 * @param re  Real parts (length N, must be power of 2)
 * @param im  Imaginary parts (length N)
 */
export function fft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  // Bit-reversal permutation
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) {
      j ^= bit;
      bit >>= 1;
    }
    j ^= bit;
    if (i < j) {
      let tmp = re[i]; re[i] = re[j]; re[j] = tmp;
      tmp = im[i]; im[i] = im[j]; im[j] = tmp;
    }
  }
  // Butterfly stages
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const angle = -2 * Math.PI / len;
    const wRe = Math.cos(angle);
    const wIm = Math.sin(angle);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      for (let j = 0; j < half; j++) {
        const a = i + j;
        const b = a + half;
        const tRe = curRe * re[b] - curIm * im[b];
        const tIm = curRe * im[b] + curIm * re[b];
        re[b] = re[a] - tRe;
        im[b] = im[a] - tIm;
        re[a] += tRe;
        im[a] += tIm;
        const nextRe = curRe * wRe - curIm * wIm;
        curIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
      }
    }
  }
}

/**
 * In-place inverse FFT.
 */
export function ifft(re: Float32Array, im: Float32Array): void {
  const n = re.length;
  // Conjugate
  for (let i = 0; i < n; i++) im[i] = -im[i];
  fft(re, im);
  // Conjugate and scale
  const invN = 1 / n;
  for (let i = 0; i < n; i++) {
    re[i] *= invN;
    im[i] = -im[i] * invN;
  }
}

// ---------------------------------------------------------------------------
// Hann window generation
// ---------------------------------------------------------------------------

export function createHannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (size - 1)));
  }
  return w;
}

// ---------------------------------------------------------------------------
// Spectral processing modes
// ---------------------------------------------------------------------------

export type SpectralMode = 'freeze' | 'blur' | 'filter' | 'morph';

export interface SpectralProcessorConfig {
  fftSize: number;  // 2048 or 4096
  sampleRate: number;
  mode: SpectralMode;
}

/**
 * SpectralProcessor — handles FFT-based spectral manipulation.
 *
 * Uses overlap-add (50% overlap) with Hann windowing for artifact-free
 * reconstruction. Pre-allocates all buffers for real-time safety.
 */
export class SpectralProcessor {
  readonly fftSize: number;
  private readonly hopSize: number;
  private readonly window: Float32Array;

  // FFT working buffers
  private readonly fftRe: Float32Array;
  private readonly fftIm: Float32Array;

  // Magnitude/phase for spectral manipulation
  private readonly magnitude: Float32Array;
  private readonly phase: Float32Array;

  // Overlap-add
  private readonly inputBuffer: Float32Array;
  private readonly outputBuffer: Float32Array;
  private inputWritePos = 0;
  private outputReadPos = 0;

  // Spectral state for freeze/blur
  private readonly frozenMag: Float32Array;
  private readonly frozenPhase: Float32Array;
  private isFrozen = false;
  private hasSnapshot = false; // explicit flag for freeze snapshot capture

  // Window normalization buffer for overlap-add reconstruction
  private readonly windowSum: Float32Array;

  // Blur accumulator
  private readonly blurAccumMag: Float32Array;
  private blurFrameCount = 0;

  // Filter curve (magnitude multipliers per bin, linear scale)
  private readonly filterCurve: Float32Array;

  // Morph target
  private readonly morphMag: Float32Array;
  private readonly morphPhase: Float32Array;
  private hasMorphTarget = false;

  // Parameters (updated from main thread)
  mode: SpectralMode = 'freeze';
  freezeDecay = 1.0;
  freezeBrightness = 0;
  blurAmount = 0.5;
  blurFrequencySpread = 0;
  blurBrightness = 0;
  morphAmount = 0.5;
  mix = 1.0;

  constructor(config: SpectralProcessorConfig) {
    this.fftSize = config.fftSize;
    this.hopSize = config.fftSize >> 1; // 50% overlap
    this.window = createHannWindow(config.fftSize);

    this.fftRe = new Float32Array(config.fftSize);
    this.fftIm = new Float32Array(config.fftSize);
    this.magnitude = new Float32Array(config.fftSize >> 1);
    this.phase = new Float32Array(config.fftSize >> 1);

    this.inputBuffer = new Float32Array(config.fftSize);
    this.outputBuffer = new Float32Array(config.fftSize * 2); // double for overlap-add safety

    this.frozenMag = new Float32Array(config.fftSize >> 1);
    this.frozenPhase = new Float32Array(config.fftSize >> 1);

    this.blurAccumMag = new Float32Array(config.fftSize >> 1);

    this.filterCurve = new Float32Array(config.fftSize >> 1);
    this.filterCurve.fill(1); // flat by default

    this.morphMag = new Float32Array(config.fftSize >> 1);
    this.morphPhase = new Float32Array(config.fftSize >> 1);

    // Pre-compute window normalization for overlap-add (window^2 sum at 50% overlap)
    this.windowSum = new Float32Array(config.fftSize);
    const hop = config.fftSize >> 1;
    for (let i = 0; i < config.fftSize; i++) {
      const w1 = this.window[i];
      const w2 = this.window[(i + hop) % config.fftSize];
      this.windowSum[i] = w1 * w1 + w2 * w2;
    }

    this.mode = config.mode;
  }

  /**
   * Process a block of samples. Returns the number of output samples ready.
   * Input and output may overlap — caller provides separate buffers.
   */
  processBlock(input: Float32Array, output: Float32Array, blockSize: number): void {
    for (let i = 0; i < blockSize; i++) {
      // Write input to ring buffer
      this.inputBuffer[this.inputWritePos] = input[i];
      this.inputWritePos++;

      // When we have a full FFT frame, process it
      if (this.inputWritePos >= this.fftSize) {
        this.processFrame();
        this.inputWritePos = this.hopSize;
        // Shift input buffer left by hopSize
        this.inputBuffer.copyWithin(0, this.hopSize, this.fftSize);
      }

      // Read from output overlap-add buffer
      output[i] = this.outputBuffer[this.outputReadPos];
      this.outputBuffer[this.outputReadPos] = 0; // clear after read
      this.outputReadPos = (this.outputReadPos + 1) % this.outputBuffer.length;
    }
  }

  /** Capture current spectrum as freeze snapshot. */
  freeze(): void {
    this.isFrozen = true;
  }

  /** Release freeze and reset snapshot so next freeze captures fresh. */
  unfreeze(): void {
    this.isFrozen = false;
    this.hasSnapshot = false;
  }

  /** Set the filter curve from control points (linear magnitude multipliers). */
  setFilterCurve(curve: Float32Array): void {
    const len = Math.min(curve.length, this.filterCurve.length);
    for (let i = 0; i < len; i++) {
      this.filterCurve[i] = curve[i];
    }
  }

  /** Set morph target spectrum from external source. */
  setMorphTarget(mag: Float32Array, phase: Float32Array): void {
    const len = Math.min(mag.length, this.morphMag.length);
    for (let i = 0; i < len; i++) {
      this.morphMag[i] = mag[i];
      this.morphPhase[i] = phase[i];
    }
    this.hasMorphTarget = true;
  }

  /** Get current magnitude spectrum for visualization. */
  getMagnitude(): Float32Array {
    return this.magnitude;
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private processFrame(): void {
    const N = this.fftSize;
    const halfN = N >> 1;

    // Apply window and copy to FFT buffers
    for (let i = 0; i < N; i++) {
      this.fftRe[i] = this.inputBuffer[i] * this.window[i];
      this.fftIm[i] = 0;
    }

    // Forward FFT
    fft(this.fftRe, this.fftIm);

    // Convert to magnitude/phase
    for (let i = 0; i < halfN; i++) {
      this.magnitude[i] = Math.sqrt(
        this.fftRe[i] * this.fftRe[i] + this.fftIm[i] * this.fftIm[i],
      );
      this.phase[i] = Math.atan2(this.fftIm[i], this.fftRe[i]);
    }

    // Apply spectral processing
    switch (this.mode) {
      case 'freeze':
        this.applyFreeze(halfN);
        break;
      case 'blur':
        this.applyBlur(halfN);
        break;
      case 'filter':
        this.applyFilter(halfN);
        break;
      case 'morph':
        this.applyMorph(halfN);
        break;
    }

    // Convert back to rectangular
    for (let i = 0; i < halfN; i++) {
      this.fftRe[i] = this.magnitude[i] * Math.cos(this.phase[i]);
      this.fftIm[i] = this.magnitude[i] * Math.sin(this.phase[i]);
    }
    // DC bin: force imaginary to 0
    this.fftIm[0] = 0;
    // Mirror for real signal (bins 1..halfN-1 only; Nyquist handled separately)
    for (let i = 1; i < halfN; i++) {
      this.fftRe[N - i] = this.fftRe[i];
      this.fftIm[N - i] = -this.fftIm[i];
    }
    // Nyquist bin: force imaginary to 0
    if (halfN < N) {
      this.fftIm[halfN] = 0;
    }

    // Inverse FFT
    ifft(this.fftRe, this.fftIm);

    // Overlap-add with normalized synthesis window
    // Analysis already applied window, so synthesis window produces window^2.
    // Normalize by pre-computed window sum for unity pass-through.
    for (let i = 0; i < N; i++) {
      const outIdx = (this.outputReadPos + i) % this.outputBuffer.length;
      const w = this.window[i];
      const norm = this.windowSum[i];
      const synthesisGain = norm > 1e-12 ? w / norm : 0;
      this.outputBuffer[outIdx] += this.fftRe[i] * synthesisGain;
    }
  }

  private applyFreeze(halfN: number): void {
    if (this.isFrozen) {
      // On first frozen frame, capture snapshot (explicit flag avoids bin-value check)
      if (!this.hasSnapshot) {
        this.frozenMag.set(this.magnitude.subarray(0, halfN));
        this.frozenPhase.set(this.phase.subarray(0, halfN));
        this.hasSnapshot = true;
      }

      // Decay: map 0–1 to a meaningful per-frame multiplier.
      // decay=1 → infinite hold, decay=0 → ~50ms fade at 44.1kHz/2048 hop
      const decayPerFrame = this.freezeDecay >= 1 ? 1 : Math.pow(this.freezeDecay, 0.1);

      for (let i = 0; i < halfN; i++) {
        let mag = this.frozenMag[i];

        // Apply brightness tilt
        if (this.freezeBrightness !== 0) {
          const binNorm = i / halfN;
          const tilt = 1 + this.freezeBrightness * (binNorm - 0.5) * 2;
          mag *= Math.max(0, tilt);
        }

        this.magnitude[i] = mag;

        // Decay the frozen spectrum
        if (decayPerFrame < 1) {
          this.frozenMag[i] *= decayPerFrame;
        }
      }
    } else {
      // Snapshot is cleared on unfreeze() via hasSnapshot flag
    }
  }

  private applyBlur(halfN: number): void {
    // Temporal blur: exponential moving average of magnitudes
    const frames = 1 + Math.floor(this.blurAmount * 63); // 1–64 frames
    const alpha = 1 / frames;

    for (let i = 0; i < halfN; i++) {
      this.blurAccumMag[i] = this.blurAccumMag[i] * (1 - alpha) + this.magnitude[i] * alpha;
    }
    this.blurFrameCount++;

    // Frequency spread: average neighboring bins
    if (this.blurFrequencySpread > 0) {
      const spread = Math.floor(this.blurFrequencySpread * 16) + 1;
      // Use magnitude array as temp (we're replacing it anyway)
      for (let i = 0; i < halfN; i++) {
        let sum = 0;
        let count = 0;
        const lo = Math.max(0, i - spread);
        const hi = Math.min(halfN - 1, i + spread);
        for (let j = lo; j <= hi; j++) {
          sum += this.blurAccumMag[j];
          count++;
        }
        this.magnitude[i] = sum / count;
      }
    } else {
      this.magnitude.set(this.blurAccumMag.subarray(0, halfN));
    }

    // Apply brightness tilt
    if (this.blurBrightness !== 0) {
      for (let i = 0; i < halfN; i++) {
        const binNorm = i / halfN;
        const tilt = 1 + this.blurBrightness * (binNorm - 0.5) * 2;
        this.magnitude[i] *= Math.max(0, tilt);
      }
    }
  }

  private applyFilter(halfN: number): void {
    for (let i = 0; i < halfN; i++) {
      this.magnitude[i] *= this.filterCurve[i];
    }
  }

  private applyMorph(halfN: number): void {
    if (!this.hasMorphTarget) return;

    const t = this.morphAmount;
    for (let i = 0; i < halfN; i++) {
      // Magnitude: linear interpolation
      this.magnitude[i] = this.magnitude[i] * (1 - t) + this.morphMag[i] * t;
      // Phase: use source A phase for stability
    }
  }
}
