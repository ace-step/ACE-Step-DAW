/**
 * Lock-free Single-Producer Single-Consumer (SPSC) ring buffer for real-time
 * audio streaming between the main thread and AudioWorklet.
 *
 * SharedArrayBuffer layout:
 *   [0..3]  Int32 — write head (atomic, monotonically increasing)
 *   [4..7]  Int32 — read head (atomic, monotonically increasing)
 *   [8..]   Float32 — interleaved audio data ring
 *
 * Audio is stored interleaved: ch0_s0, ch1_s0, ch0_s1, ch1_s1, ...
 *
 * Heads are NOT masked on store — they grow monotonically. Masking is applied
 * only when indexing into the data array. This lets us distinguish "full"
 * (wr - rd === capacity) from "empty" (wr === rd) without wasting a slot.
 */

/** Index of the write-head Int32 in the header. */
const WRITE_HEAD_INDEX = 0;
/** Index of the read-head Int32 in the header. */
const READ_HEAD_INDEX = 1;
/** Byte size of the header (2 x Int32). */
const HEADER_BYTES = 8;

/**
 * Round up to the next power of 2. Returns n if already a power of 2.
 */
function nextPowerOf2(n: number): number {
  if (n <= 1) return 1;
  return 1 << (32 - Math.clz32(n - 1));
}

export class RingBuffer {
  /** Atomic read/write head views (indices 0 = writeHead, 1 = readHead). */
  private readonly _heads: Int32Array;
  /** Float32 view over the audio data portion of the SAB. */
  private readonly _data: Float32Array;
  /** The underlying SharedArrayBuffer. */
  private readonly _sab: SharedArrayBuffer;
  /** Capacity in frames (always a power of 2). */
  private readonly _capacity: number;
  /** Number of audio channels. */
  private readonly _channels: number;
  /** Bitmask for efficient modulo: capacity - 1. */
  private readonly _mask: number;

  private constructor(sab: SharedArrayBuffer, capacity: number, channels: number) {
    this._sab = sab;
    this._capacity = capacity;
    this._channels = channels;
    this._mask = capacity - 1;
    this._heads = new Int32Array(sab, 0, 2);
    this._data = new Float32Array(sab, HEADER_BYTES);
  }

  /**
   * Create a new ring buffer with the given capacity in frames (per channel).
   * Capacity is rounded up to the next power of 2.
   */
  static create(capacityFrames: number, channels: number): RingBuffer {
    const capacity = nextPowerOf2(capacityFrames);
    const byteLength = HEADER_BYTES + capacity * channels * Float32Array.BYTES_PER_ELEMENT;
    const sab = new SharedArrayBuffer(byteLength);
    return new RingBuffer(sab, capacity, channels);
  }

  /**
   * Wrap an existing SharedArrayBuffer (for use in AudioWorklet).
   * The SAB must have been created by `RingBuffer.create`.
   */
  static wrap(sab: SharedArrayBuffer, channels: number): RingBuffer {
    const dataBytes = sab.byteLength - HEADER_BYTES;
    const totalSamples = dataBytes / Float32Array.BYTES_PER_ELEMENT;
    const capacity = totalSamples / channels;
    return new RingBuffer(sab, capacity, channels);
  }

  /** The underlying SharedArrayBuffer (pass to AudioWorklet via port.postMessage). */
  get sharedBuffer(): SharedArrayBuffer {
    return this._sab;
  }

  /** Total capacity in frames. */
  get capacity(): number {
    return this._capacity;
  }

  /** Number of channels. */
  get channelCount(): number {
    return this._channels;
  }

  /** Number of frames available to read. */
  get availableRead(): number {
    const wr = Atomics.load(this._heads, WRITE_HEAD_INDEX);
    const rd = Atomics.load(this._heads, READ_HEAD_INDEX);
    return wr - rd;
  }

  /** Number of frames available to write. */
  get availableWrite(): number {
    return this._capacity - this.availableRead;
  }

  /**
   * Write interleaved audio frames.
   * @returns Number of frames actually written (may be less than requested if buffer is full).
   */
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

  /**
   * Read interleaved audio frames into buffer.
   * @returns Number of frames actually read (may be less than requested if buffer is empty).
   */
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

  /**
   * Write from separate per-channel arrays (deinterleaved).
   * @returns Number of frames actually written.
   */
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

  /**
   * Read into separate per-channel arrays (deinterleaved).
   * @returns Number of frames actually read.
   */
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
