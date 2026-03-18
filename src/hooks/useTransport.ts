import { useCallback, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { useTransportStore } from '../store/transportStore';
import { useProjectStore } from '../store/projectStore';
import { getAudioEngine } from './useAudioEngine';
import { loadAudioBlobByKey } from '../services/audioFileManager';
import { synthEngine } from '../engine/SynthEngine';
import { drumEngine } from '../engine/DrumEngine';

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

/**
 * Trim an AudioBuffer to a specific project-time region.
 * The input buffer may cover the full project duration; the output covers only
 * [clipStartTime, clipStartTime + clipDuration].
 */
function trimBuffer(
  ctx: AudioContext,
  buffer: AudioBuffer,
  clipStartTime: number,
  clipDuration: number,
): AudioBuffer {
  const sr = buffer.sampleRate;
  const startSample = Math.round(clipStartTime * sr);
  const endSample = Math.min(
    Math.round((clipStartTime + clipDuration) * sr),
    buffer.length,
  );
  const trimmedLength = Math.max(1, endSample - startSample);
  const trimmed = ctx.createBuffer(buffer.numberOfChannels, trimmedLength, sr);
  for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
    const src = buffer.getChannelData(ch);
    const dst = trimmed.getChannelData(ch);
    for (let i = 0; i < trimmedLength; i++) {
      dst[i] = src[startSample + i];
    }
  }
  return trimmed;
}

export function useTransport() {
  const { isPlaying, currentTime } = useTransportStore();
  const project = useProjectStore((s) => s.project);
  const scheduledTransportEventIdsRef = useRef<number[]>([]);

  const clearScheduledTransportEvents = useCallback(() => {
    const transport = Tone.getTransport();
    transport.stop();
    for (const id of scheduledTransportEventIdsRef.current) {
      transport.clear(id);
    }
    scheduledTransportEventIdsRef.current = [];
  }, []);

  const play = useCallback(async (fromTime?: number) => {
    const engine = getAudioEngine();
    await engine.resume();
    await synthEngine.ensureStarted();
    await drumEngine.ensureStarted();

    const proj = useProjectStore.getState().project;
    if (!proj) return;

    clearScheduledTransportEvents();

    // Sync master volume
    engine.masterVolume = proj.masterVolume ?? 1.0;

    interface ScheduleEntry {
      clipId: string;
      trackId: string;
      startTime: number;
      buffer: AudioBuffer;
      audioOffset: number;
      clipDuration: number;
    }
    const clipBuffers: ScheduleEntry[] = [];

    for (const track of proj.tracks) {
      const trackNode = engine.getOrCreateTrackNode(track.id);
      trackNode.volume = track.volume;
      trackNode.muted = track.muted;
      trackNode.soloed = track.soloed;
      trackNode.pan = track.pan ?? 0;
      trackNode.eqLowGain = track.eqLowGain ?? 0;
      trackNode.eqMidGain = track.eqMidGain ?? 0;
      trackNode.eqHighGain = track.eqHighGain ?? 0;
      trackNode.applyCompressor(
        track.compressorEnabled ?? false,
        track.compressorThreshold ?? -24,
        track.compressorRatio ?? 4,
      );
      trackNode.setReverb(track.reverbMix ?? 0, track.reverbRoomSize ?? 0.5);

      for (const clip of track.clips) {
        if (clip.generationStatus !== 'ready') continue;

        // Try isolated audio first (pre-trimmed to clip region at generation),
        // fall back to cumulative mix (full project-length, needs trimming).
        let blob: Blob | undefined;
        let alreadyTrimmed = false;

        if (clip.isolatedAudioKey) {
          blob = await loadAudioBlobByKey(clip.isolatedAudioKey);
          if (blob) alreadyTrimmed = true;
        }
        if (!blob && clip.cumulativeMixKey) {
          blob = await loadAudioBlobByKey(clip.cumulativeMixKey);
        }
        if (!blob) continue;

        const rawBuffer = await engine.decodeAudioData(blob);
        const buffer = alreadyTrimmed
          ? rawBuffer
          : trimBuffer(engine.ctx, rawBuffer, clip.startTime, clip.duration);

        clipBuffers.push({
          clipId: clip.id,
          trackId: track.id,
          startTime: clip.startTime,
          buffer,
          audioOffset: clip.audioOffset ?? 0,
          clipDuration: clip.duration,
        });
      }
    }

    engine.updateSoloState();

    const startFrom = fromTime ?? useTransportStore.getState().currentTime;

    // Loop end = last clip's endpoint (or full timeline if no clips)
    const { loopEnabled } = useTransportStore.getState();
    let effectiveEnd = proj.totalDuration;
    if (loopEnabled && clipBuffers.length > 0) {
      const lastClipEnd = clipBuffers.reduce(
        (max, cb) => Math.max(max, cb.startTime + cb.clipDuration), 0,
      );
      if (lastClipEnd > 0) effectiveEnd = lastClipEnd;
    }

    engine.schedulePlayback(clipBuffers, startFrom, effectiveEnd);

    const { metronomeEnabled } = useTransportStore.getState();
    if (metronomeEnabled) {
      engine.scheduleMetronome(proj.bpm, proj.timeSignature, startFrom, effectiveEnd);
    }

    const transport = Tone.getTransport();
    transport.bpm.value = proj.bpm;
    transport.timeSignature = proj.timeSignature;

    const secondsPerBeat = 60 / proj.bpm;
    const anySoloed = proj.tracks.some((track) => track.soloed);

    for (const track of proj.tracks) {
      if (track.trackType === 'pianoRoll') {
        const preset = track.synthPreset ?? 'piano';
        const trackNode = engine.getOrCreateTrackNode(track.id);
        synthEngine.removeTrackSynth(track.id);
        const synth = synthEngine.ensureTrackSynth(track.id, preset, trackNode.inputGain);

        for (const clip of track.clips) {
          const notes = clip.midiData?.notes ?? [];
          if (notes.length === 0) continue;

          for (const note of notes) {
            const noteStart = clip.startTime + note.startBeat * secondsPerBeat;
            const noteDuration = Math.max(0, note.durationBeats * secondsPerBeat);
            const noteEnd = noteStart + noteDuration;
            if (noteEnd <= startFrom || noteStart >= effectiveEnd || noteDuration <= 0) continue;

            const scheduledStart = Math.max(noteStart, startFrom);
            const scheduledDuration = noteEnd - scheduledStart;
            const velocity = Math.max(0, Math.min(1, note.velocity));
            const freq = Tone.Frequency(note.pitch, 'midi').toFrequency();

            const id = transport.schedule((time) => {
              synth.triggerAttackRelease(freq, scheduledDuration, time, velocity);
            }, scheduledStart);
            scheduledTransportEventIdsRef.current.push(id);
          }
        }
      }

      if (track.trackType === 'sequencer' && track.sequencerPattern) {
        if (track.muted) continue;
        if (anySoloed && !track.soloed) continue;

        const { sequencerPattern } = track;
        const stepDuration = (60 / proj.bpm) / (sequencerPattern.stepsPerBar / 4);
        const totalSteps = sequencerPattern.stepsPerBar * sequencerPattern.bars;
        const patternDuration = stepDuration * totalSteps;
        if (patternDuration <= 0) continue;

        const firstLoopIndex = Math.floor(startFrom / patternDuration);
        const lastLoopIndex = Math.ceil(effectiveEnd / patternDuration);

        for (let loopIndex = firstLoopIndex; loopIndex < lastLoopIndex; loopIndex++) {
          const loopStart = loopIndex * patternDuration;

          for (const row of sequencerPattern.rows) {
            if (row.muted) continue;
            const padIndex = DRUM_PAD_INDEX_BY_SAMPLE_KEY[row.sampleKey];
            if (padIndex === undefined) continue;

            for (let stepIndex = 0; stepIndex < row.steps.length; stepIndex++) {
              const step = row.steps[stepIndex];
              if (!step?.active) continue;

              let swingOffset = 0;
              if (sequencerPattern.swing > 0 && stepIndex % 2 === 1) {
                swingOffset = stepDuration * sequencerPattern.swing * 0.5;
              }

              const stepTime = loopStart + stepIndex * stepDuration + swingOffset;
              if (stepTime < startFrom || stepTime >= effectiveEnd) continue;

              const velocity = Math.round(
                Math.max(0, Math.min(1, step.velocity * row.volume * track.volume)) * 127,
              );
              if (velocity <= 0) continue;

              const id = transport.schedule(() => {
                void drumEngine.triggerPad(track.id, padIndex, velocity, track.drumKit ?? '808');
              }, stepTime);
              scheduledTransportEventIdsRef.current.push(id);
            }
          }
        }
      }
    }

    transport.start(undefined, startFrom);
    useTransportStore.getState().play();
  }, [clearScheduledTransportEvents]);

  const pause = useCallback(() => {
    const engine = getAudioEngine();
    const time = engine.getCurrentTime();
    engine.stop();
    clearScheduledTransportEvents();
    useTransportStore.getState().pause();
    useTransportStore.getState().seek(time);
  }, [clearScheduledTransportEvents]);

  const stop = useCallback(() => {
    const engine = getAudioEngine();
    engine.stop();
    clearScheduledTransportEvents();
    useTransportStore.getState().stop();
  }, [clearScheduledTransportEvents]);

  const seek = useCallback((time: number) => {
    const engine = getAudioEngine();
    if (engine.playing) {
      engine.stop();
      clearScheduledTransportEvents();
      useTransportStore.getState().seek(time);
      play(time);
    } else {
      useTransportStore.getState().seek(time);
    }
  }, [clearScheduledTransportEvents, play]);

  // Register the onEnded callback — respect loopEnabled
  useEffect(() => {
    const engine = getAudioEngine();
    engine.setOnEndedCallback(() => {
      const { loopEnabled } = useTransportStore.getState();
      if (loopEnabled) {
        useTransportStore.getState().setCurrentTime(0);
        play(0);
      } else {
        useTransportStore.getState().stop();
      }
    });
    return () => {
      engine.setOnEndedCallback(() => {});
    };
  }, [play]);

  // Sync mixer params to audio engine TrackNodes during playback
  useEffect(() => {
    if (!project || !isPlaying) return;
    const engine = getAudioEngine();
    engine.masterVolume = project.masterVolume ?? 1.0;
    for (const track of project.tracks) {
      const trackNode = engine.trackNodes.get(track.id);
      if (trackNode) {
        trackNode.volume = track.volume;
        trackNode.muted = track.muted;
        trackNode.soloed = track.soloed;
        trackNode.pan = track.pan ?? 0;
        trackNode.eqLowGain = track.eqLowGain ?? 0;
        trackNode.eqMidGain = track.eqMidGain ?? 0;
        trackNode.eqHighGain = track.eqHighGain ?? 0;
        trackNode.applyCompressor(
          track.compressorEnabled ?? false,
          track.compressorThreshold ?? -24,
          track.compressorRatio ?? 4,
        );
        trackNode.setReverb(track.reverbMix ?? 0, track.reverbRoomSize ?? 0.5);
      }
    }
    engine.updateSoloState();
  }, [project, isPlaying]);

  return { isPlaying, currentTime, play, pause, stop, seek };
}
