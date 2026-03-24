/**
 * Lock-free Single-Producer Single-Consumer (SPSC) ring buffer
 * backed by SharedArrayBuffer for cross-thread audio streaming.
 *
 * Memory layout:
 *   [0..3]  Int32  writeHead (atomic)
 *   [4..7]  Int32  readHead  (atomic)
 *   [8..]   Float32 interleaved audio data
 *
 * Capacity is always a power of 2 for efficient modular arithmetic.
 */

/** Byte offset where Float32 audio data begins. */
const DATA_OFFSET = 8;
/** Int32Array index for the write head. */
const WRITE_HEAD_INDEX = 0;
/** Int32Array index for the read head. */
const READ_HEAD_INDEX = 1;

/**
 * Return the next power of 2 >= n.
 */
function nextPowerOf2(n: number): number {
  if (n <= 0) return 1;
  let v = n - 1;
  v |= v >> 1;
  v |= v >> 2;
  v |= v >> 4;
  v |= v >> 8;
  v |= v >> 16;
  return v + 1;
}

export class RingBuffer {
  private readonly _sab: SharedArrayBuffer;
  private readonly _head: Int32Array;
  private readonly _data: Float32Array;
  private readonly _capacity: number; // in total float samples (frames * channels)
  private readonly _mask: number;
  private readonly _channels: number;

  private constructor(sab: SharedArrayBuffer, channels: number) {
    this._sab = sab;
    this._channels = channels;
    this._head = new Int32Array(sab, 0, 2); // writeHead at [0], readHead at [1]
    const floatCount = (sab.byteLength - DATA_OFFSET) / Float32Array.BYTES_PER_ELEMENT;
    this._data = new Float32Array(sab, DATA_OFFSET, floatCount);
    this._capacity = floatCount;
    this._mask = floatCount - 1;
  }

  /**
   * Create a new ring buffer with the given capacity in frames and channel count.
   * Capacity is rounded up to the next power of 2 (in total samples = frames * channels).
   */
  static create(frames: number, channels: number): RingBuffer {
    const totalSamples = nextPowerOf2(frames * channels);
    const byteLength = DATA_OFFSET + totalSamples * Float32Array.BYTES_PER_ELEMENT;
    const sab = new SharedArrayBuffer(byteLength);
    return new RingBuffer(sab, channels);
  }

  /**
   * Wrap an existing SharedArrayBuffer as a ring buffer.
   * Used on the receiving side (e.g., worklet) to attach to an already-created buffer.
   */
  static wrap(sab: SharedArrayBuffer, channels: number): RingBuffer {
    return new RingBuffer(sab, channels);
  }

  /**
   * Number of samples available to read.
   */
  get availableRead(): number {
    const w = Atomics.load(this._head, WRITE_HEAD_INDEX);
    const r = Atomics.load(this._head, READ_HEAD_INDEX);
    return (w - r + this._capacity) & this._mask;
  }

  /**
   * Number of samples that can be written without overwriting unread data.
   * We keep one slot empty to distinguish full from empty.
   */
  get availableWrite(): number {
    return this._capacity - 1 - this.availableRead;
  }

  /**
   * Write interleaved audio samples into the ring buffer.
   * @param data - Float32Array of interleaved samples
   * @param frames - Number of frames to write
   * @returns Number of frames actually written
   */
  write(data: Float32Array, frames: number): number {
    const samplesToWrite = frames * this._channels;
    const avail = this.availableWrite;
    const actualSamples = Math.min(samplesToWrite, avail);
    if (actualSamples === 0) return 0;

    let w = Atomics.load(this._head, WRITE_HEAD_INDEX);

    for (let i = 0; i < actualSamples; i++) {
      this._data[w & this._mask] = data[i];
      w++;
    }

    Atomics.store(this._head, WRITE_HEAD_INDEX, w);
    return Math.floor(actualSamples / this._channels);
  }

  /**
   * Read interleaved audio samples from the ring buffer.
   * @param output - Float32Array to write into
   * @param frames - Number of frames to read
   * @returns Number of frames actually read
   */
  read(output: Float32Array, frames: number): number {
    const samplesToRead = frames * this._channels;
    const avail = this.availableRead;
    const actualSamples = Math.min(samplesToRead, avail);
    if (actualSamples === 0) return 0;

    let r = Atomics.load(this._head, READ_HEAD_INDEX);

    for (let i = 0; i < actualSamples; i++) {
      output[i] = this._data[r & this._mask];
      r++;
    }

    Atomics.store(this._head, READ_HEAD_INDEX, r);
    return Math.floor(actualSamples / this._channels);
  }

  /**
   * Reset read and write heads to 0.
   */
  reset(): void {
    Atomics.store(this._head, WRITE_HEAD_INDEX, 0);
    Atomics.store(this._head, READ_HEAD_INDEX, 0);
  }

  /**
   * The underlying SharedArrayBuffer, for passing to other threads.
   */
  get sharedBuffer(): SharedArrayBuffer {
    return this._sab;
  }

  /**
   * Total capacity in samples (frames * channels).
   */
  get capacity(): number {
    return this._capacity;
  }

  /**
   * Number of audio channels.
   */
  get channels(): number {
    return this._channels;
  }
}
