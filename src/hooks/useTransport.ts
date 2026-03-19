import { useCallback, useEffect, useRef } from 'react';
import * as Tone from 'tone';
import { useTransportStore } from '../store/transportStore';
import { useProjectStore } from '../store/projectStore';
import { useUIStore } from '../store/uiStore';
import { getAudioEngine } from './useAudioEngine';
import { loadAudioBlobByKey } from '../services/audioFileManager';
import { synthEngine } from '../engine/SynthEngine';
import { createSamplerConfig, samplerEngine } from '../engine/SamplerEngine';
import { drumEngine } from '../engine/DrumEngine';
import { automationEngine } from '../engine/AutomationEngine';
import { useRecording } from './useRecording';
import { beatToTime } from '../utils/tempoMap';
import { getPlaybackLatencyCompensationSeconds } from '../utils/playbackLatency';
import type { Clip, Project, Track } from '../types/project';
import { toastInfo } from './useToast';
import type { TimelineScrubClip } from '../engine/AudioEngine';

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

function isSessionPlayableClip(clip: Clip): boolean {
  return clip.generationStatus === 'ready' || (clip.midiData?.notes.length ?? 0) > 0;
}

function getSessionTracks(project: Project): Array<{ track: Track; clip: Clip; launch: { sceneIndex: number; launchedAt: number } }> {
  const launched = useTransportStore.getState().launchedSessionClips;
  return project.tracks.flatMap((track) => {
    const launch = launched[track.id];
    if (!launch) return [];
    const clip = track.clips.find((candidate) => candidate.id === launch.clipId);
    if (!clip || !isSessionPlayableClip(clip)) return [];
    return [{ track, clip, launch }];
  });
}

function getSessionPlaybackEnd(project: Project, startFrom: number): number {
  const launches = Object.values(useTransportStore.getState().launchedSessionClips);
  if (launches.length === 0) return Math.max(project.totalDuration, startFrom + 30);
  return Math.max(project.totalDuration, startFrom + 300);
}

function collectTimelineScrubClips(project: Project): TimelineScrubClip[] {
  return project.tracks.flatMap((track) => {
    if (track.frozen && track.frozenAudioKey) {
      return [{
        clipId: `frozen-${track.id}`,
        trackId: track.id,
        startTime: 0,
        clipDuration: project.totalDuration,
        audioOffset: 0,
        timeStretchRate: 1,
        bufferKey: track.frozenAudioKey,
      }];
    }

    return track.clips.flatMap((clip) => {
      if (clip.generationStatus !== 'ready' || clip.muted) return [];
      const bufferKey = clip.isolatedAudioKey ?? clip.cumulativeMixKey;
      if (!bufferKey) return [];

      return [{
        clipId: clip.id,
        trackId: track.id,
        startTime: clip.startTime,
        clipDuration: clip.duration,
        audioOffset: clip.isolatedAudioKey
          ? (clip.audioOffset ?? 0)
          : clip.startTime + (clip.audioOffset ?? 0),
        timeStretchRate: clip.timeStretchRate ?? 1,
        bufferKey,
      }];
    });
  });
}

export function useTransport() {
  const { isPlaying, currentTime } = useTransportStore();
  const isRecording = useTransportStore((s) => s.isRecording);
  const project = useProjectStore((s) => s.project);
  const { stopRecording, onLoopCycle } = useRecording();
  const mainView = useUIStore((s) => s.mainView);
  const scrubClipsRef = useRef<TimelineScrubClip[]>([]);

  const play = useCallback(async (fromTime?: number) => {
    const engine = getAudioEngine();
    await engine.resume();
    await synthEngine.ensureStarted();
    await samplerEngine.ensureStarted();
    await drumEngine.ensureStarted();

    const proj = useProjectStore.getState().project;
    if (!proj) return;

    useProjectStore.getState().detectPlaybackLatency(
      engine.refreshPlaybackLatencyCompensation(),
    );

    engine.clearMidiEvents();

    // Sync master volume
    const nextProject = useProjectStore.getState().project;
    if (!nextProject) return;
    engine.masterVolume = nextProject.masterVolume ?? 1.0;
    engine.setPlaybackLatencyCompensation(getPlaybackLatencyCompensationSeconds(nextProject.playbackLatency));
    engine.applyMastering(nextProject.mastering);

    interface ScheduleEntry {
      clipId: string;
      trackId: string;
      startTime: number;
      buffer: AudioBuffer;
      audioOffset: number;
      clipDuration: number;
      fadeInDuration?: number;
      fadeOutDuration?: number;
      fadeInCurve?: import('../types/project').Clip['fadeInCurve'];
      fadeOutCurve?: import('../types/project').Clip['fadeOutCurve'];
      timeStretchRate?: number;
      gainEnvelope?: import('../types/project').GainEnvelopePoint[];
      warpMarkers?: import('../types/project').AudioWarpMarker[];
    }
    const clipBuffers: ScheduleEntry[] = [];
    const sessionTracks = mainView === 'session' ? getSessionTracks(nextProject) : [];
    const sessionTrackMap = new Map(sessionTracks.map((entry) => [entry.track.id, entry]));

    // First pass: create all TrackNodes (groups first so children can route to them)
    for (const track of proj.tracks.filter((t) => t.isGroup)) {
      engine.getOrCreateTrackNode(track.id);
    }
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
      // Route child tracks through their parent group bus
      engine.setTrackGroupRouting(track.id, track.parentTrackId ?? null);

      // Frozen track: play frozen bounce instead of individual clips/MIDI
      if (track.frozen && track.frozenAudioKey && mainView !== 'session') {
        const frozenBlob = await loadAudioBlobByKey(track.frozenAudioKey);
        if (frozenBlob) {
          const frozenBuffer = await engine.decodeAudioData(frozenBlob);
          clipBuffers.push({
            clipId: `frozen-${track.id}`,
            trackId: track.id,
            startTime: 0,
            buffer: frozenBuffer,
            audioOffset: 0,
            clipDuration: frozenBuffer.duration,
          });
        }
        continue; // skip individual clip loading
      }

      const clipsToSchedule = mainView === 'session'
        ? (sessionTrackMap.get(track.id)?.clip ? [sessionTrackMap.get(track.id)!.clip] : [])
        : track.clips.filter((clip) => clip.generationStatus === 'ready' && !clip.muted);

      for (const clip of clipsToSchedule) {
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

        if (mainView === 'session') {
          const launch = sessionTrackMap.get(track.id)?.launch;
          if (!launch) continue;
          const clipDuration = Math.max(clip.duration, 0.001);
          const playbackEnd = getSessionPlaybackEnd(proj, fromTime ?? useTransportStore.getState().currentTime);
          let loopIndex = Math.max(0, Math.floor(((fromTime ?? useTransportStore.getState().currentTime) - launch.launchedAt) / clipDuration));
          while (true) {
            const loopStart = launch.launchedAt + loopIndex * clipDuration;
            if (loopStart >= playbackEnd) break;
            clipBuffers.push({
              clipId: `${clip.id}-session-${loopIndex}`,
              trackId: track.id,
              startTime: loopStart,
              buffer,
              audioOffset: clip.audioOffset ?? 0,
              clipDuration,
              timeStretchRate: clip.timeStretchRate,
              gainEnvelope: clip.gainEnvelope,
            });
            loopIndex += 1;
          }
          continue;
        }

        clipBuffers.push({
          clipId: clip.id,
          trackId: track.id,
          startTime: clip.startTime,
          buffer,
          audioOffset: clip.audioOffset ?? 0,
          clipDuration: clip.duration,
          fadeInDuration: clip.fadeInDuration,
          fadeOutDuration: clip.fadeOutDuration,
          fadeInCurve: clip.fadeInCurve,
          fadeOutCurve: clip.fadeOutCurve,
          timeStretchRate: clip.timeStretchRate,
          gainEnvelope: clip.gainEnvelope,
          warpMarkers: clip.warpMarkers,
        });
      }
    }

    engine.updateSoloState();

    const startFrom = fromTime ?? useTransportStore.getState().currentTime;

    // Loop end = last clip's endpoint (or full timeline if no clips)
    const { loopEnabled } = useTransportStore.getState();
    let effectiveEnd = mainView === 'session' ? getSessionPlaybackEnd(proj, startFrom) : proj.totalDuration;
    if (mainView !== 'session' && loopEnabled && clipBuffers.length > 0) {
      const lastClipEnd = clipBuffers.reduce(
        (max, cb) => Math.max(max, cb.startTime + cb.clipDuration), 0,
      );
      if (lastClipEnd > 0) effectiveEnd = lastClipEnd;
    }

    engine.schedulePlayback(clipBuffers, startFrom, effectiveEnd);

    const { metronomeEnabled } = useTransportStore.getState();
    if (metronomeEnabled) {
      engine.scheduleMetronome(
        proj.bpm, proj.timeSignature, startFrom, effectiveEnd,
        proj.tempoMap, proj.timeSignatureMap,
      );
    }

    // Schedule MIDI events using AudioEngine's time base (RAF-driven),
    // so playhead and note triggering stay perfectly in sync.
    const tempoMap = proj.tempoMap;
    const fallbackBpm = proj.bpm;
    const anySoloed = proj.tracks.some((track) => track.soloed);

    for (const track of proj.tracks) {
      // Skip MIDI/sequencer scheduling for frozen tracks
      if (track.frozen && track.frozenAudioKey) continue;

      if (track.trackType === 'pianoRoll') {
        const preset = track.synthPreset ?? 'piano';
        const samplerConfig = track.samplerConfig
          ?? (preset === 'sampler' && track.sampler?.audioKey
            ? createSamplerConfig(track.sampler.audioKey, {
                rootNote: track.sampler.rootNote ?? 60,
                trimEnd: track.sampler.sampleDuration,
                loopEnd: track.sampler.sampleDuration,
              })
            : null);
        const useSampler = !!samplerConfig;

        synthEngine.removeTrackSynth(track.id);
        samplerEngine.removeTrackSampler(track.id);

        if (useSampler && samplerConfig) {
          const sampleBlob = await loadAudioBlobByKey(samplerConfig.audioKey);
          if (sampleBlob) {
            const sampleBuffer = await engine.decodeAudioData(sampleBlob);
            const trackNode = engine.getOrCreateTrackNode(track.id);
            samplerEngine.ensureTrackSampler(
              track.id, samplerConfig, sampleBuffer,
              trackNode.inputGain as unknown as Tone.InputNode,
            );
          }
        } else if (preset !== 'sampler') {
          synthEngine.ensureTrackSynth(track.id, preset);
        }

        const midiClips = mainView === 'session'
          ? (sessionTrackMap.get(track.id)?.clip ? [sessionTrackMap.get(track.id)!.clip] : [])
          : track.clips;

        for (const clip of midiClips) {
          const notes = [...(clip.midiData?.notes ?? [])].sort((a, b) => a.startBeat - b.startBeat);
          if (notes.length === 0) continue;

          const loopStarts = mainView === 'session'
            ? (() => {
                const launch = sessionTrackMap.get(track.id)?.launch;
                if (!launch) return [];
                const clipDuration = Math.max(clip.duration, 0.001);
                const starts: number[] = [];
                let loopIndex = Math.max(0, Math.floor((startFrom - launch.launchedAt) / clipDuration));
                while (true) {
                  const loopStart = launch.launchedAt + loopIndex * clipDuration;
                  if (loopStart >= effectiveEnd) break;
                  starts.push(loopStart);
                  loopIndex += 1;
                }
                return starts;
              })()
            : [clip.startTime];

          for (const loopStart of loopStarts) {
            for (let noteIndex = 0; noteIndex < notes.length; noteIndex++) {
              const note = notes[noteIndex];
              const noteStart = loopStart + beatToTime(note.startBeat, tempoMap, fallbackBpm);
              const noteDuration = Math.max(0, beatToTime(note.startBeat + note.durationBeats, tempoMap, fallbackBpm) - beatToTime(note.startBeat, tempoMap, fallbackBpm));
              const noteEnd = noteStart + noteDuration;
              if (noteEnd <= startFrom || noteStart >= effectiveEnd || noteDuration <= 0) continue;

              const scheduledStart = Math.max(noteStart, startFrom);
              const scheduledDuration = noteEnd - scheduledStart;
              const velocity = Math.max(0, Math.min(1, note.velocity));
              const trackId = track.id;

              if (useSampler) {
                engine.scheduleMidiEvent(scheduledStart, () => {
                  samplerEngine.triggerAttackRelease(trackId, note.pitch, scheduledDuration, velocity);
                });
              } else {
                const freq = Tone.Frequency(note.pitch, 'midi').toFrequency();
                const previousOverlap = note.isSlide
                  ? [...notes]
                      .slice(0, noteIndex)
                      .reverse()
                      .find((candidate) => candidate.startBeat + candidate.durationBeats >= note.startBeat)
                  : undefined;
                engine.scheduleMidiEvent(scheduledStart, () => {
                  if (previousOverlap) {
                    void synthEngine.playSlideNote(
                      trackId,
                      previousOverlap.pitch,
                      note.pitch,
                      Math.max(1, Math.round(velocity * 127)),
                      scheduledDuration,
                      preset,
                    );
                    return;
                  }
                  const synth = synthEngine.getSynth(trackId);
                  if (synth) {
                    synth.triggerAttackRelease(freq, scheduledDuration, undefined, velocity);
                  }
                });
              }
            }
          }
        }
      }

      if (track.trackType === 'sequencer' && track.sequencerPattern && mainView !== 'session') {
        if (track.muted) continue;
        if (anySoloed && !track.soloed) continue;

        // Skip MIDI scheduling if the track already has bounced audio clips —
        // otherwise the drum triggers overlap with the rendered audio.
        const hasReadyClips = track.clips.some((c) => c.generationStatus === 'ready');
        if (hasReadyClips) continue;

        const { sequencerPattern } = track;
        const stepsPerBeat = sequencerPattern.stepsPerBar / 4;
        const stepDuration = (60 / fallbackBpm) / stepsPerBeat;
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

              const drumKit = track.drumKit ?? '808';
              const trackId = track.id;
              engine.scheduleMidiEvent(stepTime, () => {
                void drumEngine.triggerPad(trackId, padIndex, velocity, drumKit);
              });
            }
          }
        }
      }
    }

    // Start automation playback
    const allLanes = project?.automationLanes ?? [];
    if (allLanes.length > 0) {
      automationEngine.start(allLanes, () => getAudioEngine().getCurrentTime());
    }

    useTransportStore.getState().play();
  }, [mainView]);

  const finalizeSessionArrangementRecording = useCallback((stopTime: number) => {
    const transport = useTransportStore.getState();
    if (!transport.sessionArrangementRecording) return;

    const finalizedEvents = transport.sessionArrangementRecordEvents
      .map((event) => ({
        ...event,
        endTime: event.endTime ?? stopTime,
      }))
      .filter((event) => (event.endTime ?? stopTime) > event.startTime);

    for (const event of finalizedEvents) {
      const sourceTrack = useProjectStore.getState().project?.tracks.find((track) => track.id === event.trackId);
      const sourceClip = sourceTrack?.clips.find((clip) => clip.id === event.clipId);
      if (!sourceClip) continue;

      const segmentEnd = event.endTime ?? stopTime;
      const baseDuration = Math.max(sourceClip.duration, 0.001);
      let cursor = event.startTime;

      while (cursor < segmentEnd - 0.0001) {
        const remaining = segmentEnd - cursor;
        const clip = useProjectStore.getState().duplicateClipToTrack(sourceClip.id, event.trackId, cursor);
        if (!clip) break;
        const duration = Math.min(baseDuration, remaining);
        if (duration !== clip.duration) {
          useProjectStore.getState().updateClip(clip.id, { duration });
        }
        cursor += duration;
      }
    }

    useTransportStore.getState().stopSessionArrangementRecording(stopTime);
    if (finalizedEvents.length > 0) {
      toastInfo(`Recorded ${finalizedEvents.length} session pass${finalizedEvents.length === 1 ? '' : 'es'} to Arrangement`);
    }
  }, []);

  const pause = useCallback(async () => {
    if (isRecording) {
      await stopRecording();
    }
    const engine = getAudioEngine();
    const time = engine.getCurrentTime();
    finalizeSessionArrangementRecording(time);
    engine.stop();
    synthEngine.releaseAll();
    samplerEngine.stopAll();
    automationEngine.stop();
    useTransportStore.getState().pause();
    useTransportStore.getState().seek(time);
  }, [finalizeSessionArrangementRecording, isRecording, stopRecording]);

  const stop = useCallback(async () => {
    if (isRecording) {
      await stopRecording();
    }
    const engine = getAudioEngine();
    const time = engine.playing ? engine.getCurrentTime() : useTransportStore.getState().currentTime;
    finalizeSessionArrangementRecording(time);
    engine.stop();
    synthEngine.releaseAll();
    samplerEngine.stopAll();
    automationEngine.stop();
    useTransportStore.getState().stop();
  }, [finalizeSessionArrangementRecording, isRecording, stopRecording]);

  const seek = useCallback((time: number) => {
    const engine = getAudioEngine();
    if (engine.playing) {
      engine.stop();
      synthEngine.releaseAll();
      samplerEngine.stopAll();
      useTransportStore.getState().seek(time);
      play(time);
    } else {
      useTransportStore.getState().seek(time);
    }
  }, [play]);

  const startScrub = useCallback(async (time: number) => {
    const engine = getAudioEngine();
    const transport = useTransportStore.getState();
    const scrubProject = useProjectStore.getState().project;
    if (!scrubProject) return;

    await engine.resume();
    const resumePlayback = transport.isPlaying || engine.playing;
    if (resumePlayback) {
      engine.stop();
      synthEngine.releaseAll();
      samplerEngine.stopAll();
      automationEngine.stop();
      useTransportStore.getState().pause();
    }

    scrubClipsRef.current = collectTimelineScrubClips(scrubProject);
    useTransportStore.getState().startScrub(time, resumePlayback);
    useTransportStore.getState().seek(time);
    await engine.startTimelineScrub(scrubProject.tracks, scrubClipsRef.current, time, 0);
  }, []);

  const scrubTo = useCallback(async (time: number, previewRate: number) => {
    const scrubProject = useProjectStore.getState().project;
    if (!scrubProject) return;

    const engine = getAudioEngine();
    useTransportStore.getState().updateScrub(time, previewRate);
    useTransportStore.getState().seek(time);
    await engine.updateTimelineScrub(scrubProject.tracks, scrubClipsRef.current, time, previewRate);
  }, []);

  const endScrub = useCallback(async () => {
    const engine = getAudioEngine();
    const transport = useTransportStore.getState();
    const shouldResumePlayback = transport.scrubResumeOnRelease;
    const resumeFrom = transport.currentTime;

    useTransportStore.getState().endScrub();
    engine.stopTimelineScrub();
    scrubClipsRef.current = [];

    if (shouldResumePlayback) {
      await play(resumeFrom);
    }
  }, [play]);

  const launchSessionClip = useCallback(async (trackId: string, clipId: string, sceneIndex: number) => {
    const transport = useTransportStore.getState();
    useTransportStore.getState().launchSessionClip(trackId, clipId, sceneIndex, transport.currentTime);
    if (transport.isPlaying && useUIStore.getState().mainView === 'session') {
      await play(transport.currentTime);
    }
  }, [play]);

  const stopSessionTrack = useCallback(async (trackId: string) => {
    const transport = useTransportStore.getState();
    useTransportStore.getState().stopSessionTrack(trackId, transport.currentTime);
    if (transport.isPlaying && useUIStore.getState().mainView === 'session') {
      await play(transport.currentTime);
    }
  }, [play]);

  const stopAllSessionClips = useCallback(async () => {
    const transport = useTransportStore.getState();
    useTransportStore.getState().stopAllSessionClips(transport.currentTime);
    if (transport.isPlaying && useUIStore.getState().mainView === 'session') {
      await play(transport.currentTime);
    }
  }, [play]);

  const launchSessionScene = useCallback(async (sceneIndex: number, clips: Array<{ trackId: string; clipId: string }>) => {
    const transport = useTransportStore.getState();
    useTransportStore.getState().launchSessionScene(sceneIndex, clips, transport.currentTime);
    if (transport.isPlaying && useUIStore.getState().mainView === 'session') {
      await play(transport.currentTime);
    }
  }, [play]);

  const toggleSessionArrangementRecording = useCallback(async () => {
    const transport = useTransportStore.getState();
    if (transport.sessionArrangementRecording) {
      finalizeSessionArrangementRecording(transport.currentTime);
      return;
    }

    useTransportStore.getState().startSessionArrangementRecording(transport.currentTime);
    if (!transport.isPlaying) {
      await play(transport.currentTime);
    }
  }, [finalizeSessionArrangementRecording, play]);

  // Register the onEnded callback — respect loopEnabled
  useEffect(() => {
    const engine = getAudioEngine();
    engine.setOnEndedCallback(() => {
      const { loopEnabled, isRecording, loopRecordingEnabled, loopStart } = useTransportStore.getState();
      if (loopEnabled) {
        if (isRecording && loopRecordingEnabled) {
          void onLoopCycle();
        }
        useTransportStore.getState().setCurrentTime(loopStart);
        play(loopStart);
      } else if (useUIStore.getState().mainView === 'session' && Object.keys(useTransportStore.getState().launchedSessionClips).length > 0) {
        const now = useTransportStore.getState().currentTime;
        play(now);
      } else {
        useTransportStore.getState().stop();
      }
    });
    return () => {
      engine.setOnEndedCallback(() => {});
    };
  }, [play, onLoopCycle]);

  // Sync mixer params to audio engine TrackNodes during playback
  useEffect(() => {
    if (!project || !isPlaying) return;
    const engine = getAudioEngine();
    engine.masterVolume = project.masterVolume ?? 1.0;
    engine.setPlaybackLatencyCompensation(getPlaybackLatencyCompensationSeconds(project.playbackLatency));
    engine.applyMastering(project.mastering);
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
        // Update group bus routing on live parameter changes
        engine.setTrackGroupRouting(track.id, track.parentTrackId ?? null);
      }
    }
    engine.updateSoloState();
  }, [project, isPlaying]);

  return {
    isPlaying,
    currentTime,
    play,
    pause,
    stop,
    seek,
    startScrub,
    scrubTo,
    endScrub,
    launchSessionClip,
    stopSessionTrack,
    stopAllSessionClips,
    launchSessionScene,
    toggleSessionArrangementRecording,
  };
}
