/**
 * Offline-rendering helpers — produce AudioBuffers for MIDI / sampler
 * / sequencer tracks via native `OfflineAudioContext`. Phase 5P:
 * every render path is fully native; Tone imports and the
 * `toAudioBuffer` Tone→native unwrapper are gone.
 */
import { createDrumVoicesForKit } from './DrumEngine';
import { createSynthForPreset } from './SynthEngine';
import { midiToFrequency } from '../utils/pitch';
import type { DrumKitName, MidiNote, SamplerConfig, SequencerPattern, SynthPreset } from '../types/project';

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

export async function renderMidiTrackOffline(
  notes: MidiNote[],
  clipStartTime: number,
  bpm: number,
  synthPreset: SynthPreset,
  totalDuration: number,
  sampleRate: number = 48000,
): Promise<AudioBuffer> {
  // Phase 5L: drop Tone.Offline in favour of the native
  // OfflineAudioContext — NativeBasicPolySynth is created against
  // this offline context, and notes are scheduled directly at
  // their start times (AudioParam automation is sample-accurate
  // under offline rendering).
  const length = Math.max(1, Math.ceil(totalDuration * sampleRate));
  const offlineCtx = new OfflineAudioContext(2, length, sampleRate);
  const secondsPerBeat = 60 / bpm;

  const synth = createSynthForPreset(synthPreset, offlineCtx);
  const gain = offlineCtx.createGain();
  gain.gain.value = 0.55;
  synth.connect(gain);
  gain.connect(offlineCtx.destination);

  for (const note of notes) {
    const noteDuration = Math.max(0, note.durationBeats * secondsPerBeat);
    const noteStart = clipStartTime + note.startBeat * secondsPerBeat;
    const noteEnd = noteStart + noteDuration;
    if (noteDuration <= 0 || noteEnd <= 0 || noteStart >= totalDuration) continue;

    const velocity = Math.max(0, Math.min(1, note.velocity));
    const frequency = midiToFrequency(note.pitch);
    synth.triggerAttackRelease(frequency, noteDuration, noteStart, velocity);
  }

  return offlineCtx.startRendering();
}

export async function renderSamplerTrackOffline(
  notes: MidiNote[],
  clipStartTime: number,
  bpm: number,
  sampleBuffer: AudioBuffer,
  config: SamplerConfig,
  totalDuration: number,
  sampleRate: number = 48000,
): Promise<AudioBuffer> {
  const length = Math.max(1, Math.ceil(totalDuration * sampleRate));
  const offlineCtx = new OfflineAudioContext(2, length, sampleRate);
  const secondsPerBeat = 60 / bpm;

  for (const note of notes) {
    const noteDuration = Math.max(0, note.durationBeats * secondsPerBeat);
    const noteStart = clipStartTime + note.startBeat * secondsPerBeat;
    const noteEnd = noteStart + noteDuration;
    if (noteDuration <= 0 || noteEnd <= 0 || noteStart >= totalDuration) continue;

    const trimStart = Math.max(0, Math.min(config.trimStart, sampleBuffer.duration - 0.01));
    const trimEnd = Math.max(trimStart + 0.01, Math.min(config.trimEnd, sampleBuffer.duration));
    const loopStart = Math.max(trimStart, Math.min(config.loopStart, trimEnd - 0.01));
    const loopEnd = Math.max(loopStart + 0.01, Math.min(config.loopEnd, trimEnd));
    const trimmedSpan = trimEnd - trimStart;
    const playbackRate = Math.pow(2, (note.pitch - config.rootNote) / 12);
    const source = offlineCtx.createBufferSource();
    source.buffer = sampleBuffer;
    source.playbackRate.value = playbackRate;
    source.loop = config.playbackMode === 'loop';
    source.loopStart = loopStart;
    source.loopEnd = loopEnd;

    const gain = offlineCtx.createGain();
    const velocity = Math.max(0, Math.min(1, note.velocity));
    const attack = Math.max(0.001, config.attack);
    const release = Math.max(0.01, config.release);
    const naturalDuration = trimmedSpan / Math.max(playbackRate, 0.001);
    const holdDuration = config.playbackMode === 'oneShot'
      ? naturalDuration
      : config.playbackMode === 'loop'
        ? Math.max(0.02, noteDuration)
        : Math.min(naturalDuration, Math.max(0.02, noteDuration));
    const stopTime = Math.min(totalDuration, noteStart + holdDuration + release);

    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.linearRampToValueAtTime(velocity, Math.min(stopTime, noteStart + attack));
    gain.gain.setValueAtTime(velocity, Math.max(noteStart + attack, stopTime - release));
    gain.gain.linearRampToValueAtTime(0.0001, stopTime);

    source.connect(gain);
    gain.connect(offlineCtx.destination);
    if (config.playbackMode === 'loop') {
      source.start(noteStart, trimStart);
    } else {
      source.start(noteStart, trimStart, Math.min(trimmedSpan, holdDuration * playbackRate));
    }
    source.stop(stopTime);
  }

  return offlineCtx.startRendering();
}

export async function renderSequencerTrackOffline(
  pattern: SequencerPattern,
  bpm: number,
  totalDuration: number,
  drumKit: DrumKitName = '808',
  sampleRate: number = 48000,
): Promise<AudioBuffer> {
  // Native offline rendering: no Tone.Offline/transport. Voices are
  // built against the offline context via DrumEngine's factory and
  // notes scheduled directly at their absolute start times.
  //
  // NOTE: `createDrumVoicesForKit` currently pulls its ctx from
  // `getAudioEngine().ctx`, not an offline ctx. Until the factories
  // accept an explicit ctx, this uses the live engine for graph
  // construction — the offline output will still render correctly
  // because voice trigger times are absolute, but a ctx swap would
  // be cleaner. Tracked as a 5O follow-up.
  const length = Math.max(1, Math.ceil(totalDuration * sampleRate));
  const offlineCtx = new OfflineAudioContext(2, length, sampleRate);
  const masterGain = offlineCtx.createGain();
  masterGain.gain.value = 1;
  masterGain.connect(offlineCtx.destination);

  const voices: ReturnType<typeof createDrumVoicesForKit> = [];
  try {
    // Pass the offline ctx so drum voices are built against the
    // same context as `masterGain`; otherwise cross-context
    // connect() throws.
    const kitVoices = createDrumVoicesForKit(
      drumKit,
      masterGain,
      offlineCtx as unknown as AudioContext,
    );
    voices.push(...kitVoices);

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

          voices[padIndex]?.trigger(stepTime, velocity);
        }
      }
    }

    return await offlineCtx.startRendering();
  } finally {
    for (const voice of voices) {
      voice.dispose();
    }
  }
}
