/**
 * Engine Worklet Processor — AudioWorklet-side audio processing.
 *
 * This processor runs in the AudioWorklet thread and communicates with
 * the main thread via SharedArrayBuffer ring buffers and MessagePort commands.
 *
 * Architecture:
 *   Main Thread (EngineWorkletHost)
 *     ↕ MessagePort (commands: play, stop, seek)
 *     ↕ SharedArrayBuffer (audio ring buffer, param buffer)
 *   AudioWorklet Thread (this processor)
 *     ↕ AudioContext.destination
 *
 * Phase 1: Pass-through processor that validates the infrastructure.
 * Future phases will add DSP rendering here.
 */

/* eslint-disable no-undef */

// ─── Ring Buffer (mirrors src/engine/dsp/RingBuffer.ts) ─────────────────────

const WRITE_HEAD_INDEX = 0;
const READ_HEAD_INDEX = 1;
const HEADER_BYTES = 8;

class WorkletRingBuffer {
  constructor(sab, channels) {
    this._heads = new Int32Array(sab, 0, 2);
    this._data = new Float32Array(sab, HEADER_BYTES);
    const dataBytes = sab.byteLength - HEADER_BYTES;
    const totalSamples = dataBytes / Float32Array.BYTES_PER_ELEMENT;
    this._capacity = totalSamples / channels;
    this._channels = channels;
    this._mask = this._capacity - 1;
  }

  get availableRead() {
    return Atomics.load(this._heads, WRITE_HEAD_INDEX) -
           Atomics.load(this._heads, READ_HEAD_INDEX);
  }

  readDeinterleaved(channelArrays, frames) {
    const toRead = Math.min(frames, this.availableRead);
    if (toRead === 0) return 0;

    const rd = Atomics.load(this._heads, READ_HEAD_INDEX);
    const ch = this._channels;
    const mask = this._mask;

    for (let i = 0; i < toRead; i++) {
      const ringIdx = ((rd + i) & mask) * ch;
      for (let c = 0; c < ch; c++) {
        channelArrays[c][i] = this._data[ringIdx + c];
      }
    }

    Atomics.store(this._heads, READ_HEAD_INDEX, rd + toRead);
    return toRead;
  }
}

// ─── Param Buffer (mirrors src/engine/dsp/ParamBuffer.ts) ───────────────────

class WorkletParamBuffer {
  constructor(sab, count) {
    this._dirty = new Int32Array(sab, 0, count);
    this._params = new Float32Array(sab, count * 4, count);
    this._count = count;
  }

  consume(index) {
    const dirty = Atomics.exchange(this._dirty, index, 0) !== 0;
    return [this._params[index], dirty];
  }

  get(index) {
    return this._params[index];
  }
}

// ─── Processor ──────────────────────────────────────────────────────────────

class EngineWorkletProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    /** @type {WorkletRingBuffer | null} */
    this._audioBuffer = null;
    /** @type {WorkletParamBuffer | null} */
    this._paramBuffer = null;
    /** @type {'stopped' | 'playing'} */
    this._state = 'stopped';
    /** @type {number} */
    this._dropoutCount = 0;
    /** @type {number} */
    this._channels = options.processorOptions?.channels ?? 2;

    this.port.onmessage = (e) => this._handleMessage(e.data);
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case 'init': {
        if (msg.audioSab) {
          this._audioBuffer = new WorkletRingBuffer(msg.audioSab, this._channels);
        }
        if (msg.paramSab && typeof msg.paramCount === 'number') {
          this._paramBuffer = new WorkletParamBuffer(msg.paramSab, msg.paramCount);
        }
        this.port.postMessage({ type: 'ready' });
        break;
      }
      case 'play':
        this._state = 'playing';
        break;
      case 'stop':
        this._state = 'stopped';
        break;
      case 'get-dropout-count':
        this.port.postMessage({
          type: 'dropout-count',
          count: this._dropoutCount,
        });
        break;
    }
  }

  process(_inputs, outputs, _parameters) {
    const output = outputs[0];
    if (!output || output.length === 0) return true;

    const blockSize = output[0].length; // typically 128
    const channels = Math.min(this._channels, output.length);

    if (this._state !== 'playing' || !this._audioBuffer) {
      // Output silence when stopped or not initialized
      for (let ch = 0; ch < output.length; ch++) {
        output[ch].fill(0);
      }
      return true;
    }

    // Read audio from ring buffer (clamped to actual output channels)
    const channelArrays = output.slice(0, channels);
    const framesRead = this._audioBuffer.readDeinterleaved(channelArrays, blockSize);

    if (framesRead < blockSize) {
      // Underrun — fill remaining with silence
      this._dropoutCount++;
      for (let ch = 0; ch < output.length; ch++) {
        for (let i = framesRead; i < blockSize; i++) {
          output[ch][i] = 0;
        }
      }
      // Report dropout to main thread
      this.port.postMessage({
        type: 'dropout',
        count: this._dropoutCount,
        deficit: blockSize - framesRead,
      });
    }

    return true;
  }
}

registerProcessor('engine-worklet-processor', EngineWorkletProcessor);
