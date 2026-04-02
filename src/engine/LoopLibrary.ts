/**
 * Loop Library — Built-in loops synthesized with Tone.js offline rendering.
 * No external audio files needed.
 */
import * as Tone from 'tone';

// Tone.Offline returns ToneAudioBuffer; extract the underlying AudioBuffer
function toAudioBuffer(buf: Tone.ToneAudioBuffer | AudioBuffer): AudioBuffer {
  if (buf instanceof AudioBuffer) return buf;
  const inner = buf.get();
  if (!inner) throw new Error('ToneAudioBuffer has no underlying AudioBuffer');
  return inner;
}

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

// ─── Drum Loop Generators ───────────────────────────────────────────────────

// Tiny offset so the first note is not at exactly t=0 in Tone.Offline
const T0 = 0.005;

// Helper: create a hi-hat–like NoiseSynth (replaces MetalSynth which
// crashes in Tone.Offline due to "start time must be strictly greater")
function makeHat(volume: number) {
  const filter = new Tone.Filter({ frequency: 8000, type: 'highpass' }).toDestination();
  return new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.04, sustain: 0, release: 0.01 },
    volume,
  }).connect(filter);
}

async function generate808Boom(duration: number): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(() => {
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.08,
      octaves: 6,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.006, decay: 0.5, sustain: 0, release: 0.5 },
    }).toDestination();
    const hat = makeHat(-12);

    const beatTime = 60 / 90;
    for (let bar = 0; bar < 4; bar++) {
      const offset = T0 + bar * 4 * beatTime;
      kick.triggerAttackRelease('C1', '8n', offset);
      kick.triggerAttackRelease('C1', '8n', offset + 2 * beatTime);
      kick.triggerAttackRelease('C1', '8n', offset + 2.75 * beatTime);
      for (let i = 0; i < 8; i++) {
        hat.triggerAttackRelease('16n', offset + i * beatTime * 0.5);
      }
    }
  }, duration);
  return toAudioBuffer(buffer);
}

async function generateRockSteady(duration: number): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(() => {
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.05, octaves: 4,
      envelope: { attack: 0.005, decay: 0.3, sustain: 0, release: 0.3 },
    }).toDestination();
    const snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.1 },
      volume: -6,
    }).toDestination();
    const hat = makeHat(-14);

    const beat = 60 / 120;
    for (let bar = 0; bar < 4; bar++) {
      const o = T0 + bar * 4 * beat;
      kick.triggerAttackRelease('C1', '8n', o);
      kick.triggerAttackRelease('C1', '8n', o + 2 * beat);
      snare.triggerAttackRelease('8n', o + beat);
      snare.triggerAttackRelease('8n', o + 3 * beat);
      for (let i = 0; i < 8; i++) {
        hat.triggerAttackRelease('16n', o + i * beat * 0.5);
      }
    }
  }, duration);
  return toAudioBuffer(buffer);
}

async function generateShuffleBlues(duration: number): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(() => {
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.05, octaves: 4,
      envelope: { attack: 0.005, decay: 0.3, sustain: 0, release: 0.3 },
    }).toDestination();
    const snare = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.002, decay: 0.12, sustain: 0, release: 0.1 },
      volume: -8,
    }).toDestination();
    const hat = makeHat(-14);

    const beat = 60 / 95;
    const triplet = beat / 3;
    for (let bar = 0; bar < 4; bar++) {
      const o = T0 + bar * 4 * beat;
      kick.triggerAttackRelease('C1', '8n', o);
      kick.triggerAttackRelease('C1', '8n', o + 2 * beat);
      snare.triggerAttackRelease('8n', o + beat);
      snare.triggerAttackRelease('8n', o + 3 * beat);
      for (let i = 0; i < 4; i++) {
        hat.triggerAttackRelease('32n', o + i * beat);
        hat.triggerAttackRelease('32n', o + i * beat + triplet * 2);
      }
    }
  }, duration);
  return toAudioBuffer(buffer);
}

async function generateTrapHiHats(duration: number): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(() => {
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.08, octaves: 6,
      envelope: { attack: 0.006, decay: 0.5, sustain: 0, release: 0.4 },
    }).toDestination();
    // Two hat voices for overlapping rapid-fire patterns
    const hat1 = makeHat(-10);
    const hat2 = makeHat(-10);
    const snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
      volume: -4,
    }).toDestination();

    const beat = 60 / 140;
    for (let bar = 0; bar < 4; bar++) {
      const o = T0 + bar * 4 * beat;
      kick.triggerAttackRelease('C1', '8n', o);
      kick.triggerAttackRelease('C1', '8n', o + 2.5 * beat);
      snare.triggerAttackRelease('8n', o + beat);
      snare.triggerAttackRelease('8n', o + 3 * beat);
      // Main 16th-note hi-hats
      for (let i = 0; i < 16; i++) {
        hat1.triggerAttackRelease('32n', o + i * beat * 0.25);
      }
      // Rapid rolls on beat 4 (use second voice to avoid overlap)
      for (let i = 0; i < 4; i++) {
        hat2.triggerAttackRelease('32n', o + 3 * beat + i * beat * 0.125);
      }
    }
  }, duration);
  return toAudioBuffer(buffer);
}

async function generateLoFiDrums(duration: number): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(() => {
    const kick = new Tone.MembraneSynth({
      pitchDecay: 0.05, octaves: 4,
      envelope: { attack: 0.01, decay: 0.3, sustain: 0, release: 0.3 },
      volume: -3,
    }).toDestination();
    const snare = new Tone.NoiseSynth({
      noise: { type: 'brown' },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0, release: 0.1 },
      volume: -8,
    }).toDestination();
    const hat = makeHat(-16);

    const beat = 60 / 85;
    for (let bar = 0; bar < 4; bar++) {
      const o = T0 + bar * 4 * beat;
      kick.triggerAttackRelease('C1', '8n', o);
      kick.triggerAttackRelease('C1', '8n', o + 1.75 * beat);
      kick.triggerAttackRelease('C1', '8n', o + 2.5 * beat);
      snare.triggerAttackRelease('8n', o + beat);
      snare.triggerAttackRelease('8n', o + 3 * beat);
      for (let i = 0; i < 8; i++) {
        hat.triggerAttackRelease('32n', o + i * beat * 0.5);
      }
    }
  }, duration);
  return toAudioBuffer(buffer);
}

// ─── Bass Loop Generators ───────────────────────────────────────────────────

async function generateSubBass(duration: number): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(({ transport }) => {
    transport.bpm.value = 90;
    const synth = new Tone.MonoSynth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.3, sustain: 0.6, release: 0.3 },
      filterEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.5, release: 0.2, baseFrequency: 60, octaves: 1 },
      volume: -3,
    }).toDestination();

    const beat = 60 / 90;
    const notes = ['C1', 'C1', 'Eb1', 'F1'];
    for (let bar = 0; bar < 4; bar++) {
      const o = bar * 4 * beat;
      const note = notes[bar % notes.length];
      synth.triggerAttackRelease(note, beat * 2, o);
      synth.triggerAttackRelease(note, beat, o + 2.5 * beat);
    }
    transport.start(0);
  }, duration);
  return toAudioBuffer(buffer);
}

async function generateWalkingBass(duration: number): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(({ transport }) => {
    transport.bpm.value = 120;
    const synth = new Tone.MonoSynth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.15 },
      filterEnvelope: { attack: 0.01, decay: 0.1, sustain: 0.3, release: 0.2, baseFrequency: 100, octaves: 2 },
      volume: -4,
    }).toDestination();

    const beat = 60 / 120;
    const pattern = [
      'C2', 'E2', 'G2', 'A2',
      'F2', 'A2', 'C3', 'D3',
      'G2', 'B2', 'D3', 'E3',
      'C2', 'D2', 'E2', 'G2',
    ];
    for (let i = 0; i < pattern.length; i++) {
      synth.triggerAttackRelease(pattern[i], beat * 0.8, i * beat);
    }
    transport.start(0);
  }, duration);
  return toAudioBuffer(buffer);
}

async function generateFunkSlap(duration: number): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(({ transport }) => {
    transport.bpm.value = 110;
    const synth = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.005, decay: 0.15, sustain: 0.2, release: 0.1 },
      filterEnvelope: { attack: 0.005, decay: 0.08, sustain: 0.2, release: 0.1, baseFrequency: 200, octaves: 3 },
      volume: -5,
    }).toDestination();

    const beat = 60 / 110;
    const notes = ['E2', null, 'E2', 'G2', null, 'A2', null, 'E2',
                   'G2', null, 'E2', null, 'A2', 'G2', null, 'E2'];
    for (let bar = 0; bar < 4; bar++) {
      const o = bar * 4 * beat;
      for (let i = 0; i < 16; i++) {
        const n = notes[i];
        if (n) {
          synth.triggerAttackRelease(n, beat * 0.2, o + i * beat * 0.25);
        }
      }
    }
    transport.start(0);
  }, duration);
  return toAudioBuffer(buffer);
}

async function generateSynthBass(duration: number): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(({ transport }) => {
    transport.bpm.value = 128;
    const synth = new Tone.MonoSynth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.5, release: 0.15 },
      filterEnvelope: { attack: 0.01, decay: 0.15, sustain: 0.3, release: 0.2, baseFrequency: 150, octaves: 2.5 },
      volume: -5,
    }).toDestination();

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
        synth.triggerAttackRelease(p.note, beat * p.dur, o + p.time * beat);
      }
    }
    transport.start(0);
  }, duration);
  return toAudioBuffer(buffer);
}

// ─── Keys Loop Generators ───────────────────────────────────────────────────

async function generatePianoBallad(duration: number): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(({ transport }) => {
    transport.bpm.value = 80;
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.02, decay: 0.5, sustain: 0.3, release: 0.8 },
      volume: -6,
    }).toDestination();

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
    transport.start(0);
  }, duration);
  return toAudioBuffer(buffer);
}

async function generateRhodesGroove(duration: number): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(({ transport }) => {
    transport.bpm.value = 100;
    const synth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 2,
      modulationIndex: 1.5,
      envelope: { attack: 0.01, decay: 0.4, sustain: 0.2, release: 0.6 },
      modulation: { type: 'sine' },
      modulationEnvelope: { attack: 0.02, decay: 0.3, sustain: 0.2, release: 0.4 },
      volume: -8,
    }).toDestination();

    const beat = 60 / 100;
    const pattern: [string[], number, number][] = [
      [['Eb4', 'G4', 'Bb4'], 0, 0.5],
      [['Eb4', 'G4', 'Bb4'], 0.75, 0.25],
      [['Ab3', 'C4', 'Eb4'], 2, 1],
      [['Bb3', 'D4', 'F4'], 3, 0.5],
      [['Bb3', 'D4', 'F4'], 3.75, 0.25],
    ];
    for (let bar = 0; bar < 4; bar++) {
      const o = bar * 4 * beat;
      for (const [notes, t, dur] of pattern) {
        synth.triggerAttackRelease(notes, beat * dur, o + t * beat);
      }
    }
    transport.start(0);
  }, duration);
  return toAudioBuffer(buffer);
}

async function generateAmbientPad(duration: number): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(({ transport }) => {
    transport.bpm.value = 70;
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 1.5, decay: 2, sustain: 0.6, release: 3 },
      volume: -8,
    }).toDestination();
    const reverb = new Tone.Reverb({ decay: 5, wet: 0.7 }).toDestination();
    synth.connect(reverb);

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
    transport.start(0);
  }, duration);
  return toAudioBuffer(buffer);
}

// ─── Synth Loop Generators ──────────────────────────────────────────────────

async function generateArpCascade(duration: number): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(({ transport }) => {
    transport.bpm.value = 128;
    const synth = new Tone.Synth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.005, decay: 0.15, sustain: 0.1, release: 0.1 },
      volume: -8,
    }).toDestination();
    const delay = new Tone.FeedbackDelay({ delayTime: '8n', feedback: 0.2, wet: 0.3 }).toDestination();
    synth.connect(delay);

    const beat = 60 / 128;
    const arpNotes = ['C4', 'E4', 'G4', 'B4', 'C5', 'B4', 'G4', 'E4'];
    for (let bar = 0; bar < 4; bar++) {
      const o = bar * 4 * beat;
      for (let i = 0; i < 8; i++) {
        synth.triggerAttackRelease(arpNotes[i % arpNotes.length], '16n', o + i * beat * 0.5);
      }
    }
    transport.start(0);
  }, duration);
  return toAudioBuffer(buffer);
}

async function generateLeadLine(duration: number): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(({ transport }) => {
    transport.bpm.value = 120;
    const synth = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.2 },
      volume: -8,
    }).toDestination();

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
    transport.start(0);
  }, duration);
  return toAudioBuffer(buffer);
}

async function generatePluckStab(duration: number): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(({ transport }) => {
    transport.bpm.value = 130;
    const synth = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.1, sustain: 0.05, release: 0.1 },
      volume: -6,
    }).toDestination();

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
        synth.triggerAttackRelease(notes, '16n', o + t * beat);
      }
    }
    transport.start(0);
  }, duration);
  return toAudioBuffer(buffer);
}

// ─── FX Loop Generators ─────────────────────────────────────────────────────

async function generateRiser(duration: number): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(() => {
    const filter = new Tone.Filter({ frequency: 200, type: 'lowpass' }).toDestination();
    const synth = new Tone.Synth({
      oscillator: { type: 'sawtooth' },
      envelope: { attack: duration * 0.9, decay: 0.1, sustain: 1, release: 0.1 },
      volume: -12,
    }).connect(filter);
    filter.frequency.linearRampTo(8000, duration * 0.9, T0);
    synth.triggerAttackRelease('C3', duration * 0.95, T0);
  }, duration);
  return toAudioBuffer(buffer);
}

async function generateImpact(duration: number): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(() => {
    const noise = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.8, sustain: 0, release: 0.5 },
      volume: -4,
    }).toDestination();
    const sub = new Tone.MembraneSynth({
      pitchDecay: 0.2,
      octaves: 8,
      envelope: { attack: 0.001, decay: 1.5, sustain: 0, release: 0.5 },
      volume: -2,
    }).toDestination();
    noise.triggerAttackRelease('4n', T0);
    sub.triggerAttackRelease('C1', '2n', T0);
  }, duration);
  return toAudioBuffer(buffer);
}

async function generateSweepDown(duration: number): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(() => {
    const synth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: duration * 0.8, sustain: 0, release: 0.2 },
      volume: -8,
    }).toDestination();
    synth.frequency.setValueAtTime(4000, T0);
    synth.frequency.exponentialRampTo(60, duration * 0.8, T0);
    synth.triggerAttackRelease(duration * 0.85, T0);
  }, duration);
  return toAudioBuffer(buffer);
}

// ─── Vocal Loop Generators ──────────────────────────────────────────────────

async function generateVocalChop(duration: number): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(() => {
    // Simulate vocal-like formant sound using FM synthesis
    const synth = new Tone.FMSynth({
      harmonicity: 3,
      modulationIndex: 10,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.2 },
      modulation: { type: 'square' },
      modulationEnvelope: { attack: 0.02, decay: 0.1, sustain: 0.5, release: 0.2 },
      volume: -8,
    }).toDestination();

    const beat = 60 / 120;
    const notes = ['C4', 'E4', 'G4', 'C5', 'G4', 'E4', 'C4', 'D4'];
    for (let bar = 0; bar < 2; bar++) {
      const o = bar * 4 * beat;
      for (let i = 0; i < 8; i++) {
        synth.triggerAttackRelease(notes[i], beat * 0.3, o + i * beat * 0.5);
      }
    }
  }, duration);
  return toAudioBuffer(buffer);
}

async function generateVocalPad(duration: number): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(() => {
    // Airy vocal-like pad using FM synthesis with slow modulation
    const synth = new Tone.PolySynth(Tone.FMSynth, {
      harmonicity: 2,
      modulationIndex: 3,
      oscillator: { type: 'sine' },
      envelope: { attack: 0.8, decay: 1.5, sustain: 0.4, release: 1.5 },
      modulation: { type: 'sine' },
      modulationEnvelope: { attack: 0.5, decay: 1, sustain: 0.3, release: 1 },
      volume: -10,
    }).toDestination();
    const reverb = new Tone.Reverb({ decay: 4, wet: 0.6 }).toDestination();
    synth.connect(reverb);

    const beat = 60 / 80;
    synth.triggerAttackRelease(['C4', 'E4', 'G4'], beat * 8, 0);
    synth.triggerAttackRelease(['A3', 'C4', 'E4'], beat * 8, beat * 8);
  }, duration);
  return toAudioBuffer(buffer);
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
