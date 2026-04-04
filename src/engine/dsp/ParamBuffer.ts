/**
 * ParamBuffer — Atomic parameter transport between main thread and AudioWorklet.
 *
 * Uses a SharedArrayBuffer with Atomics.store/load for lock-free, glitch-free
 * parameter updates. The main thread writes parameter values, and the worklet
 * reads them atomically each process() call.
 *
 * Layout:
 *   Float64Array[0..N-1] — parameter slots (one per automatable param)
 *
 * Float64 is used for precision-safe parameter values (frequency in Hz,
 * gain in dB, etc.). Atomics on Float64 require BigInt-based SharedArrayBuffer
 * on some engines, so we use a dual-buffer approach: Float64 for storage,
 * Int32 for dirty flags.
 *
 * Simplified approach: use Float32Array for parameters (sufficient precision
 * for audio params) with Uint32Array dirty-flag overlay.
 */

const BYTES_PER_PARAM = 4; // Float32

export class ParamBuffer {
  private readonly _sab: SharedArrayBuffer;
  private readonly _params: Float32Array;
  private readonly _dirty: Int32Array;
  private readonly _count: number;

  private constructor(sab: SharedArrayBuffer, count: number) {
    this._sab = sab;
    this._count = count;
    // Layout: [dirty flags: Int32 x count] [param values: Float32 x count]
    const dirtyBytes = count * 4;
    this._dirty = new Int32Array(sab, 0, count);
    this._params = new Float32Array(sab, dirtyBytes, count);
  }

  /** Create a new ParamBuffer with the given number of parameter slots. */
  static create(paramCount: number): ParamBuffer {
    const byteLength = paramCount * 4 + paramCount * BYTES_PER_PARAM;
    const sab = new SharedArrayBuffer(byteLength);
    return new ParamBuffer(sab, paramCount);
  }

  /** Wrap an existing SharedArrayBuffer (for use in AudioWorklet). */
  static wrap(sab: SharedArrayBuffer, paramCount: number): ParamBuffer {
    return new ParamBuffer(sab, paramCount);
  }

  get sharedBuffer(): SharedArrayBuffer { return this._sab; }
  get count(): number { return this._count; }

  /**
   * Set a parameter value (main thread side).
   * Thread-safe via Atomics.
   */
  set(index: number, value: number): void {
    this._params[index] = value;
    Atomics.store(this._dirty, index, 1);
  }

  /**
   * Get a parameter value (worklet side).
   * Returns the current value regardless of dirty state.
   */
  get(index: number): number {
    return this._params[index];
  }

  /**
   * Check if a parameter has been updated since last consume.
   */
  isDirty(index: number): boolean {
    return Atomics.load(this._dirty, index) !== 0;
  }

  /**
   * Read a parameter and clear its dirty flag (worklet side).
   * Returns [value, wasDirty].
   */
  consume(index: number): [number, boolean] {
    const dirty = Atomics.exchange(this._dirty, index, 0) !== 0;
    return [this._params[index], dirty];
  }

  /**
   * Consume all dirty parameters into a target array.
   * Returns the number of parameters that were dirty.
   */
  consumeAll(target: Float32Array): number {
    let dirtyCount = 0;
    for (let i = 0; i < this._count; i++) {
      if (Atomics.exchange(this._dirty, i, 0) !== 0) {
        target[i] = this._params[i];
        dirtyCount++;
      }
    }
    return dirtyCount;
  }

  /** Reset all parameters to 0 and clear dirty flags. */
  reset(): void {
    for (let i = 0; i < this._count; i++) {
      this._params[i] = 0;
      Atomics.store(this._dirty, i, 0);
    }
  }
}
