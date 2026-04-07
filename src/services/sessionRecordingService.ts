/**
 * SessionRecordingService — coordinates recording audio and MIDI
 * into session clip slots.
 *
 * Manages recording lifecycle:
 * - Start recording on an armed track's empty slot
 * - Capture MIDI events in real-time
 * - Stop recording and produce clip data
 * - Fixed-length recording with automatic stop
 * - MIDI overdub mode for layering notes on loop
 * - Count-in before recording starts
 */

export interface MidiNoteRecord {
  pitch: number;
  velocity: number;
  /** Beat offset from clip start. */
  startBeat: number;
  /** Duration in beats. */
  durationBeats: number;
}

export interface SessionRecordingState {
  slotId: string;
  trackId: string;
  trackType: string;
  isRecording: boolean;
  startTime: number;
  bpm: number;
  timeSignature: number;
}

export interface RecordingResult {
  slotId: string;
  trackId: string;
  trackType: string;
  /** Clip duration in seconds. */
  clipDuration: number;
  /** MIDI notes (for pianoRoll/sequencer tracks). */
  midiNotes?: MidiNoteRecord[];
  /** Audio blob (for audio tracks). */
  audioBlob?: Blob;
}

interface StartRecordingParams {
  slotId: string;
  trackId: string;
  trackType: string;
  bpm: number;
  timeSignature: number;
}

interface ActiveMidiNote {
  pitch: number;
  velocity: number;
  startTime: number;
}

interface RecordedMidiEvent {
  pitch: number;
  velocity: number;
  startTime: number;
  endTime: number;
}

export class SessionRecordingService {
  private activeRecordings = new Map<string, SessionRecordingState>();
  private midiEvents = new Map<string, RecordedMidiEvent[]>();
  private activeNotes = new Map<string, Map<number, ActiveMidiNote>>();
  private fixedLengthBars: number | null = null;
  private overdubMode = false;
  private countInBars = 0;

  /** Start recording in a session slot. */
  startRecording(params: StartRecordingParams): void {
    if (this.activeRecordings.has(params.slotId)) {
      throw new Error(`Already recording in slot ${params.slotId}`);
    }

    const state: SessionRecordingState = {
      slotId: params.slotId,
      trackId: params.trackId,
      trackType: params.trackType,
      isRecording: true,
      startTime: performance.now() / 1000,
      bpm: params.bpm,
      timeSignature: params.timeSignature,
    };

    this.activeRecordings.set(params.slotId, state);
    this.midiEvents.set(params.slotId, []);
    this.activeNotes.set(params.slotId, new Map());
  }

  /** Stop recording in a slot and return captured data. */
  stopRecording(slotId: string): RecordingResult | null {
    const state = this.activeRecordings.get(slotId);
    if (!state) return null;

    const stopTime = performance.now() / 1000;
    const secondsPerBeat = 60 / state.bpm;
    const barDuration = state.timeSignature * secondsPerBeat;

    // Auto-close any held notes at stop time
    const active = this.activeNotes.get(slotId);
    if (active) {
      for (const [, note] of active.entries()) {
        const events = this.midiEvents.get(slotId) ?? [];
        // Ensure endTime is never before startTime (min 1ms note)
        const noteEnd = Math.max(stopTime, note.startTime + 0.001);
        events.push({
          pitch: note.pitch,
          velocity: note.velocity,
          startTime: note.startTime,
          endTime: noteEnd,
        });
        this.midiEvents.set(slotId, events);
      }
      active.clear();
    }

    // Calculate clip duration
    let clipDuration: number;
    if (this.fixedLengthBars !== null) {
      clipDuration = this.fixedLengthBars * barDuration;
    } else {
      const elapsed = stopTime - state.startTime;
      // Snap up to the nearest bar boundary (minimum 1 bar)
      const bars = Math.max(1, Math.ceil(elapsed / barDuration));
      clipDuration = bars * barDuration;
    }

    // Convert MIDI events to beat-relative notes
    const rawEvents = this.midiEvents.get(slotId) ?? [];
    const midiNotes: MidiNoteRecord[] = rawEvents.map((e) => {
      const relativeStart = e.startTime - state.startTime;
      const relativeEnd = e.endTime - state.startTime;
      const startBeat = relativeStart / secondsPerBeat;
      const durationBeats = (relativeEnd - e.startTime + state.startTime - e.startTime) / secondsPerBeat;
      return {
        pitch: e.pitch,
        velocity: e.velocity,
        startBeat: Math.round(startBeat * 1000) / 1000,
        durationBeats: Math.round(((relativeEnd - relativeStart) / secondsPerBeat) * 1000) / 1000,
      };
    });

    // Cleanup
    this.activeRecordings.delete(slotId);
    this.midiEvents.delete(slotId);
    this.activeNotes.delete(slotId);

    return {
      slotId,
      trackId: state.trackId,
      trackType: state.trackType,
      clipDuration,
      midiNotes,
    };
  }

  /** Record a MIDI note-on event. */
  addMidiNote(slotId: string, pitch: number, velocity: number, timestamp: number): void {
    const active = this.activeNotes.get(slotId);
    if (!active) return;
    active.set(pitch, { pitch, velocity, startTime: timestamp });
  }

  /** Record a MIDI note-off event. */
  endMidiNote(slotId: string, pitch: number, timestamp: number): void {
    const active = this.activeNotes.get(slotId);
    if (!active) return;

    const note = active.get(pitch);
    if (!note) return;

    const events = this.midiEvents.get(slotId) ?? [];
    events.push({
      pitch: note.pitch,
      velocity: note.velocity,
      startTime: note.startTime,
      endTime: timestamp,
    });
    this.midiEvents.set(slotId, events);
    active.delete(pitch);
  }

  /** Get all active recording states. */
  getActiveRecordings(): Record<string, SessionRecordingState> {
    return Object.fromEntries(this.activeRecordings);
  }

  /** Check if a specific slot is recording. */
  isSlotRecording(slotId: string): boolean {
    return this.activeRecordings.has(slotId);
  }

  /** Stop all active recordings and return results. */
  stopAll(): RecordingResult[] {
    const results: RecordingResult[] = [];
    for (const slotId of [...this.activeRecordings.keys()]) {
      const result = this.stopRecording(slotId);
      if (result) results.push(result);
    }
    return results;
  }

  // --- Fixed-length recording ---

  setFixedLengthBars(bars: number | null): void {
    this.fixedLengthBars = bars;
  }

  getFixedLengthBars(): number | null {
    return this.fixedLengthBars;
  }

  // --- Overdub mode ---

  setOverdubMode(enabled: boolean): void {
    this.overdubMode = enabled;
  }

  isOverdubMode(): boolean {
    return this.overdubMode;
  }

  // --- Count-in ---

  setCountInBars(bars: number): void {
    this.countInBars = Math.max(0, Math.min(4, bars));
  }

  getCountInBars(): number {
    return this.countInBars;
  }
}

// Singleton instance
let _instance: SessionRecordingService | null = null;

export function getSessionRecordingService(): SessionRecordingService {
  if (!_instance) {
    _instance = new SessionRecordingService();
  }
  return _instance;
}
