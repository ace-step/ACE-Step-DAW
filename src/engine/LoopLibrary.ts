/**
 * Loop Library — built-in loops synthesized offline.
 *
 * Phase 5O migration: Tone.Offline replaced by native
 * OfflineAudioContext, and the Tone-based synth/effect stack
 * replaced with native Web Audio primitives + NativeSynths.
 *
 * The loop generators intentionally skip Tone's high-level effects
 * (Reverb / FeedbackDelay) in favour of simple synthesized bodies —
 * the loops remain audible and genre-appropriate but lose some of
 * the sheen the Tone version had. Richer FX chains can be added
 * back later without disturbing the LOOP_DEFINITIONS structure.
 */
import {
  NativeMembraneSynth,
  NativeNoiseSynth,
  NativePolySynth,
  NativeFMSynth,
  NativeSynth,
} from './dsp/NativeSynths';

// ─── Types ──────────────────────────────────────────────────────────────────

export type LoopCategory = 'Drums' | 'Bass' | 'Keys' | 'Synth' | 'FX' | 'Vocals';

export interface LoopDefinition {
  id: string;
  name: string;
  category: LoopCategory;
  bpm: number;
  bars: number;
  key?: string;
  description: string;
  generate: (duration: number) => Promise<AudioBuffer>;
}

export interface LoopItem {
  id: string;
  name: string;
  category: LoopCategory;
  bpm: number;
  bars: number;
  key?: string;
  description: string;
  duration: number;
  audioBuffer: AudioBuffer | null;
  waveformData: number[] | null;
  loading: boolean;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function barsToDuration(bars: number, bpm: number, beatsPerBar = 4): number {
  return (bars * beatsPerBar * 60) / bpm;
}

function extractPeaks(buffer: AudioBuffer, numSamples = 256): number[] {
  const data = buffer.getChannelData(0);
  const blockSize = Math.floor(data.length / numSamples);
  const peaks: number[] = [];
  for (let i = 0; i < numSamples; i++) {
    let max = 0;
    const start = i * blockSize;
    for (let j = 0; j < blockSize; j++) {
      const abs = Math.abs(data[start + j] ?? 0);
      if (abs > max) max = abs;
    }
    peaks.push(max);
  }
  return peaks;
}

/** Tiny offset so the first note is not at exactly t=0. */
const T0 = 0.005;
const SAMPLE_RATE = 48000;

function createOfflineCtx(duration: number): OfflineAudioContext {
  const length = Math.max(1, Math.ceil(duration * SAMPLE_RATE));
  return new OfflineAudioContext(2, length, SAMPLE_RATE);
}

function dbToGain(db: number): number {
  return Math.pow(10, db / 20);
}

/** Create a hi-hat-style noise synth at the specified volume (dB). */
function makeHat(ctx: AudioContext, volumeDb: number): NativeNoiseSynth {
  const hat = new NativeNoiseSynth(ctx, {
    envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
  });
  // Simple highpass shape — connect through a filter in the caller
  // for per-loop sonic character; we scale the output gain here.
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = 8000;
  const gainNode = ctx.createGain();
  gainNode.gain.value = dbToGain(volumeDb);
  hat.connectNative(filter);
  filter.connect(gainNode);
  gainNode.connect(ctx.destination);
  return hat;
}

// ─── Drum Loop Generators ───────────────────────────────────────────────────

async function generate808Boom(duration: number): Promise<AudioBuffer> {
  const ctx = createOfflineCtx(duration) as unknown as AudioContext;

  const kick = new NativeMembraneSynth(ctx, {
    pitchDecay: 0.08,
    octaves: 6,
    envelope: { attack: 0.006, decay: 0.5, sustain: 0, release: 0.5 },
  });
  kick.connectNative(ctx.destination);
  const hat = makeHat(ctx, -12);

  const beatTime = 60 / 90;
  for (let bar = 0; bar < 4; bar++) {
    const offset = T0 + bar * 4 * beatTime;
    kick.triggerAttackRelease('C1', 0.25, offset);
    kick.triggerAttackRelease('C1', 0.25, offset + 2 * beatTime);
    kick.triggerAttackRelease('C1', 0.25, offset + 2.75 * beatTime);
    for (let i = 0; i < 8; i++) {
      hat.triggerAttackRelease(0.0625, offset + i * beatTime * 0.5);
    }
  }
  return (ctx as unknown as OfflineAudioContext).startRendering();
}

async function generateRockSteady(duration: number): Promise<AudioBuffer> {
  const ctx = createOfflineCtx(duration) as unknown as AudioContext;
  const kick = new NativeMembraneSynth(ctx, {
    pitchDecay: 0.05,
    octaves: 4,
    envelope: { attack: 0.005, decay: 0.3, sustain: 0, release: 0.3 },
  });
  kick.connectNative(ctx.destination);
  const snareGain = ctx.createGain();
  snareGain.gain.value = dbToGain(-6);
  snareGain.connect(ctx.destination);
  const snare = new NativeNoiseSynth(ctx, {
    envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
  });
  snare.connectNative(snareGain);
  const hat = makeHat(ctx, -14);

  const beat = 60 / 120;
  for (let bar = 0; bar < 4; bar++) {
    const o = T0 + bar * 4 * beat;
    kick.triggerAttackRelease('C1', 0.25, o);
    kick.triggerAttackRelease('C1', 0.25, o + 2 * beat);
    snare.triggerAttackRelease(0.25, o + beat);
    snare.triggerAttackRelease(0.25, o + 3 * beat);
    for (let i = 0; i < 8; i++) {
      hat.triggerAttackRelease(0.0625, o + i * beat * 0.5);
    }
  }
  return (ctx as unknown as OfflineAudioContext).startRendering();
}

async function generateShuffleBlues(duration: number): Promise<AudioBuffer> {
  const ctx = createOfflineCtx(duration) as unknown as AudioContext;
  const kick = new NativeMembraneSynth(ctx, {
    pitchDecay: 0.05,
    octaves: 4,
    envelope: { attack: 0.005, decay: 0.3, sustain: 0, release: 0.3 },
  });
  kick.connectNative(ctx.destination);
  const snareGain = ctx.createGain();
  snareGain.gain.value = dbToGain(-8);
  snareGain.connect(ctx.destination);
  const snare = new NativeNoiseSynth(ctx, {
    envelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.1 },
  });
  snare.connectNative(snareGain);
  const hat = makeHat(ctx, -14);

  const beat = 60 / 95;
  const triplet = beat / 3;
  for (let bar = 0; bar < 4; bar++) {
    const o = T0 + bar * 4 * beat;
    kick.triggerAttackRelease('C1', 0.25, o);
    kick.triggerAttackRelease('C1', 0.25, o + 2 * beat);
    snare.triggerAttackRelease(0.25, o + beat);
    snare.triggerAttackRelease(0.25, o + 3 * beat);
    for (let i = 0; i < 4; i++) {
      hat.triggerAttackRelease(0.03125, o + i * beat);
      hat.triggerAttackRelease(0.03125, o + i * beat + triplet * 2);
    }
  }
  return (ctx as unknown as OfflineAudioContext).startRendering();
}

async function generateTrapHiHats(duration: number): Promise<AudioBuffer> {
  const ctx = createOfflineCtx(duration) as unknown as AudioContext;
  const kick = new NativeMembraneSynth(ctx, {
    pitchDecay: 0.08,
    octaves: 6,
    envelope: { attack: 0.006, decay: 0.5, sustain: 0, release: 0.4 },
  });
  kick.connectNative(ctx.destination);
  const hat1 = makeHat(ctx, -10);
  const hat2 = makeHat(ctx, -10);
  const snareGain = ctx.createGain();
  snareGain.gain.value = dbToGain(-4);
  snareGain.connect(ctx.destination);
  const snare = new NativeNoiseSynth(ctx, {
    envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
  });
  snare.connectNative(snareGain);

  const beat = 60 / 140;
  for (let bar = 0; bar < 4; bar++) {
    const o = T0 + bar * 4 * beat;
    kick.triggerAttackRelease('C1', 0.25, o);
    kick.triggerAttackRelease('C1', 0.25, o + 2.5 * beat);
    snare.triggerAttackRelease(0.25, o + beat);
    snare.triggerAttackRelease(0.25, o + 3 * beat);
    for (let i = 0; i < 16; i++) {
      hat1.triggerAttackRelease(0.03125, o + i * beat * 0.25);
    }
    for (let i = 0; i < 4; i++) {
      hat2.triggerAttackRelease(0.03125, o + 3 * beat + i * beat * 0.125);
    }
  }
  return (ctx as unknown as OfflineAudioContext).startRendering();
}

async function generateLoFiDrums(duration: number): Promise<AudioBuffer> {
  const ctx = createOfflineCtx(duration) as unknown as AudioContext;
  const kickGain = ctx.createGain();
  kickGain.gain.value = dbToGain(-3);
  kickGain.connect(ctx.destination);
  const kick = new NativeMembraneSynth(ctx, {
    pitchDecay: 0.05,
    octaves: 4,
    envelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.3 },
  });
  kick.connectNative(kickGain);
  const snareGain = ctx.createGain();
  snareGain.gain.value = dbToGain(-8);
  snareGain.connect(ctx.destination);
  const snare = new NativeNoiseSynth(ctx, {
    envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 },
  });
  snare.connectNative(snareGain);
  const hat = makeHat(ctx, -16);

  const beat = 60 / 85;
  for (let bar = 0; bar < 4; bar++) {
    const o = T0 + bar * 4 * beat;
    kick.triggerAttackRelease('C1', 0.25, o);
    kick.triggerAttackRelease('C1', 0.25, o + 1.75 * beat);
    kick.triggerAttackRelease('C1', 0.25, o + 2.5 * beat);
    snare.triggerAttackRelease(0.25, o + beat);
    snare.triggerAttackRelease(0.25, o + 3 * beat);
    for (let i = 0; i < 8; i++) {
      hat.triggerAttackRelease(0.03125, o + i * beat * 0.5);
    }
  }
  return (ctx as unknown as OfflineAudioContext).startRendering();
}

// ─── Bass Loop Generators ───────────────────────────────────────────────────

/** Build a simple monophonic subtractive voice: one osc → lowpass →
 *  AD envelope gain. Matches Tone.MonoSynth's character closely enough
 *  for these short loop snippets. */
function renderMonoBassNote(
  ctx: AudioContext,
  dest: AudioNode,
  noteFreq: number,
  oscType: OscillatorType,
  startTime: number,
  duration: number,
  filterBase: number,
  filterPeak: number,
  velocity: number,
): void {
  const osc = ctx.createOscillator();
  osc.type = oscType;
  osc.frequency.value = noteFreq;

  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.Q.value = 1;
  filter.frequency.setValueAtTime(filterBase, startTime);
  filter.frequency.linearRampToValueAtTime(filterPeak, startTime + 0.01);
  filter.frequency.exponentialRampToValueAtTime(
    Math.max(filterBase, 40),
    startTime + duration * 0.7,
  );

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, startTime);
  gain.gain.linearRampToValueAtTime(velocity, startTime + 0.01);
  gain.gain.linearRampToValueAtTime(velocity * 0.5, startTime + 0.1);
  gain.gain.linearRampToValueAtTime(0, startTime + duration);

  osc.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  osc.start(startTime);
  osc.stop(startTime + duration + 0.02);
}

const NOTE_NAMES: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
};

function noteToFreq(note: string): number {
  const match = note.match(/^([A-G][#b]?)(-?\d+)$/);
  if (!match) return 440;
  const semitone = NOTE_NAMES[match[1]] ?? 0;
  const octave = parseInt(match[2], 10);
  const midi = (octave + 1) * 12 + semitone;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

async function generateSubBass(duration: number): Promise<AudioBuffer> {
  const ctx = createOfflineCtx(duration) as unknown as AudioContext;
  const masterGain = ctx.createGain();
  masterGain.gain.value = dbToGain(-3);
  masterGain.connect(ctx.destination);

  const beat = 60 / 90;
  const notes = ['C1', 'C1', 'Eb1', 'F1'];
  for (let bar = 0; bar < 4; bar++) {
    const o = bar * 4 * beat;
    const note = notes[bar % notes.length];
    renderMonoBassNote(ctx, masterGain, noteToFreq(note), 'sine', o, beat * 2, 60, 120, 0.8);
    renderMonoBassNote(ctx, masterGain, noteToFreq(note), 'sine', o + 2.5 * beat, beat, 60, 120, 0.8);
  }
  return (ctx as unknown as OfflineAudioContext).startRendering();
}

async function generateWalkingBass(duration: number): Promise<AudioBuffer> {
  const ctx = createOfflineCtx(duration) as unknown as AudioContext;
  const masterGain = ctx.createGain();
  masterGain.gain.value = dbToGain(-4);
  masterGain.connect(ctx.destination);

  const beat = 60 / 120;
  const pattern = [
    'C2', 'E2', 'G2', 'A2',
    'F2', 'A2', 'C3', 'D3',
    'G2', 'B2', 'D3', 'E3',
    'C2', 'D2', 'E2', 'G2',
  ];
  for (let i = 0; i < pattern.length; i++) {
    renderMonoBassNote(ctx, masterGain, noteToFreq(pattern[i]), 'triangle', i * beat, beat * 0.8, 100, 400, 0.7);
  }
  return (ctx as unknown as OfflineAudioContext).startRendering();
}

async function generateFunkSlap(duration: number): Promise<AudioBuffer> {
  const ctx = createOfflineCtx(duration) as unknown as AudioContext;
  const masterGain = ctx.createGain();
  masterGain.gain.value = dbToGain(-5);
  masterGain.connect(ctx.destination);

  const beat = 60 / 110;
  const notes = ['E2', null, 'E2', 'G2', null, 'A2', null, 'E2',
                 'G2', null, 'E2', null, 'A2', 'G2', null, 'E2'];
  for (let bar = 0; bar < 4; bar++) {
    const o = bar * 4 * beat;
    for (let i = 0; i < 16; i++) {
      const n = notes[i];
      if (n) {
        renderMonoBassNote(ctx, masterGain, noteToFreq(n), 'sawtooth', o + i * beat * 0.25, beat * 0.2, 200, 1600, 0.6);
      }
    }
  }
  return (ctx as unknown as OfflineAudioContext).startRendering();
}

async function generateSynthBass(duration: number): Promise<AudioBuffer> {
  const ctx = createOfflineCtx(duration) as unknown as AudioContext;
  const masterGain = ctx.createGain();
  masterGain.gain.value = dbToGain(-5);
  masterGain.connect(ctx.destination);

  const beat = 60 / 128;
  const pattern = [
    { note: 'C2', time: 0, dur: 0.5 },
    { note: 'C2', time: 1, dur: 0.25 },
    { note: 'Eb2', time: 1.5, dur: 0.5 },
    { note: 'F2', time: 2.5, dur: 0.5 },
    { note: 'Eb2', time: 3, dur: 0.25 },
    { note: 'C2', time: 3.5, dur: 0.5 },
  ];
  for (let bar = 0; bar < 4; bar++) {
    const o = bar * 4 * beat;
    for (const p of pattern) {
      renderMonoBassNote(ctx, masterGain, noteToFreq(p.note), 'square', o + p.time * beat, beat * p.dur, 150, 850, 0.7);
    }
  }
  return (ctx as unknown as OfflineAudioContext).startRendering();
}

// ─── Keys Loop Generators ───────────────────────────────────────────────────

async function generatePianoBallad(duration: number): Promise<AudioBuffer> {
  const ctx = createOfflineCtx(duration) as unknown as AudioContext;
  const masterGain = ctx.createGain();
  masterGain.gain.value = dbToGain(-6);
  masterGain.connect(ctx.destination);
  const synth = new NativePolySynth(ctx, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.02, decay: 0.5, sustain: 0.3, release: 0.8 },
  });
  synth.connectNative(masterGain);

  const beat = 60 / 80;
  const chords: [string[], number][] = [
    [['C4', 'E4', 'G4'], 0],
    [['A3', 'C4', 'E4'], 4],
    [['F3', 'A3', 'C4'], 8],
    [['G3', 'B3', 'D4'], 12],
  ];
  for (const [notes, beatStart] of chords) {
    synth.triggerAttackRelease(notes, beat * 3.5, beatStart * beat);
  }
  return (ctx as unknown as OfflineAudioContext).startRendering();
}

async function generateRhodesGroove(duration: number): Promise<AudioBuffer> {
  const ctx = createOfflineCtx(duration) as unknown as AudioContext;
  const masterGain = ctx.createGain();
  masterGain.gain.value = dbToGain(-8);
  masterGain.connect(ctx.destination);
  const synth = new NativeFMSynth(ctx, {
    harmonicity: 2,
    modulationIndex: 1.5,
    envelope: { attack: 0.01, decay: 0.4, sustain: 0.2, release: 0.6 },
  });
  synth.connectNative(masterGain);

  const beat = 60 / 100;
  const pattern: [string, number, number][] = [
    ['Eb4', 0, 0.5],
    ['Eb4', 0.75, 0.25],
    ['Ab3', 2, 1],
    ['Bb3', 3, 0.5],
    ['Bb3', 3.75, 0.25],
  ];
  for (let bar = 0; bar < 4; bar++) {
    const o = bar * 4 * beat;
    for (const [note, t, dur] of pattern) {
      synth.triggerAttackRelease(note, beat * dur, o + t * beat);
    }
  }
  return (ctx as unknown as OfflineAudioContext).startRendering();
}

async function generateAmbientPad(duration: number): Promise<AudioBuffer> {
  const ctx = createOfflineCtx(duration) as unknown as AudioContext;
  const masterGain = ctx.createGain();
  masterGain.gain.value = dbToGain(-8);
  masterGain.connect(ctx.destination);
  const synth = new NativePolySynth(ctx, {
    oscillator: { type: 'sine' },
    envelope: { attack: 1.5, decay: 2, sustain: 0.6, release: 3 },
  });
  synth.connectNative(masterGain);

  const beat = 60 / 70;
  const chords: [string[], number, number][] = [
    [['C3', 'E3', 'G3', 'B3'], 0, 8],
    [['A2', 'C3', 'E3', 'G3'], 8, 8],
    [['F2', 'A2', 'C3', 'E3'], 16, 8],
    [['G2', 'B2', 'D3', 'F3'], 24, 8],
  ];
  for (const [notes, beatStart, dur] of chords) {
    synth.triggerAttackRelease(notes, beat * dur, beatStart * beat);
  }
  return (ctx as unknown as OfflineAudioContext).startRendering();
}

// ─── Synth Loop Generators ──────────────────────────────────────────────────

async function generateArpCascade(duration: number): Promise<AudioBuffer> {
  const ctx = createOfflineCtx(duration) as unknown as AudioContext;
  const masterGain = ctx.createGain();
  masterGain.gain.value = dbToGain(-8);
  masterGain.connect(ctx.destination);
  const synth = new NativeSynth(ctx, {
    oscillator: { type: 'sawtooth' },
    envelope: { attack: 0.005, decay: 0.15, sustain: 0.1, release: 0.1 },
  });
  synth.connectNative(masterGain);

  const beat = 60 / 128;
  const arpNotes = ['C4', 'E4', 'G4', 'B4', 'C5', 'B4', 'G4', 'E4'];
  for (let bar = 0; bar < 4; bar++) {
    const o = bar * 4 * beat;
    for (let i = 0; i < 8; i++) {
      synth.triggerAttackRelease(arpNotes[i % arpNotes.length], 0.125, o + i * beat * 0.5);
    }
  }
  return (ctx as unknown as OfflineAudioContext).startRendering();
}

async function generateLeadLine(duration: number): Promise<AudioBuffer> {
  const ctx = createOfflineCtx(duration) as unknown as AudioContext;
  const masterGain = ctx.createGain();
  masterGain.gain.value = dbToGain(-8);
  masterGain.connect(ctx.destination);
  const synth = new NativeSynth(ctx, {
    oscillator: { type: 'square' },
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.2 },
  });
  synth.connectNative(masterGain);

  const beat = 60 / 120;
  const melody = [
    { note: 'C5', time: 0, dur: 1 },
    { note: 'D5', time: 1, dur: 0.5 },
    { note: 'Eb5', time: 1.5, dur: 1.5 },
    { note: 'G5', time: 3, dur: 0.5 },
    { note: 'F5', time: 3.5, dur: 0.5 },
    { note: 'Eb5', time: 4, dur: 1 },
    { note: 'D5', time: 5, dur: 0.5 },
    { note: 'C5', time: 5.5, dur: 1.5 },
    { note: 'Bb4', time: 7, dur: 0.5 },
    { note: 'C5', time: 7.5, dur: 0.5 },
    { note: 'Eb5', time: 8, dur: 2 },
    { note: 'D5', time: 10, dur: 1 },
    { note: 'C5', time: 11, dur: 1 },
    { note: 'Bb4', time: 12, dur: 2 },
    { note: 'C5', time: 14, dur: 2 },
  ];
  for (const m of melody) {
    synth.triggerAttackRelease(m.note, beat * m.dur, m.time * beat);
  }
  return (ctx as unknown as OfflineAudioContext).startRendering();
}

async function generatePluckStab(duration: number): Promise<AudioBuffer> {
  const ctx = createOfflineCtx(duration) as unknown as AudioContext;
  const masterGain = ctx.createGain();
  masterGain.gain.value = dbToGain(-6);
  masterGain.connect(ctx.destination);
  const synth = new NativePolySynth(ctx, {
    oscillator: { type: 'triangle' },
    envelope: { attack: 0.005, decay: 0.1, sustain: 0.05, release: 0.1 },
  });
  synth.connectNative(masterGain);

  const beat = 60 / 130;
  const stabs: [string[], number][] = [
    [['C4', 'Eb4', 'G4'], 0],
    [['C4', 'Eb4', 'G4'], 0.5],
    [['Ab3', 'C4', 'Eb4'], 1.5],
    [['Bb3', 'D4', 'F4'], 2.5],
    [['Bb3', 'D4', 'F4'], 3],
  ];
  for (let bar = 0; bar < 4; bar++) {
    const o = bar * 4 * beat;
    for (const [notes, t] of stabs) {
      synth.triggerAttackRelease(notes, 0.125, o + t * beat);
    }
  }
  return (ctx as unknown as OfflineAudioContext).startRendering();
}

// ─── FX Loop Generators ─────────────────────────────────────────────────────

async function generateRiser(duration: number): Promise<AudioBuffer> {
  const ctx = createOfflineCtx(duration) as unknown as AudioContext;
  const masterGain = ctx.createGain();
  masterGain.gain.value = dbToGain(-12);
  masterGain.connect(ctx.destination);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(200, T0);
  filter.frequency.linearRampToValueAtTime(8000, T0 + duration * 0.9);
  filter.connect(masterGain);

  const osc = ctx.createOscillator();
  osc.type = 'sawtooth';
  osc.frequency.value = noteToFreq('C3');
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, T0);
  gain.gain.linearRampToValueAtTime(0.8, T0 + duration * 0.9);
  gain.gain.linearRampToValueAtTime(0, T0 + duration);
  osc.connect(gain);
  gain.connect(filter);
  osc.start(T0);
  osc.stop(T0 + duration);
  return (ctx as unknown as OfflineAudioContext).startRendering();
}

async function generateImpact(duration: number): Promise<AudioBuffer> {
  const ctx = createOfflineCtx(duration) as unknown as AudioContext;
  const noiseGain = ctx.createGain();
  noiseGain.gain.value = dbToGain(-4);
  noiseGain.connect(ctx.destination);
  const noise = new NativeNoiseSynth(ctx, {
    envelope: { attack: 0.001, decay: 0.8, sustain: 0, release: 0.5 },
  });
  noise.connectNative(noiseGain);

  const subGain = ctx.createGain();
  subGain.gain.value = dbToGain(-2);
  subGain.connect(ctx.destination);
  const sub = new NativeMembraneSynth(ctx, {
    pitchDecay: 0.2,
    octaves: 8,
    envelope: { attack: 0.001, decay: 1.5, sustain: 0, release: 0.5 },
  });
  sub.connectNative(subGain);

  noise.triggerAttackRelease(0.5, T0);
  sub.triggerAttackRelease('C1', 1.0, T0);
  return (ctx as unknown as OfflineAudioContext).startRendering();
}

async function generateSweepDown(duration: number): Promise<AudioBuffer> {
  const ctx = createOfflineCtx(duration) as unknown as AudioContext;
  const masterGain = ctx.createGain();
  masterGain.gain.value = dbToGain(-8);
  masterGain.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(4000, T0);
  osc.frequency.exponentialRampToValueAtTime(60, T0 + duration * 0.8);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, T0);
  gain.gain.linearRampToValueAtTime(0.6, T0 + 0.02);
  gain.gain.linearRampToValueAtTime(0, T0 + duration * 0.85);

  osc.connect(gain);
  gain.connect(masterGain);
  osc.start(T0);
  osc.stop(T0 + duration);
  return (ctx as unknown as OfflineAudioContext).startRendering();
}

// ─── Vocal Loop Generators ──────────────────────────────────────────────────

async function generateVocalChop(duration: number): Promise<AudioBuffer> {
  const ctx = createOfflineCtx(duration) as unknown as AudioContext;
  const masterGain = ctx.createGain();
  masterGain.gain.value = dbToGain(-8);
  masterGain.connect(ctx.destination);
  const synth = new NativeFMSynth(ctx, {
    harmonicity: 3,
    modulationIndex: 10,
    envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2 },
  });
  synth.connectNative(masterGain);

  const beat = 60 / 120;
  const notes = ['C4', 'E4', 'G4', 'C5', 'G4', 'E4', 'C4', 'D4'];
  for (let bar = 0; bar < 2; bar++) {
    const o = bar * 4 * beat;
    for (let i = 0; i < 8; i++) {
      synth.triggerAttackRelease(notes[i], beat * 0.3, o + i * beat * 0.5);
    }
  }
  return (ctx as unknown as OfflineAudioContext).startRendering();
}

async function generateVocalPad(duration: number): Promise<AudioBuffer> {
  const ctx = createOfflineCtx(duration) as unknown as AudioContext;
  const masterGain = ctx.createGain();
  masterGain.gain.value = dbToGain(-10);
  masterGain.connect(ctx.destination);
  // Native FM in mono; layered attacks simulate a pad.
  const synth = new NativeFMSynth(ctx, {
    harmonicity: 2,
    modulationIndex: 3,
    envelope: { attack: 0.8, decay: 1.5, sustain: 0.4, release: 1.5 },
  });
  synth.connectNative(masterGain);

  const beat = 60 / 80;
  // Chord notes sequenced (NativeFMSynth is monophonic, so we stagger).
  for (const note of ['C4', 'E4', 'G4']) {
    synth.triggerAttackRelease(note, beat * 8, 0);
  }
  for (const note of ['A3', 'C4', 'E4']) {
    synth.triggerAttackRelease(note, beat * 8, beat * 8);
  }
  return (ctx as unknown as OfflineAudioContext).startRendering();
}

// ─── Loop Definitions ───────────────────────────────────────────────────────

export const LOOP_DEFINITIONS: LoopDefinition[] = [
  // Drums
  { id: 'loop-808-boom', name: '808 Boom', category: 'Drums', bpm: 90, bars: 4, description: '808-style kick pattern', generate: generate808Boom },
  { id: 'loop-rock-steady', name: 'Rock Steady', category: 'Drums', bpm: 120, bars: 4, description: 'Rock beat pattern', generate: generateRockSteady },
  { id: 'loop-shuffle-blues', name: 'Shuffle Blues', category: 'Drums', bpm: 95, bars: 4, description: 'Shuffled hi-hat pattern', generate: generateShuffleBlues },
  { id: 'loop-trap-hihats', name: 'Trap Hi-Hats', category: 'Drums', bpm: 140, bars: 4, description: 'Rapid hi-hat rolls', generate: generateTrapHiHats },
  { id: 'loop-lofi-drums', name: 'Lo-Fi Drums', category: 'Drums', bpm: 85, bars: 4, description: 'Laid back beat', generate: generateLoFiDrums },
  // Bass
  { id: 'loop-sub-bass', name: 'Sub Bass', category: 'Bass', bpm: 90, bars: 4, key: 'Cm', description: 'Deep sub bass', generate: generateSubBass },
  { id: 'loop-walking-bass', name: 'Walking Bass', category: 'Bass', bpm: 120, bars: 4, key: 'C', description: 'Jazz walking bass line', generate: generateWalkingBass },
  { id: 'loop-funk-slap', name: 'Funk Slap', category: 'Bass', bpm: 110, bars: 4, key: 'Em', description: 'Funky bass pattern', generate: generateFunkSlap },
  { id: 'loop-synth-bass', name: 'Synth Bass', category: 'Bass', bpm: 128, bars: 4, key: 'Cm', description: 'Synth bass groove', generate: generateSynthBass },
  // Keys
  { id: 'loop-piano-ballad', name: 'Piano Ballad', category: 'Keys', bpm: 80, bars: 4, key: 'C', description: 'Gentle piano chords', generate: generatePianoBallad },
  { id: 'loop-rhodes-groove', name: 'Rhodes Groove', category: 'Keys', bpm: 100, bars: 4, key: 'Eb', description: 'Rhodes chord progression', generate: generateRhodesGroove },
  { id: 'loop-ambient-pad', name: 'Ambient Pad', category: 'Keys', bpm: 70, bars: 8, key: 'C', description: 'Evolving pad texture', generate: generateAmbientPad },
  // Synth
  { id: 'loop-arp-cascade', name: 'Arp Cascade', category: 'Synth', bpm: 128, bars: 4, key: 'C', description: 'Arpeggiated synth', generate: generateArpCascade },
  { id: 'loop-lead-line', name: 'Lead Line', category: 'Synth', bpm: 120, bars: 4, key: 'Cm', description: 'Melodic synth lead', generate: generateLeadLine },
  { id: 'loop-pluck-stab', name: 'Pluck Stab', category: 'Synth', bpm: 130, bars: 4, key: 'Cm', description: 'Short pluck chords', generate: generatePluckStab },
  // FX
  { id: 'loop-riser', name: 'Riser', category: 'FX', bpm: 120, bars: 4, description: 'Building sweep riser', generate: generateRiser },
  { id: 'loop-impact', name: 'Impact', category: 'FX', bpm: 120, bars: 1, description: 'Cinematic impact hit', generate: generateImpact },
  { id: 'loop-sweep-down', name: 'Sweep Down', category: 'FX', bpm: 120, bars: 2, description: 'Descending frequency sweep', generate: generateSweepDown },
  // Vocals
  { id: 'loop-vocal-chop', name: 'Vocal Chop', category: 'Vocals', bpm: 120, bars: 2, key: 'C', description: 'Chopped vocal pattern', generate: generateVocalChop },
  { id: 'loop-vocal-pad', name: 'Vocal Pad', category: 'Vocals', bpm: 80, bars: 4, key: 'C', description: 'Airy vocal pad texture', generate: generateVocalPad },
];

// ─── Loop Cache & Loading ───────────────────────────────────────────────────

const loopCache = new Map<string, { audioBuffer: AudioBuffer; waveformData: number[] }>();

export async function loadLoop(def: LoopDefinition): Promise<{ audioBuffer: AudioBuffer; waveformData: number[] }> {
  const cached = loopCache.get(def.id);
  if (cached) return cached;

  const duration = barsToDuration(def.bars, def.bpm);
  const audioBuffer = await def.generate(duration);
  const waveformData = extractPeaks(audioBuffer, 256);

  const result = { audioBuffer, waveformData };
  loopCache.set(def.id, result);
  return result;
}

export function getLoopDuration(def: LoopDefinition): number {
  return barsToDuration(def.bars, def.bpm);
}

export function formatDuration(seconds: number): string {
  const s = Math.floor(seconds);
  const ms = Math.floor((seconds - s) * 10);
  return `${s}.${ms}s`;
}
