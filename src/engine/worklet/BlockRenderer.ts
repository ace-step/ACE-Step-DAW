/**
 * BlockRenderer — Sample-accurate event splitting for AudioWorklet rendering.
 *
 * Splits scheduled events (note on/off, parameter changes, transport commands)
 * into 128-sample blocks aligned with AudioWorklet's process() calls.
 *
 * This ensures that events are applied at their exact sample positions,
 * rather than being quantized to block boundaries.
 */

/** A scheduled event with a sample-accurate timestamp. */
export interface ScheduledEvent {
  /** Sample position relative to the start of playback. */
  sampleTime: number;
  /** Event type identifier. */
  type: string;
  /** Event-specific payload. */
  data: unknown;
}

/** A block of events to be processed in a single AudioWorklet process() call. */
export interface RenderBlock {
  /** Start sample of this block (inclusive). */
  startSample: number;
  /** End sample of this block (exclusive). */
  endSample: number;
  /** Events that fall within this block, sorted by sampleTime. */
  events: ScheduledEvent[];
}

export interface TransportState {
  /** Current playback position in samples. */
  positionSamples: number;
  /** Whether transport is playing. */
  isPlaying: boolean;
  /** Tempo in BPM. */
  bpm: number;
  /** Sample rate. */
  sampleRate: number;
}

export class BlockRenderer {
  private _events: ScheduledEvent[] = [];
  private _position = 0;
  private _isPlaying = false;
  private _bpm = 120;
  private _sampleRate: number;

  constructor(sampleRate: number) {
    this._sampleRate = sampleRate;
  }

  get position(): number { return this._position; }
  get isPlaying(): boolean { return this._isPlaying; }
  get bpm(): number { return this._bpm; }

  /** Schedule an event at a specific sample position. */
  scheduleEvent(event: ScheduledEvent): void {
    // Insert in sorted order by sampleTime
    const idx = this._events.findIndex(e => e.sampleTime > event.sampleTime);
    if (idx === -1) {
      this._events.push(event);
    } else {
      this._events.splice(idx, 0, event);
    }
  }

  /** Schedule multiple events. */
  scheduleEvents(events: ScheduledEvent[]): void {
    for (const event of events) {
      this.scheduleEvent(event);
    }
  }

  /** Clear all scheduled events. */
  clearEvents(): void {
    this._events = [];
  }

  /** Start playback from a given sample position. */
  play(fromSample = 0): void {
    this._position = fromSample;
    this._isPlaying = true;
  }

  /** Stop playback. */
  stop(): void {
    this._isPlaying = false;
  }

  /** Seek to a sample position without changing play state. */
  seek(samplePosition: number): void {
    this._position = samplePosition;
  }

  /** Set tempo. */
  setTempo(bpm: number): void {
    this._bpm = bpm;
  }

  /** Get the current transport state. */
  getTransportState(): TransportState {
    return {
      positionSamples: this._position,
      isPlaying: this._isPlaying,
      bpm: this._bpm,
      sampleRate: this._sampleRate,
    };
  }

  /**
   * Advance by one block and return the events for that block.
   *
   * @param blockSize Number of samples in the block (typically 128).
   * @returns The render block with events falling in [position, position + blockSize).
   */
  nextBlock(blockSize: number): RenderBlock {
    const startSample = this._position;
    const endSample = startSample + blockSize;

    // When stopped, return empty block without consuming events
    if (!this._isPlaying) {
      return { startSample, endSample, events: [] };
    }

    // Collect events in this block's range
    const blockEvents: ScheduledEvent[] = [];
    let removeCount = 0;

    for (const event of this._events) {
      if (event.sampleTime >= endSample) break;
      if (event.sampleTime >= startSample) {
        blockEvents.push(event);
      }
      if (event.sampleTime < endSample) {
        removeCount++;
      }
    }

    // Remove consumed events
    if (removeCount > 0) {
      this._events.splice(0, removeCount);
    }

    // Advance position
    this._position = endSample;

    return {
      startSample,
      endSample,
      events: blockEvents,
    };
  }

  /**
   * Convert beat position to sample position.
   */
  beatsToSamples(beats: number): number {
    return Math.round((beats / this._bpm) * 60 * this._sampleRate);
  }

  /**
   * Convert sample position to beat position.
   */
  samplesToBeats(samples: number): number {
    return (samples / this._sampleRate) * (this._bpm / 60);
  }
}
