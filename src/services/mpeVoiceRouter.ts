/**
 * MpeVoiceRouter — routes per-note MPE expression to synth engine parameters.
 *
 * Converts MPE expression values (pitch bend, CC74 timbre, pressure)
 * to synth parameters (frequency multiplier, filter cutoff, gain).
 *
 * This service is the bridge between the MpeInputHandler (MIDI input) and
 * the synth engines (audio output). It tracks active notes per track and
 * provides parameter conversion functions.
 *
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/960
 */

import type { MpeNoteState } from './mpeService';

/** Default filter cutoff range for timbre mapping. */
const MIN_CUTOFF_HZ = 200;
const MAX_CUTOFF_HZ = 12000;

/** Base gain when no pressure is applied (MPE "at rest"). */
const BASE_GAIN = 0.7;
const MAX_GAIN = 1.0;

export class MpeVoiceRouter {
  /** Active MPE notes: trackId → Map<channelKey, MpeNoteState> */
  private _activeNotes = new Map<string, Map<string, MpeNoteState>>();

  // ── Parameter Conversion ──────────────────────────────────────

  /**
   * Convert MPE pitch bend value (-8192 to 8191) to frequency multiplier.
   * @param bendValue  Raw pitch bend value
   * @param rangeSemitones  Pitch bend range in semitones (e.g. 48)
   * @returns Frequency multiplier (1.0 = no change)
   */
  pitchBendToFrequencyMultiplier(bendValue: number, rangeSemitones: number): number {
    // Normalize to -1..+1
    const normalized = bendValue / 8192;
    // Convert to semitones
    const semitones = normalized * rangeSemitones;
    // Convert semitones to frequency ratio: 2^(semitones/12)
    return Math.pow(2, semitones / 12);
  }

  /**
   * Map CC74 timbre/slide value (0–127) to filter cutoff frequency.
   * Uses exponential mapping for perceptually linear response.
   */
  timbreToFilterCutoff(timbre: number): number {
    const normalized = timbre / 127;
    // Exponential mapping: low values near MIN_CUTOFF, high values near MAX_CUTOFF
    return MIN_CUTOFF_HZ * Math.pow(MAX_CUTOFF_HZ / MIN_CUTOFF_HZ, normalized);
  }

  /**
   * Map channel pressure/aftertouch (0–127) to gain multiplier.
   * Pressure adds dynamics on top of the base gain level.
   */
  pressureToGain(pressure: number): number {
    const normalized = pressure / 127;
    return BASE_GAIN + (MAX_GAIN - BASE_GAIN) * normalized;
  }

  // ── Note Tracking ─────────────────────────────────────────────

  private _noteKey(channel: number, pitch: number): string {
    return `${channel}:${pitch}`;
  }

  registerNote(trackId: string, noteState: MpeNoteState): void {
    if (!this._activeNotes.has(trackId)) {
      this._activeNotes.set(trackId, new Map());
    }
    this._activeNotes.get(trackId)!.set(
      this._noteKey(noteState.channel, noteState.pitch),
      { ...noteState },
    );
  }

  releaseNote(trackId: string, channel: number, pitch: number): void {
    this._activeNotes.get(trackId)?.delete(this._noteKey(channel, pitch));
  }

  getActiveNote(trackId: string, channel: number, pitch: number): MpeNoteState | undefined {
    return this._activeNotes.get(trackId)?.get(this._noteKey(channel, pitch));
  }

  getActiveNoteCount(trackId: string): number {
    return this._activeNotes.get(trackId)?.size ?? 0;
  }

  clearTrack(trackId: string): void {
    this._activeNotes.delete(trackId);
  }

  clearAll(): void {
    this._activeNotes.clear();
  }
}

/** Singleton instance used by the app. */
let _instance: MpeVoiceRouter | null = null;

export function getMpeVoiceRouter(): MpeVoiceRouter {
  if (!_instance) {
    _instance = new MpeVoiceRouter();
  }
  return _instance;
}
