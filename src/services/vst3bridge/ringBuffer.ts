/**
 * Lock-free ring buffer for audio streaming — stub.
 *
 * The real implementation (a future work item) will use a
 * SharedArrayBuffer so the AudioWorklet thread and the main thread
 * can exchange samples without locks.
 */

/** A simple ring buffer interface for audio data. */
export interface RingBuffer {
  /** Write samples into the buffer. Returns number of frames written. */
  write(data: Float32Array): number;
  /** Read samples from the buffer. Returns number of frames read. */
  read(output: Float32Array): number;
  /** Number of frames currently available to read. */
  availableRead(): number;
  /** Number of frames of free space available for writing. */
  availableWrite(): number;
  /** Reset the buffer to empty. */
  reset(): void;
}

/**
 * Create a ring buffer with the given capacity in sample frames.
 *
 * Stub — returns a no-op placeholder.
 */
export function createRingBuffer(capacityFrames: number, channels: number): RingBuffer {
  const capacity = capacityFrames * channels;
  const buffer = new Float32Array(capacity);
  let readPos = 0;
  let writePos = 0;
  let count = 0;

  return {
    write(data: Float32Array): number {
      const toWrite = Math.min(data.length, capacity - count);
      for (let i = 0; i < toWrite; i++) {
        buffer[(writePos + i) % capacity] = data[i];
      }
      writePos = (writePos + toWrite) % capacity;
      count += toWrite;
      return toWrite;
    },
    read(output: Float32Array): number {
      const toRead = Math.min(output.length, count);
      for (let i = 0; i < toRead; i++) {
        output[i] = buffer[(readPos + i) % capacity];
      }
      readPos = (readPos + toRead) % capacity;
      count -= toRead;
      return toRead;
    },
    availableRead(): number {
      return count;
    },
    availableWrite(): number {
      return capacity - count;
    },
    reset(): void {
      readPos = 0;
      writePos = 0;
      count = 0;
    },
  };
}
