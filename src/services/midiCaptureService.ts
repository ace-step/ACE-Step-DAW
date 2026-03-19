/**
 * MidiCaptureService — always-on rolling MIDI buffer for retroactive capture.
 *
 * Records incoming MIDI events per track into a fixed-size ring buffer.
 * When the user triggers "Capture", the buffer is drained into a new MIDI clip
 * on the target track, aligned to bar boundaries.
 */

export interface CapturedMidiEvent {
  pitch: number;
  velocity: number;
  /** Absolute time in seconds when noteOn fired. */
  timeOn: number;
  /** Absolute time in seconds when noteOff fired (0 if still held). */
  timeOff: number;
}

/** Maximum buffer duration in seconds (default: 4 minutes). */
const DEFAULT_MAX_BUFFER_DURATION = 240;

export class MidiCaptureService {
  /** Per-track rolling buffers: trackId → events[] */
  private buffers = new Map<string, CapturedMidiEvent[]>();
  /** Active (held) notes per track: trackId → Map<pitch, event> */
  private activeNotes = new Map<string, Map<number, CapturedMidiEvent>>();
  private maxBufferDuration: number;

  constructor(maxBufferDuration = DEFAULT_MAX_BUFFER_DURATION) {
    this.maxBufferDuration = maxBufferDuration;
  }

  /** Record a noteOn event into the rolling buffer for a track. */
  noteOn(trackId: string, pitch: number, velocity: number, time: number): void {
    const event: CapturedMidiEvent = { pitch, velocity, timeOn: time, timeOff: 0 };

    if (!this.activeNotes.has(trackId)) {
      this.activeNotes.set(trackId, new Map());
    }
    this.activeNotes.get(trackId)!.set(pitch, event);

    if (!this.buffers.has(trackId)) {
      this.buffers.set(trackId, []);
    }
    this.buffers.get(trackId)!.push(event);
  }

  /** Record a noteOff event — completes the matching noteOn. */
  noteOff(trackId: string, pitch: number, time: number): void {
    const active = this.activeNotes.get(trackId);
    if (!active) return;
    const event = active.get(pitch);
    if (event) {
      event.timeOff = time;
      active.delete(pitch);
    }
  }

  /** Prune events older than maxBufferDuration from a given reference time. */
  prune(referenceTime: number): void {
    const cutoff = referenceTime - this.maxBufferDuration;
    for (const [trackId, events] of this.buffers) {
      const pruned = events.filter((e) => {
        const endTime = e.timeOff > 0 ? e.timeOff : referenceTime;
        return endTime > cutoff;
      });
      if (pruned.length === 0) {
        this.buffers.delete(trackId);
      } else {
        this.buffers.set(trackId, pruned);
      }
    }
  }

  /** Get the raw buffer for a track. */
  getBuffer(trackId: string): CapturedMidiEvent[] {
    return this.buffers.get(trackId) ?? [];
  }

  /** Check if there are any events in the buffer for a track. */
  hasEvents(trackId: string): boolean {
    const buf = this.buffers.get(trackId);
    return !!buf && buf.length > 0;
  }

  /**
   * Drain the last `bars` bars of MIDI from the buffer for a given track.
   * Returns events with times converted to beat-relative offsets from the
   * clip start. Closes any still-held notes at captureTime.
   */
  drain(
    trackId: string,
    captureTime: number,
    bpm: number,
    timeSignature: number,
    bars: number,
  ): { notes: Array<{ pitch: number; velocity: number; startBeat: number; durationBeats: number }>; clipStartTime: number; clipDuration: number } | null {
    const events = this.buffers.get(trackId);
    if (!events || events.length === 0) return null;

    const beatsPerBar = timeSignature;
    const secondsPerBeat = 60 / bpm;
    const barDuration = beatsPerBar * secondsPerBeat;
    const captureDuration = bars * barDuration;

    // Determine clip boundaries snapped to bar start
    const captureStart = Math.max(0, captureTime - captureDuration);
    // Snap captureStart down to the nearest bar
    const clipStartTime = Math.floor(captureStart / barDuration) * barDuration;
    const clipEndTime = clipStartTime + bars * barDuration;
    const clipDuration = clipEndTime - clipStartTime;

    // Close any held notes at capture time
    const activeForTrack = this.activeNotes.get(trackId);
    if (activeForTrack) {
      for (const event of activeForTrack.values()) {
        if (event.timeOff === 0) {
          event.timeOff = captureTime;
        }
      }
      activeForTrack.clear();
    }

    // Filter events in range and convert to beat-relative
    const notes: Array<{ pitch: number; velocity: number; startBeat: number; durationBeats: number }> = [];
    for (const e of events) {
      const noteEnd = e.timeOff > 0 ? e.timeOff : captureTime;
      // Skip notes that are entirely outside the capture window
      if (noteEnd <= clipStartTime || e.timeOn >= clipEndTime) continue;

      const clampedStart = Math.max(e.timeOn, clipStartTime);
      const clampedEnd = Math.min(noteEnd, clipEndTime);
      const durationSec = clampedEnd - clampedStart;
      if (durationSec <= 0) continue;

      const startBeat = (clampedStart - clipStartTime) / secondsPerBeat;
      const durationBeats = durationSec / secondsPerBeat;

      notes.push({
        pitch: e.pitch,
        velocity: e.velocity,
        startBeat: Math.round(startBeat * 1000) / 1000, // 3 decimal places
        durationBeats: Math.round(durationBeats * 1000) / 1000,
      });
    }

    if (notes.length === 0) return null;

    // Clear the buffer for this track after drain
    this.buffers.delete(trackId);

    return { notes, clipStartTime, clipDuration };
  }

  /** Clear the buffer for a specific track. */
  clearTrack(trackId: string): void {
    this.buffers.delete(trackId);
    this.activeNotes.delete(trackId);
  }

  /** Clear all buffers. */
  clearAll(): void {
    this.buffers.clear();
    this.activeNotes.clear();
  }

  /** Get all track IDs that have buffered events. */
  getActiveTrackIds(): string[] {
    return [...this.buffers.keys()].filter((id) => this.hasEvents(id));
  }
}

/** Singleton instance used by the app. */
let _instance: MidiCaptureService | null = null;

export function getMidiCaptureService(): MidiCaptureService {
  if (!_instance) {
    _instance = new MidiCaptureService();
  }
  return _instance;
}

/** Replace the singleton (for testing). */
export function setMidiCaptureService(service: MidiCaptureService): void {
  _instance = service;
}
