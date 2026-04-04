/**
 * Lock-free Single-Producer Single-Consumer (SPSC) ring buffer for real-time
 * audio streaming between the main thread and AudioWorklet.
 *
 * Generalized from the VST3 bridge implementation for use by the DSP engine
 * infrastructure (Phase 1 of the Tone.js → AudioWorklet migration).
 *
 * SharedArrayBuffer layout:
 *   [0..3]  Int32 — write head (atomic, monotonically increasing)
 *   [4..7]  Int32 — read head (atomic, monotonically increasing)
 *   [8..]   Float32 — interleaved audio data ring
 *
 * Heads grow monotonically (never masked on store). Masking is applied only
 * when indexing into the data array, which distinguishes "full" from "empty"
 * without wasting a slot.
 */

const WRITE_HEAD_INDEX = 0;
const READ_HEAD_INDEX = 1;
const HEADER_BYTES = 8;

/** Round up to the next power of 2. Returns n if already a power of 2. */
export function nextPowerOf2(n: number): number {
  if (n <= 1) return 1;
  return 1 << (32 - Math.clz32(n - 1));
}

export class RingBuffer {
  private readonly _heads: Int32Array;
  private readonly _data: Float32Array;
  private readonly _sab: SharedArrayBuffer;
  private readonly _capacity: number;
  private readonly _channels: number;
  private readonly _mask: number;

  private constructor(sab: SharedArrayBuffer, capacity: number, channels: number) {
    this._sab = sab;
    this._capacity = capacity;
    this._channels = channels;
    this._mask = capacity - 1;
    this._heads = new Int32Array(sab, 0, 2);
    this._data = new Float32Array(sab, HEADER_BYTES);
  }

  /** Create a new ring buffer. Capacity is rounded up to next power of 2. */
  static create(capacityFrames: number, channels: number): RingBuffer {
    const capacity = nextPowerOf2(capacityFrames);
    const byteLength = HEADER_BYTES + capacity * channels * Float32Array.BYTES_PER_ELEMENT;
    const sab = new SharedArrayBuffer(byteLength);
    return new RingBuffer(sab, capacity, channels);
  }

  /** Wrap an existing SharedArrayBuffer (e.g. in AudioWorklet context). */
  static wrap(sab: SharedArrayBuffer, channels: number): RingBuffer {
    const dataBytes = sab.byteLength - HEADER_BYTES;
    const totalSamples = dataBytes / Float32Array.BYTES_PER_ELEMENT;
    const capacity = totalSamples / channels;
    return new RingBuffer(sab, capacity, channels);
  }

  /** Check if SharedArrayBuffer is available in this environment. */
  static isSupported(): boolean {
    return typeof SharedArrayBuffer !== 'undefined' && typeof Atomics !== 'undefined';
  }

  get sharedBuffer(): SharedArrayBuffer { return this._sab; }
  get capacity(): number { return this._capacity; }
  get channelCount(): number { return this._channels; }
  get channels(): number { return this._channels; }

  get availableRead(): number {
    const wr = Atomics.load(this._heads, WRITE_HEAD_INDEX);
    const rd = Atomics.load(this._heads, READ_HEAD_INDEX);
    return wr - rd;
  }

  get availableWrite(): number {
    return this._capacity - this.availableRead;
  }

  /** Write interleaved audio frames. Returns frames actually written. */
  write(data: Float32Array, frames: number): number {
    const toWrite = Math.min(frames, this.availableWrite);
    if (toWrite === 0) return 0;

    const wr = Atomics.load(this._heads, WRITE_HEAD_INDEX);
    const ch = this._channels;
    const mask = this._mask;

    for (let i = 0; i < toWrite; i++) {
      const ringIdx = ((wr + i) & mask) * ch;
      const srcIdx = i * ch;
      for (let c = 0; c < ch; c++) {
        this._data[ringIdx + c] = data[srcIdx + c];
      }
    }

    Atomics.store(this._heads, WRITE_HEAD_INDEX, wr + toWrite);
    return toWrite;
  }

  /** Read interleaved audio frames. Returns frames actually read. */
  read(output: Float32Array, frames: number): number {
    const toRead = Math.min(frames, this.availableRead);
    if (toRead === 0) return 0;

    const rd = Atomics.load(this._heads, READ_HEAD_INDEX);
    const ch = this._channels;
    const mask = this._mask;

    for (let i = 0; i < toRead; i++) {
      const ringIdx = ((rd + i) & mask) * ch;
      const dstIdx = i * ch;
      for (let c = 0; c < ch; c++) {
        output[dstIdx + c] = this._data[ringIdx + c];
      }
    }

    Atomics.store(this._heads, READ_HEAD_INDEX, rd + toRead);
    return toRead;
  }

  /** Write from separate per-channel arrays (deinterleaved). */
  writeDeinterleaved(channels: Float32Array[], frames: number): number {
    const toWrite = Math.min(frames, this.availableWrite);
    if (toWrite === 0) return 0;

    const wr = Atomics.load(this._heads, WRITE_HEAD_INDEX);
    const ch = this._channels;
    const mask = this._mask;

    for (let i = 0; i < toWrite; i++) {
      const ringIdx = ((wr + i) & mask) * ch;
      for (let c = 0; c < ch; c++) {
        this._data[ringIdx + c] = channels[c][i];
      }
    }

    Atomics.store(this._heads, WRITE_HEAD_INDEX, wr + toWrite);
    return toWrite;
  }

  /** Read into separate per-channel arrays (deinterleaved). */
  readDeinterleaved(channels: Float32Array[], frames: number): number {
    const toRead = Math.min(frames, this.availableRead);
    if (toRead === 0) return 0;

    const rd = Atomics.load(this._heads, READ_HEAD_INDEX);
    const ch = this._channels;
    const mask = this._mask;

    for (let i = 0; i < toRead; i++) {
      const ringIdx = ((rd + i) & mask) * ch;
      for (let c = 0; c < ch; c++) {
        channels[c][i] = this._data[ringIdx + c];
      }
    }

    Atomics.store(this._heads, READ_HEAD_INDEX, rd + toRead);
    return toRead;
  }

  /** Reset read and write heads to 0. */
  reset(): void {
    Atomics.store(this._heads, WRITE_HEAD_INDEX, 0);
    Atomics.store(this._heads, READ_HEAD_INDEX, 0);
  }
}
