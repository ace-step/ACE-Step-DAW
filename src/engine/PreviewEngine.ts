/**
 * PreviewEngine — Sound preview/audition for browsing instrument presets.
 *
 * Plays short MIDI patterns through a temporary synth instance so users
 * can hear how a preset sounds before applying it to a track.
 *
 * Design:
 * - Lazy-creates a dedicated synth + gain node (not routed through any track)
 * - Plays category-matched patterns (arpeggios for leads, chords for pads, etc.)
 * - Respects project BPM for timing
 * - Auto-stops when a new preview starts or component unmounts
 *
 * Phase 5G migration: uses NativeSynths (NativePolySynth / NativeFMSynth) +
 * raw GainNode — no Tone.js dependency. PluckSynth's plucky timbre is
 * approximated with a short-envelope NativePolySynth (good enough for a
 * <= ~8-beat audition).
 */
import { NativePolySynth, NativeFMSynth } from './dsp/NativeSynths';
import type { IDSPPolySynth, IDSPFMSynth } from './dsp/interfaces';
import { getAudioEngine } from '../hooks/useAudioEngine';
import { midiToNoteName } from '../utils/pitch';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreviewNote {
  pitch: number;      // MIDI note 0-127
  velocity: number;   // MIDI velocity 1-127
  duration: number;   // duration in beats
  startBeat: number;  // start time in beats from pattern start
}

export interface PreviewPattern {
  name: string;
  notes: PreviewNote[];
}

// ---------------------------------------------------------------------------
// Category-matched preview patterns
// ---------------------------------------------------------------------------

/** Bass: simple root-fifth bass line in low register */
const BASS_PATTERN: PreviewPattern = {
  name: 'bass',
  notes: [
    { pitch: 36, velocity: 110, duration: 0.75, startBeat: 0 },
    { pitch: 36, velocity: 90, duration: 0.5, startBeat: 1 },
    { pitch: 43, velocity: 100, duration: 0.75, startBeat: 2 },
    { pitch: 36, velocity: 105, duration: 0.5, startBeat: 3 },
    { pitch: 48, velocity: 95, duration: 0.75, startBeat: 4 },
    { pitch: 43, velocity: 85, duration: 0.5, startBeat: 5 },
    { pitch: 36, velocity: 110, duration: 1.0, startBeat: 6 },
  ],
};

/** Lead: ascending melodic phrase in mid register */
const LEAD_PATTERN: PreviewPattern = {
  name: 'lead',
  notes: [
    { pitch: 60, velocity: 100, duration: 0.5, startBeat: 0 },
    { pitch: 64, velocity: 105, duration: 0.5, startBeat: 0.5 },
    { pitch: 67, velocity: 110, duration: 0.5, startBeat: 1 },
    { pitch: 72, velocity: 115, duration: 1.0, startBeat: 1.5 },
    { pitch: 71, velocity: 100, duration: 0.5, startBeat: 3 },
    { pitch: 67, velocity: 95, duration: 0.5, startBeat: 3.5 },
    { pitch: 64, velocity: 90, duration: 0.5, startBeat: 4 },
    { pitch: 60, velocity: 100, duration: 1.5, startBeat: 4.5 },
  ],
};

/** Pad: sustained chords */
const PAD_PATTERN: PreviewPattern = {
  name: 'pad',
  notes: [
    // C major chord
    { pitch: 48, velocity: 80, duration: 3.5, startBeat: 0 },
    { pitch: 55, velocity: 75, duration: 3.5, startBeat: 0 },
    { pitch: 60, velocity: 70, duration: 3.5, startBeat: 0 },
    { pitch: 64, velocity: 65, duration: 3.5, startBeat: 0 },
    // Am chord
    { pitch: 45, velocity: 80, duration: 3.5, startBeat: 4 },
    { pitch: 52, velocity: 75, duration: 3.5, startBeat: 4 },
    { pitch: 57, velocity: 70, duration: 3.5, startBeat: 4 },
    { pitch: 60, velocity: 65, duration: 3.5, startBeat: 4 },
  ],
};

/** Pluck: fast arpeggio */
const PLUCK_PATTERN: PreviewPattern = {
  name: 'pluck',
  notes: [
    { pitch: 60, velocity: 100, duration: 0.25, startBeat: 0 },
    { pitch: 64, velocity: 95, duration: 0.25, startBeat: 0.25 },
    { pitch: 67, velocity: 90, duration: 0.25, startBeat: 0.5 },
    { pitch: 72, velocity: 100, duration: 0.25, startBeat: 0.75 },
    { pitch: 67, velocity: 90, duration: 0.25, startBeat: 1 },
    { pitch: 64, velocity: 95, duration: 0.25, startBeat: 1.25 },
    { pitch: 60, velocity: 100, duration: 0.25, startBeat: 1.5 },
    { pitch: 55, velocity: 90, duration: 0.25, startBeat: 1.75 },
    { pitch: 60, velocity: 100, duration: 0.25, startBeat: 2 },
    { pitch: 64, velocity: 95, duration: 0.25, startBeat: 2.25 },
    { pitch: 67, velocity: 90, duration: 0.25, startBeat: 2.5 },
    { pitch: 72, velocity: 100, duration: 0.5, startBeat: 2.75 },
  ],
};

/** FX: sparse atmospheric notes with velocity variation */
const FX_PATTERN: PreviewPattern = {
  name: 'fx',
  notes: [
    { pitch: 60, velocity: 70, duration: 2.0, startBeat: 0 },
    { pitch: 72, velocity: 50, duration: 1.5, startBeat: 1 },
    { pitch: 65, velocity: 60, duration: 2.0, startBeat: 3 },
    { pitch: 77, velocity: 45, duration: 1.5, startBeat: 5 },
  ],
};

/** Keys: two-hand piano pattern */
const KEYS_PATTERN: PreviewPattern = {
  name: 'keys',
  notes: [
    // Left hand
    { pitch: 48, velocity: 85, duration: 1.0, startBeat: 0 },
    { pitch: 52, velocity: 80, duration: 1.0, startBeat: 0 },
    // Right hand melody
    { pitch: 60, velocity: 95, duration: 0.5, startBeat: 0 },
    { pitch: 64, velocity: 90, duration: 0.5, startBeat: 0.5 },
    { pitch: 67, velocity: 100, duration: 1.0, startBeat: 1 },
    // Left hand
    { pitch: 45, velocity: 85, duration: 1.0, startBeat: 2 },
    { pitch: 52, velocity: 80, duration: 1.0, startBeat: 2 },
    // Right hand
    { pitch: 65, velocity: 95, duration: 0.5, startBeat: 2 },
    { pitch: 64, velocity: 90, duration: 0.5, startBeat: 2.5 },
    { pitch: 60, velocity: 100, duration: 1.5, startBeat: 3 },
  ],
};

/** Bell: high register, spaced notes to hear decay */
const BELL_PATTERN: PreviewPattern = {
  name: 'bell',
  notes: [
    { pitch: 72, velocity: 100, duration: 0.3, startBeat: 0 },
    { pitch: 79, velocity: 90, duration: 0.3, startBeat: 1 },
    { pitch: 76, velocity: 95, duration: 0.3, startBeat: 2 },
    { pitch: 84, velocity: 85, duration: 0.3, startBeat: 3 },
    { pitch: 72, velocity: 100, duration: 0.3, startBeat: 4 },
    { pitch: 76, velocity: 90, duration: 0.3, startBeat: 5 },
    { pitch: 79, velocity: 95, duration: 0.5, startBeat: 6 },
  ],
};

/** Wavetable: sustained notes to hear timbral evolution */
const WAVETABLE_PATTERN: PreviewPattern = {
  name: 'wavetable',
  notes: [
    { pitch: 60, velocity: 90, duration: 2.0, startBeat: 0 },
    { pitch: 67, velocity: 85, duration: 2.0, startBeat: 2.5 },
    { pitch: 72, velocity: 95, duration: 2.0, startBeat: 5 },
  ],
};

export const PREVIEW_PATTERNS: Record<string, PreviewPattern> = {
  Bass: BASS_PATTERN,
  Lead: LEAD_PATTERN,
  Pad: PAD_PATTERN,
  Pluck: PLUCK_PATTERN,
  FX: FX_PATTERN,
  Keys: KEYS_PATTERN,
  Bell: BELL_PATTERN,
  Wavetable: WAVETABLE_PATTERN,
};

const DEFAULT_PATTERN = KEYS_PATTERN;

export function getPatternForCategory(category: string): PreviewPattern {
  return PREVIEW_PATTERNS[category] ?? DEFAULT_PATTERN;
}

// ---------------------------------------------------------------------------
// Key transposition — shift patterns from C to the project key
// ---------------------------------------------------------------------------

const KEY_SEMITONES: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3,
  E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8,
  A: 9, 'A#': 10, Bb: 10, B: 11,
};

/** Parse "C major", "A minor", "F# major" etc. and return semitone offset from C. */
export function getTransposeSemitones(keyScale: string): number {
  const match = keyScale.match(/^([A-G][#b]?)/);
  if (!match) return 0;
  return KEY_SEMITONES[match[1]] ?? 0;
}

function transposePattern(pattern: PreviewPattern, semitones: number): PreviewPattern {
  if (semitones === 0) return pattern;
  return {
    ...pattern,
    notes: pattern.notes.map((n) => ({
      ...n,
      pitch: Math.max(0, Math.min(127, n.pitch + semitones)),
    })),
  };
}

// ---------------------------------------------------------------------------
// Preview synth factory
// ---------------------------------------------------------------------------

type PreviewKind = 'subtractive' | 'fm' | 'wavetable' | 'granular' | 'additive' | 'physical';
type PreviewSynth = IDSPPolySynth | IDSPFMSynth;

function createPreviewSynth(ctx: AudioContext, kind: PreviewKind): PreviewSynth {
  if (kind === 'fm') {
    return new NativeFMSynth(ctx, {
      modulationIndex: 3,
      harmonicity: 2,
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.8 },
    });
  }
  if (kind === 'physical') {
    // Approximate PluckSynth with a short, percussive envelope —
    // sufficient for a brief audition.
    return new NativePolySynth(ctx, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.4, sustain: 0.05, release: 0.4 },
    });
  }
  // subtractive / wavetable / granular / additive — generic poly
  return new NativePolySynth(ctx, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.01, decay: 0.3, sustain: 0.5, release: 0.8 },
  });
}

// ---------------------------------------------------------------------------
// PreviewEngine class
// ---------------------------------------------------------------------------

export class PreviewEngine {
  private _volume = 0.3;
  private _isPlaying = false;
  private _synth: PreviewSynth | null = null;
  private _gain: GainNode | null = null;
  private _scheduledIds: ReturnType<typeof setTimeout>[] = [];
  private _stopTimeoutId: ReturnType<typeof setTimeout> | null = null;

  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get volume(): number {
    return this._volume;
  }

  setVolume(vol: number): void {
    this._volume = Math.max(0, Math.min(1, vol));
    if (this._gain) {
      this._gain.gain.value = this._volume;
    }
  }

  stop(): void {
    this._isPlaying = false;

    if (this._stopTimeoutId !== null) {
      clearTimeout(this._stopTimeoutId);
      this._stopTimeoutId = null;
    }

    // Cancel scheduled note timeouts
    for (const id of this._scheduledIds) {
      clearTimeout(id);
    }
    this._scheduledIds = [];

    // Cut any sounding notes before disposal so rapid preset auditions
    // don't leave oscillators ringing until their scheduled stop.
    // PolySynth uses `releaseAll()`; NativeFMSynth has a single-note
    // `triggerRelease()` (acts as an "all notes off" since the synth
    // is monophonic).
    if (this._synth) {
      if ('releaseAll' in this._synth) {
        (this._synth as IDSPPolySynth).releaseAll();
      } else if ('triggerRelease' in this._synth) {
        (this._synth as IDSPFMSynth).triggerRelease();
      }
    }

    this._disposeSynth();
  }

  async playPresetPreview(
    instrumentKind: PreviewKind,
    category: string,
    bpm: number,
    keyScale = 'C major',
  ): Promise<void> {
    this.stop();

    const engine = getAudioEngine();
    if (engine.ctx.state !== 'running') {
      await engine.resume();
    }
    const ctx = engine.ctx;

    const basePattern = getPatternForCategory(category);
    const semitones = getTransposeSemitones(keyScale);
    const pattern = transposePattern(basePattern, semitones);
    const secondsPerBeat = 60 / bpm;

    // Create dedicated synth for preview and route to destination.
    // We pass durations as numbers (seconds), so the synth never needs
    // to parse Tone.js-style notation — no need to pipe BPM through.
    this._synth = createPreviewSynth(ctx, instrumentKind);
    this._gain = ctx.createGain();
    this._gain.gain.value = this._volume;
    this._synth.connectNative(this._gain);
    this._gain.connect(ctx.destination);

    this._isPlaying = true;

    // Schedule all notes with setTimeout (doesn't interfere with Transport)
    let maxEndTime = 0;

    for (const note of pattern.notes) {
      const startTime = note.startBeat * secondsPerBeat;
      const duration = note.duration * secondsPerBeat;
      const endTime = startTime + duration;
      if (endTime > maxEndTime) maxEndTime = endTime;

      const noteName = midiToNoteName(note.pitch);
      const vel = note.velocity / 127;

      const id = setTimeout(() => {
        if (!this._isPlaying || !this._synth) return;
        this._synth.triggerAttackRelease(noteName, duration, undefined, vel);
      }, startTime * 1000);

      this._scheduledIds.push(id);
    }

    // Auto-stop after pattern finishes (add 0.5s for release tail)
    this._stopTimeoutId = setTimeout(() => {
      this.stop();
    }, (maxEndTime + 0.5) * 1000);
  }

  dispose(): void {
    this.stop();
    this._disposeSynth();
  }

  private _disposeSynth(): void {
    if (this._synth) {
      this._synth.dispose();
      this._synth = null;
    }
    if (this._gain) {
      try { this._gain.disconnect(); } catch { /* already disconnected */ }
      this._gain = null;
    }
  }
}

/** Singleton instance */
export const previewEngine = new PreviewEngine();
