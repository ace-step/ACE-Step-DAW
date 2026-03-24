/**
 * VST3 AudioWorklet Processor
 *
 * Bridges audio between the Web Audio graph and SharedArrayBuffer ring buffers
 * used for communicating with a companion app hosting VST3 plugins.
 *
 * Data flow:
 *   - For effects: worklet writes input audio → inputRingBuffer → main thread → companion
 *   - Companion → main thread → outputRingBuffer → worklet reads processed audio
 *   - For instruments: no input writing, only output reading
 */

/* eslint-disable no-undef */

/** Byte offset for writeHead Int32 in the ring buffer SharedArrayBuffer. */
const WRITE_HEAD_OFFSET_INDEX = 0;
/** Byte offset for readHead Int32 in the ring buffer SharedArrayBuffer. */
const READ_HEAD_OFFSET_INDEX = 1;
/** Byte offset where Float32 audio data begins. */
const DATA_BYTE_OFFSET = 8;

/**
 * Lightweight ring buffer view for use inside AudioWorklet.
 * Mirrors the layout of RingBuffer from ringBuffer.ts but in plain JS.
 */
class WorkletRingBuffer {
  /**
   * @param {SharedArrayBuffer} sab
   * @param {number} channels
   */
  constructor(sab, channels) {
    this._head = new Int32Array(sab, 0, 2);
    const floatCount =
      (sab.byteLength - DATA_BYTE_OFFSET) / Float32Array.BYTES_PER_ELEMENT;
    this._data = new Float32Array(sab, DATA_BYTE_OFFSET, floatCount);
    this._capacity = floatCount;
    this._mask = floatCount - 1;
    this._channels = channels;
  }

  /** @returns {number} samples available to read */
  get availableRead() {
    const w = Atomics.load(this._head, WRITE_HEAD_OFFSET_INDEX);
    const r = Atomics.load(this._head, READ_HEAD_OFFSET_INDEX);
    return (w - r + this._capacity) & this._mask;
  }

  /** @returns {number} samples that can be written */
  get availableWrite() {
    return this._capacity - 1 - this.availableRead;
  }

  /**
   * Write interleaved samples into the buffer.
   * @param {Float32Array} data
   * @param {number} frames
   * @returns {number} frames written
   */
  write(data, frames) {
    const samplesToWrite = frames * this._channels;
    const avail = this.availableWrite;
    const actual = Math.min(samplesToWrite, avail);
    if (actual === 0) return 0;

    let w = Atomics.load(this._head, WRITE_HEAD_OFFSET_INDEX);
    for (let i = 0; i < actual; i++) {
      this._data[w & this._mask] = data[i];
      w++;
    }
    Atomics.store(this._head, WRITE_HEAD_OFFSET_INDEX, w);
    return Math.floor(actual / this._channels);
  }

  /**
   * Read interleaved samples from the buffer.
   * @param {Float32Array} output
   * @param {number} frames
   * @returns {number} frames read
   */
  read(output, frames) {
    const samplesToRead = frames * this._channels;
    const avail = this.availableRead;
    const actual = Math.min(samplesToRead, avail);
    if (actual === 0) return 0;

    let r = Atomics.load(this._head, READ_HEAD_OFFSET_INDEX);
    for (let i = 0; i < actual; i++) {
      output[i] = this._data[r & this._mask];
      r++;
    }
    Atomics.store(this._head, READ_HEAD_OFFSET_INDEX, r);
    return Math.floor(actual / this._channels);
  }

  /** Reset heads to zero. */
  reset() {
    Atomics.store(this._head, WRITE_HEAD_OFFSET_INDEX, 0);
    Atomics.store(this._head, READ_HEAD_OFFSET_INDEX, 0);
  }
}

class VST3WorkletProcessor extends AudioWorkletProcessor {
  /**
   * @param {object} options
   * @param {object} options.processorOptions
   * @param {SharedArrayBuffer} options.processorOptions.inputSAB
   * @param {SharedArrayBuffer} options.processorOptions.outputSAB
   * @param {number} options.processorOptions.channels
   * @param {boolean} options.processorOptions.isEffect
   */
  constructor(options) {
    super();

    const opts = options.processorOptions || {};
    this._channels = opts.channels || 2;
    this._isEffect = opts.isEffect || false;
    this._disposed = false;
    this._dropoutCount = 0;

    // Input ring buffer: worklet writes captured input audio here (for effects)
    if (opts.inputSAB) {
      this._inputRing = new WorkletRingBuffer(opts.inputSAB, this._channels);
    } else {
      this._inputRing = null;
    }

    // Output ring buffer: worklet reads processed audio from here
    if (opts.outputSAB) {
      this._outputRing = new WorkletRingBuffer(opts.outputSAB, this._channels);
    } else {
      this._outputRing = null;
    }

    // Scratch buffer for interleaving/deinterleaving
    this._interleaved = new Float32Array(128 * this._channels);

    this.port.onmessage = (e) => {
      if (e.data.type === 'reset') {
        if (this._inputRing) this._inputRing.reset();
        if (this._outputRing) this._outputRing.reset();
        this._dropoutCount = 0;
      } else if (e.data.type === 'dispose') {
        this._disposed = true;
      }
    };
  }

  /**
   * @param {Float32Array[][]} inputs
   * @param {Float32Array[][]} outputs
   * @returns {boolean}
   */
  process(inputs, outputs) {
    if (this._disposed) return false;

    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const blockSize = output[0].length; // typically 128
    const channels = Math.min(this._channels, output.length);

    // 1. Write input audio to inputRingBuffer (for effects only)
    if (this._isEffect && this._inputRing && inputs[0] && inputs[0].length > 0) {
      const input = inputs[0];
      const inputChannels = Math.min(channels, input.length);

      // Interleave input channels
      for (let f = 0; f < blockSize; f++) {
        for (let ch = 0; ch < channels; ch++) {
          this._interleaved[f * channels + ch] =
            ch < inputChannels ? input[ch][f] : 0;
        }
      }

      this._inputRing.write(this._interleaved, blockSize);
    }

    // 2. Read processed audio from outputRingBuffer
    if (this._outputRing) {
      // Zero the scratch buffer
      this._interleaved.fill(0, 0, blockSize * channels);

      const framesRead = this._outputRing.read(this._interleaved, blockSize);

      if (framesRead < blockSize) {
        // Underrun: output silence for missing frames (already zeroed)
        this._dropoutCount++;
        this.port.postMessage({
          type: 'dropout',
          count: this._dropoutCount,
        });
      }

      // Deinterleave into output channels
      for (let f = 0; f < blockSize; f++) {
        for (let ch = 0; ch < channels; ch++) {
          output[ch][f] = this._interleaved[f * channels + ch];
        }
      }
    } else {
      // No output ring buffer — output silence
      for (let ch = 0; ch < channels; ch++) {
        output[ch].fill(0);
      }
    }

    return true;
  }
}

registerProcessor('vst3-worklet-processor', VST3WorkletProcessor);
