/**
 * ParamBuffer — Atomic parameter transport between main thread and AudioWorklet.
 *
 * Uses a single SharedArrayBuffer for lock-free parameter updates. The main
 * thread writes Float32 parameter values and marks the corresponding Int32
 * dirty flag; the worklet reads the value and consumes the dirty flag during
 * process() calls.
 *
 * Layout:
 *   Int32Array[0..N-1]   — dirty flags (one per parameter slot)
 *   Float32Array[0..N-1] — parameter values, stored immediately after the
 *                          dirty-flag region in the same SharedArrayBuffer
 *
 * Precision/storage notes:
 *   - Parameter values are stored as Float32, which is sufficient for audio
 *     parameter transport and matches Web Audio AudioParam precision.
 *   - Atomics are used on the Int32 dirty-flag region; the float values
 *     are read/written via the Float32Array view. The dirty flag's
 *     Atomics.exchange provides a happens-before edge that ensures the
 *     float write is visible to the consuming thread.
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
   * The float write is followed by Atomics.store on the dirty flag, which
   * acts as a release fence — ensuring the float value is visible to any
   * thread that subsequently reads the dirty flag via Atomics.exchange/load.
   */
  set(index: number, value: number): void {
    this._params[index] = value;
    // Release: ensures the float write above is visible before dirty is set
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
