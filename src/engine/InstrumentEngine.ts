/**
 * Unified interface for all instrument engines (subtractive synth, sampler, FM).
 *
 * Every instrument engine implementation must conform to this interface so that
 * playback, recording, and automation code can operate on any instrument kind
 * without branching on the concrete type.
 */
export interface InstrumentEngine {
  /** Trigger note-on for a track (for live playing / recording). */
  noteOn(trackId: string, pitch: number, velocity: number): void;

  /** Trigger note-off for a track. */
  noteOff(trackId: string, pitch: number): void;

  /** Play a note with a fixed duration (for sequenced playback). */
  triggerAttackRelease(trackId: string, pitch: number, duration: number, velocity: number): void;

  /**
   * Set an engine-specific parameter by name.
   *
   * This is a generic escape hatch for automation and preset changes.
   * Implementations may ignore unknown parameter names.
   */
  setParameter(trackId: string, name: string, value: number | string | boolean): void;

  /** Release all currently sounding notes across every track. */
  releaseAll(): void;

  /** Tear down resources associated with a single track. */
  removeTrack(trackId: string): void;

  /** Dispose the entire engine and release all resources. */
  dispose(): void;

  // ---------------------------------------------------------------------------
  // MPE (MIDI Polyphonic Expression) — optional per-voice control
  // ---------------------------------------------------------------------------

  /**
   * Apply pitch bend to a specific note on a track.
   * In MPE mode, this is per-note; in standard mode, it affects all notes.
   * @param semitones Pitch offset in semitones (can be fractional).
   * @param channel MIDI channel for per-voice routing (MPE).
   */
  pitchBend?(trackId: string, semitones: number, channel?: number): void;

  /**
   * Apply slide/timbre expression (CC74) to a note.
   * Typically mapped to filter cutoff or timbre control.
   * @param value Normalized 0-1.
   * @param channel MIDI channel for per-voice routing (MPE).
   */
  slide?(trackId: string, value: number, channel?: number): void;

  /**
   * Apply pressure/aftertouch expression to a note.
   * Typically mapped to dynamics, vibrato depth, or filter.
   * @param value Normalized 0-1.
   * @param channel MIDI channel for per-voice routing (MPE).
   */
  pressure?(trackId: string, value: number, channel?: number): void;
}
