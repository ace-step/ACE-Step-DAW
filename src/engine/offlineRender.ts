import * as Tone from 'tone';
import type { ToneAudioBuffer } from 'tone';
import { createDrumVoicesForKit } from './DrumEngine';
import { createSynthForPreset } from './SynthEngine';
import type { DrumKitName, MidiNote, SequencerPattern, SynthPreset } from '../types/project';

const DRUM_PAD_INDEX_BY_SAMPLE_KEY: Record<string, number> = {
  kick: 0,
  snare: 1,
  closed_hh: 2,
  open_hh: 3,
  clap: 4,
  rim: 5,
  high_tom: 6,
  low_tom: 7,
  crash: 8,
  ride: 9,
  shaker: 10,
  cowbell: 11,
  conga: 12,
  bongo: 13,
  tambourine: 14,
  perc: 15,
};

function toAudioBuffer(buffer: ToneAudioBuffer | AudioBuffer): AudioBuffer {
  if (buffer instanceof AudioBuffer) {
    return buffer;
  }

  const nativeBuffer = buffer.get();
  if (!nativeBuffer) {
    throw new Error('Offline render returned no AudioBuffer');
  }

  return nativeBuffer;
}

export async function renderMidiTrackOffline(
  notes: MidiNote[],
  clipStartTime: number,
  bpm: number,
  synthPreset: SynthPreset,
  totalDuration: number,
  sampleRate: number = 48000,
): Promise<AudioBuffer> {
  const buffer = await Tone.Offline(({ transport }) => {
    const synth = createSynthForPreset(synthPreset);
    const gain = new Tone.Gain(0.55).toDestination();
    synth.connect(gain);

    transport.bpm.value = bpm;
    const secondsPerBeat = 60 / bpm;

    for (const note of notes) {
      const noteDuration = Math.max(0, note.durationBeats * secondsPerBeat);
      const noteStart = clipStartTime + note.startBeat * secondsPerBeat;
      const noteEnd = noteStart + noteDuration;
      if (noteDuration <= 0 || noteEnd <= 0 || noteStart >= totalDuration) continue;

      const velocity = Math.max(0, Math.min(1, note.velocity));
      const frequency = Tone.Frequency(note.pitch, 'midi').toFrequency();
      transport.schedule((time) => {
        synth.triggerAttackRelease(frequency, noteDuration, time, velocity);
      }, noteStart);
    }

    transport.start(0);
  }, totalDuration, 2, sampleRate);

  return toAudioBuffer(buffer);
}

export async function renderSequencerTrackOffline(
  pattern: SequencerPattern,
  bpm: number,
  totalDuration: number,
  drumKit: DrumKitName = '808',
  sampleRate: number = 48000,
): Promise<AudioBuffer> {
  let voices: ReturnType<typeof createDrumVoicesForKit> = [];

  try {
    const buffer = await Tone.Offline(({ transport }) => {
      const gain = new Tone.Gain(1).toDestination();
      voices = createDrumVoicesForKit(drumKit, gain);

      transport.bpm.value = bpm;

      const totalSteps = pattern.stepsPerBar * pattern.bars;
      const stepDuration = (60 / bpm) / (pattern.stepsPerBar / 4);
      const patternDuration = totalSteps * stepDuration;
      const loopCount = patternDuration > 0 ? Math.ceil(totalDuration / patternDuration) : 0;

      for (let loopIndex = 0; loopIndex < loopCount; loopIndex++) {
        const loopStart = loopIndex * patternDuration;

        for (const row of pattern.rows) {
          if (row.muted) continue;

          const padIndex = DRUM_PAD_INDEX_BY_SAMPLE_KEY[row.sampleKey];
          if (padIndex === undefined || !voices[padIndex]) continue;

          for (let stepIndex = 0; stepIndex < row.steps.length; stepIndex++) {
            const step = row.steps[stepIndex];
            if (!step?.active) continue;

            let swingOffset = 0;
            if (pattern.swing > 0 && stepIndex % 2 === 1) {
              swingOffset = stepDuration * pattern.swing * 0.5;
            }

            const stepTime = loopStart + stepIndex * stepDuration + swingOffset;
            if (stepTime >= totalDuration) continue;

            const velocity = Math.max(0, Math.min(1, step.velocity * row.volume));
            if (velocity <= 0) continue;

            transport.schedule((time) => {
              voices[padIndex]?.trigger(time, velocity);
            }, stepTime);
          }
        }
      }

      transport.start(0);
    }, totalDuration, 2, sampleRate);

    return toAudioBuffer(buffer);
  } finally {
    for (const voice of voices) {
      voice.dispose();
    }
  }
}
