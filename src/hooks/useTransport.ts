import { useCallback, useEffect, useRef } from 'react';
import { useTransportStore } from '../store/transportStore';
import { useProjectStore } from '../store/projectStore';
import { useUIStore } from '../store/uiStore';
import { getAudioEngine } from './useAudioEngine';
import { loadAudioBlobByKey } from '../services/audioFileManager';
import { synthEngine } from '../engine/SynthEngine';
import { subtractiveEngine } from '../engine/SubtractiveEngine';
import { createSamplerConfig, samplerEngine } from '../engine/SamplerEngine';
import { drumEngine } from '../engine/DrumEngine';
import { wavetableEngine } from '../engine/WavetableEngine';
import { granularEngine } from '../engine/GranularEngine';
import { modulationEngine } from '../engine/ModulationEngine';
import { automationEngine } from '../engine/AutomationEngine';
import {
  stopAllStrudelTracks,
  startStrudelTrack,
  stopStrudelTrack,
  setAllStrudelBpm,
  hasStrudelRepl,
} from '../engine/strudelEngine';
import { stopStrudelEditorPlayback } from '../engine/strudelEditorPlayback';
import { useRecording } from './useRecording';
import { beatToTime } from '../utils/tempoMap';
import { midiToFrequency } from '../utils/pitch';
import { getPlaybackLatencyCompensationSeconds } from '../utils/playbackLatency';
import type { Clip, Project, Track } from '../types/project';
import {
  getClipAudibleStartTime,
  getClipAudibleTimelineDuration,
} from '../utils/clipAudio';
import { toastInfo } from './useToast';
import type { TimelineScrubClip } from '../engine/AudioEngine';
import { useVST3Store } from '../store/vst3Store';
import { pluginEngine } from '../engine/PluginEngine';

/**
 * Coerce a TrackNode.inputGain (currently a Tone.Gain wrapped under
 * the hood) to a native AudioNode for downstream engine APIs. The
 * double cast exists because the engines in SynthEngine /
 * SubtractiveEngine / SamplerEngine / WavetableEngine / GranularEngine
 * still take `Tone.InputNode` or `AudioNode` parameters depending on
 * the engine — they only use the value as a `.connect` destination,
 * which both types support. Centralized in one helper per Copilot
 * review on PR #1723 so subsequent engine migrations have a single
 * place to remove.
 */
function trackInputAsAudioNode(inputGain: unknown): AudioNode {
  return inputGain as AudioNode;
}

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

function getSessionTracks(project: Project): Array<{ track: Track; clip: Clip; launch: { sceneIndex: number; launchedAt: number; startOffset?: number } }> {
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
      const audibleStartTime = getClipAudibleStartTime(clip);
      const audibleDuration = getClipAudibleTimelineDuration(clip);
      if (audibleDuration <= 0) return [];

      return [{
        clipId: clip.id,
        trackId: track.id,
        startTime: audibleStartTime,
        clipDuration: audibleDuration,
        audioOffset: clip.isolatedAudioKey
          ? (clip.audioOffset ?? 0)
          : audibleStartTime,
        timeStretchRate: clip.timeStretchRate ?? 1,
        bufferKey,
      }];
    });
  });
}

export function useTransport() {
  const { isPlaying, currentTime } = useTransportStore();
  const isRecording = useTransportStore((s) => s.isRecording);
  const playbackTracks = useProjectStore((s) => s.project?.tracks);
  const playbackReturnTracks = useProjectStore((s) => s.project?.returnTracks);
  const masterVolume = useProjectStore((s) => s.project?.masterVolume ?? 1.0);
  const playbackLatency = useProjectStore((s) => s.project?.playbackLatency);
  const mastering = useProjectStore((s) => s.project?.mastering);
  const { stopRecording, onLoopCycle } = useRecording();
  const mainView = useUIStore((s) => s.mainView);
  const scrubClipsRef = useRef<TimelineScrubClip[]>([]);

  const play = useCallback(async (fromTime?: number) => {
    const engine = getAudioEngine();
    stopStrudelEditorPlayback();
    stopAllStrudelTracks();
    await engine.resume();
    await synthEngine.ensureStarted();
    await subtractiveEngine.ensureStarted();
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
      fadeInCurvePoint?: import('../types/project').Clip['fadeInCurvePoint'];
      fadeOutCurvePoint?: import('../types/project').Clip['fadeOutCurvePoint'];
      timeStretchRate?: number;
      pitchShift?: number;
      stretchMode?: import('../types/project').StretchMode;
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
        const audibleStartTime = getClipAudibleStartTime(clip);
        const audibleDuration = getClipAudibleTimelineDuration(clip);
        if (audibleDuration <= 0) continue;

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
          : trimBuffer(engine.ctx, rawBuffer, audibleStartTime, audibleDuration);
        const scheduleAudioOffset = alreadyTrimmed ? (clip.audioOffset ?? 0) : 0;

        if (mainView === 'session') {
          const launch = sessionTrackMap.get(track.id)?.launch;
          if (!launch) continue;
          const clipDuration = Math.max(clip.duration, 0.001);
          const legatoOffset = launch.startOffset ?? 0;
          const playbackEnd = getSessionPlaybackEnd(proj, fromTime ?? useTransportStore.getState().currentTime);
          let loopIndex = Math.max(0, Math.floor(((fromTime ?? useTransportStore.getState().currentTime) - launch.launchedAt) / clipDuration));
          while (true) {
            const loopStart = launch.launchedAt + loopIndex * clipDuration;
            if (loopStart >= playbackEnd) break;
            // For the very first iteration (loopIndex 0) with legato,
            // offset the audio start and shorten the duration.
            const isFirstLegatoLoop = loopIndex === 0 && legatoOffset > 0;
            const loopAudioOffset = isFirstLegatoLoop
              ? scheduleAudioOffset + legatoOffset
              : scheduleAudioOffset;
            const loopClipDuration = isFirstLegatoLoop
              ? Math.max(0.001, audibleDuration - legatoOffset)
              : audibleDuration;
            clipBuffers.push({
              clipId: `${clip.id}-session-${loopIndex}`,
              trackId: track.id,
              startTime: loopStart + (audibleStartTime - clip.startTime),
              buffer,
              audioOffset: loopAudioOffset,
              clipDuration: loopClipDuration,
              fadeInDuration: clip.fadeInDuration,
              fadeOutDuration: clip.fadeOutDuration,
              fadeInCurve: clip.fadeInCurve,
              fadeOutCurve: clip.fadeOutCurve,
              fadeInCurvePoint: clip.fadeInCurvePoint,
              fadeOutCurvePoint: clip.fadeOutCurvePoint,
              timeStretchRate: clip.timeStretchRate,
              pitchShift: clip.pitchShift,
              stretchMode: clip.stretchMode,
              gainEnvelope: clip.gainEnvelope,
            });
            loopIndex += 1;
          }
          continue;
        }

        clipBuffers.push({
          clipId: clip.id,
          trackId: track.id,
          startTime: audibleStartTime,
          buffer,
          audioOffset: scheduleAudioOffset,
          clipDuration: audibleDuration,
          fadeInDuration: clip.fadeInDuration,
          fadeOutDuration: clip.fadeOutDuration,
          fadeInCurve: clip.fadeInCurve,
          fadeOutCurve: clip.fadeOutCurve,
          fadeInCurvePoint: clip.fadeInCurvePoint,
          fadeOutCurvePoint: clip.fadeOutCurvePoint,
          timeStretchRate: clip.timeStretchRate,
          pitchShift: clip.pitchShift,
          stretchMode: clip.stretchMode,
          gainEnvelope: clip.gainEnvelope,
          warpMarkers: clip.warpMarkers,
        });
      }
    }

    engine.updateSoloState();

    // Wire aux sends to return tracks
    engine.syncSends(proj.tracks, proj.returnTracks ?? []);

    let startFrom = fromTime ?? useTransportStore.getState().playStartTime;

    // When loop is enabled, use loop boundaries for playback range
    const { loopEnabled, loopStart, loopEnd } = useTransportStore.getState();
    let effectiveEnd = mainView === 'session' ? getSessionPlaybackEnd(proj, startFrom) : proj.totalDuration;
    if (mainView !== 'session' && loopEnabled && loopEnd > loopStart) {
      effectiveEnd = loopEnd;
      // If playhead is outside the loop region, start from loopStart
      if (startFrom < loopStart || startFrom >= loopEnd) {
        startFrom = loopStart;
        useTransportStore.getState().seek(loopStart);
      }
    } else if (mainView !== 'session' && loopEnabled && clipBuffers.length > 0) {
      const lastClipEnd = clipBuffers.reduce(
        (max, cb) => Math.max(max, cb.startTime + cb.clipDuration), 0,
      );
      if (lastClipEnd > 0) effectiveEnd = lastClipEnd;
    }

    // Playback reads from stretchedBufferCache (populated on clip stretch mouseup).
    // If Signalsmith/Rubber Band already finished → high quality buffer used.
    // If neither finished yet → legacy fallback via _getProcessedBuffer.
    engine.schedulePlayback(clipBuffers, startFrom, effectiveEnd);

    const { metronomeEnabled } = useTransportStore.getState();
    if (metronomeEnabled) {
      engine.scheduleMetronome(
        proj.bpm, proj.timeSignature, proj.timeSignatureDenominator ?? 4, startFrom, effectiveEnd,
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
        // Check for VST3 instrument on this track
        const vst3Instances = Object.values(useVST3Store.getState().instances);
        const vst3Instrument = vst3Instances.find(
          (inst) => inst.trackId === track.id && inst.enabled && inst.online,
        );

        const preset = track.synthPreset ?? 'piano';
        const samplerConfig = track.samplerConfig
          ?? (preset === 'sampler' && track.sampler?.audioKey
            ? createSamplerConfig(track.sampler.audioKey, {
                rootNote: track.sampler.rootNote ?? 60,
                trimEnd: track.sampler.sampleDuration,
                loopEnd: track.sampler.sampleDuration,
              })
            : null);
        const useSampler = !vst3Instrument && !!samplerConfig;

        synthEngine.removeTrackSynth(track.id);
        synthEngine.removeFmSynth(track.id);
        subtractiveEngine.removeTrackSynth(track.id);
        wavetableEngine.removeTrackSynth(track.id);
        modulationEngine.removeTrack(track.id);
        samplerEngine.removeTrackSampler(track.id);
        granularEngine.removeTrack(track.id);

        if (useSampler && samplerConfig) {
          const sampleBlob = await loadAudioBlobByKey(samplerConfig.audioKey);
          if (sampleBlob) {
            const sampleBuffer = await engine.decodeAudioData(sampleBlob);
            const trackNode = engine.getOrCreateTrackNode(track.id);
            samplerEngine.ensureTrackSampler(
              track.id, samplerConfig, sampleBuffer,
              trackInputAsAudioNode(trackNode.inputGain),
            );
          }
        } else if (!vst3Instrument && track.instrument?.kind === 'subtractive') {
          const trackNode = engine.getOrCreateTrackNode(track.id);
          subtractiveEngine.ensureTrackSynth(
            track.id,
            track.instrument.settings,
            trackInputAsAudioNode(trackNode.inputGain),
          );
          // Apply modulation matrix if configured
          if (track.instrument.settings.modulation?.slots.length) {
            const modTargets = subtractiveEngine.getModulationTargets(track.id);
            if (modTargets) {
              modulationEngine.applyModulation(track.id, track.instrument.settings.modulation, modTargets);
            }
          }
        } else if (!vst3Instrument && track.instrument?.kind === 'fm') {
          const trackNode = engine.getOrCreateTrackNode(track.id);
          synthEngine.ensureFmSynth(
            track.id, track.instrument.settings,
            trackInputAsAudioNode(trackNode.inputGain),
          );
        } else if (!vst3Instrument && track.instrument?.kind === 'wavetable') {
          const trackNode = engine.getOrCreateTrackNode(track.id);
          wavetableEngine.ensureTrackSynth(
            track.id, track.instrument.settings,
            trackInputAsAudioNode(trackNode.inputGain),
          );
        } else if (!vst3Instrument && track.instrument?.kind === 'granular' && track.granularConfig) {
          const sampleBlob = await loadAudioBlobByKey(track.granularConfig.audioKey);
          if (sampleBlob) {
            const sampleBuffer = await engine.decodeAudioData(sampleBlob);
            const trackNode = engine.getOrCreateTrackNode(track.id);
            granularEngine.ensureTrackGranular(
              track.id, track.granularConfig, sampleBuffer,
              trackInputAsAudioNode(trackNode.inputGain),
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

          // For session MIDI, track which loop index is first for legato offset
          let sessionMidiLegatoOffset = 0;
          let sessionMidiFirstLoopIndex = 0;
          const loopStarts = mainView === 'session'
            ? (() => {
                const launch = sessionTrackMap.get(track.id)?.launch;
                if (!launch) return [];
                sessionMidiLegatoOffset = launch.startOffset ?? 0;
                const clipDuration = Math.max(clip.duration, 0.001);
                const starts: number[] = [];
                let loopIndex = Math.max(0, Math.floor((startFrom - launch.launchedAt) / clipDuration));
                sessionMidiFirstLoopIndex = loopIndex;
                while (true) {
                  const loopStart = launch.launchedAt + loopIndex * clipDuration;
                  if (loopStart >= effectiveEnd) break;
                  starts.push(loopStart);
                  loopIndex += 1;
                }
                return starts;
              })()
            : [clip.startTime];

          for (let loopListIdx = 0; loopListIdx < loopStarts.length; loopListIdx++) {
            const loopStart = loopStarts[loopListIdx];
            // For the first legato loop in session mode, skip notes before the offset
            const isFirstLegatoLoop = mainView === 'session'
              && sessionMidiLegatoOffset > 0
              && loopListIdx === 0
              && sessionMidiFirstLoopIndex === 0;
            for (let noteIndex = 0; noteIndex < notes.length; noteIndex++) {
              const note = notes[noteIndex];
              const noteTimeInClip = beatToTime(note.startBeat, tempoMap, fallbackBpm);
              // Skip notes before legato offset on the first loop
              if (isFirstLegatoLoop && noteTimeInClip < sessionMidiLegatoOffset) continue;
              const noteStart = loopStart + noteTimeInClip;
              const noteDuration = Math.max(0, beatToTime(note.startBeat + note.durationBeats, tempoMap, fallbackBpm) - beatToTime(note.startBeat, tempoMap, fallbackBpm));
              const noteEnd = noteStart + noteDuration;
              if (noteEnd <= startFrom || noteStart >= effectiveEnd || noteDuration <= 0) continue;

              const scheduledStart = Math.max(noteStart, startFrom);
              const scheduledDuration = noteEnd - scheduledStart;
              const velocity = Math.max(0, Math.min(1, note.velocity));
              const trackId = track.id;

              if (vst3Instrument) {
                // Route to VST3 instrument via plugin engine (which calls the adapter's noteOn/noteOff)
                const midiVelocity = Math.max(1, Math.round(velocity * 127));
                const trackId = track.id;
                engine.scheduleMidiEvent(scheduledStart, () => {
                  pluginEngine.noteOn(trackId, note.pitch, midiVelocity);
                });
                // Schedule note-off
                engine.scheduleMidiEvent(scheduledStart + scheduledDuration, () => {
                  pluginEngine.noteOff(trackId, note.pitch);
                });
              } else if (useSampler) {
                engine.scheduleMidiEvent(scheduledStart, () => {
                  samplerEngine.triggerAttackRelease(trackId, note.pitch, scheduledDuration, velocity);
                });
              } else if (track.instrument?.kind === 'subtractive') {
                const previousOverlap = note.isSlide
                  ? [...notes]
                      .slice(0, noteIndex)
                      .reverse()
                      .find((candidate) => candidate.startBeat + candidate.durationBeats >= note.startBeat)
                  : undefined;
                engine.scheduleMidiEvent(scheduledStart, () => {
                  if (previousOverlap) {
                    subtractiveEngine.playSlideNote(
                      trackId,
                      previousOverlap.pitch,
                      note.pitch,
                      Math.max(1, Math.round(velocity * 127)),
                      scheduledDuration,
                    );
                    return;
                  }
                  subtractiveEngine.triggerAttackRelease(trackId, note.pitch, scheduledDuration, velocity);
                });
              } else if (track.instrument?.kind === 'fm') {
                const freq = midiToFrequency(note.pitch);
                engine.scheduleMidiEvent(scheduledStart, () => {
                  const fmSynth = synthEngine.getFmSynth(trackId);
                  if (fmSynth) {
                    fmSynth.triggerAttackRelease(freq, scheduledDuration, undefined, velocity);
                  }
                });
              } else if (track.instrument?.kind === 'wavetable') {
                const freq = midiToFrequency(note.pitch);
                engine.scheduleMidiEvent(scheduledStart, () => {
                  const wtSynth = wavetableEngine.getSynth(trackId);
                  if (wtSynth) {
                    wtSynth.triggerAttackRelease(freq, scheduledDuration, undefined, velocity);
                  }
                });
              } else if (track.instrument?.kind === 'granular') {
                engine.scheduleMidiEvent(scheduledStart, () => {
                  granularEngine.triggerAttackRelease(trackId, note.pitch, scheduledDuration, velocity);
                });
              } else {
                const freq = midiToFrequency(note.pitch);
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
        // Only skip for clips with actual audio data (not midiData-only visualization clips).
        const hasBouncedAudio = track.clips.some(
          (c) => c.generationStatus === 'ready' && (c.cumulativeMixKey || c.isolatedAudioKey),
        );
        if (hasBouncedAudio) continue;

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

    // Sync strudel tracks: set BPM and start any tracks that have been evaluated
    setAllStrudelBpm(fallbackBpm);
    for (const track of proj.tracks) {
      if (track.trackType === 'strudel' && hasStrudelRepl(track.id)) {
        if (track.muted || (anySoloed && !track.soloed)) {
          stopStrudelTrack(track.id);
        } else {
          void startStrudelTrack(track.id);
        }
      }
    }

    // Start automation playback
    const allLanes = useProjectStore.getState().project?.automationLanes ?? [];
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
    stopStrudelEditorPlayback();
    stopAllStrudelTracks();
    engine.stop();
    synthEngine.releaseAll();
    subtractiveEngine.releaseAll();
    wavetableEngine.releaseAll();
    samplerEngine.stopAll();
    granularEngine.releaseAll();
    modulationEngine.releaseAll();
    automationEngine.stop();
    useTransportStore.getState().pause();
    // Only update currentTime, not playStartTime — the anchor stays put
    useTransportStore.getState().setCurrentTime(time);
  }, [finalizeSessionArrangementRecording, isRecording, stopRecording]);

  const stop = useCallback(async () => {
    if (isRecording) {
      await stopRecording();
    }
    const engine = getAudioEngine();
    const time = engine.playing ? engine.getCurrentTime() : useTransportStore.getState().currentTime;
    finalizeSessionArrangementRecording(time);
    stopStrudelEditorPlayback();
    engine.stop();
    synthEngine.releaseAll();
    subtractiveEngine.releaseAll();
    wavetableEngine.releaseAll();
    samplerEngine.stopAll();
    granularEngine.releaseAll();
    modulationEngine.releaseAll();
    automationEngine.stop();
    stopAllStrudelTracks();
    useTransportStore.getState().stop();
  }, [finalizeSessionArrangementRecording, isRecording, stopRecording]);

  const seek = useCallback((time: number) => {
    const engine = getAudioEngine();
    stopStrudelEditorPlayback();
    stopAllStrudelTracks();
    if (engine.playing) {
      engine.stop();
      synthEngine.releaseAll();
      subtractiveEngine.releaseAll();
      wavetableEngine.releaseAll();
      samplerEngine.stopAll();
      granularEngine.releaseAll();
      modulationEngine.releaseAll();
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
    stopStrudelEditorPlayback();
    stopAllStrudelTracks();
    const resumePlayback = transport.isPlaying || engine.playing;
    if (resumePlayback) {
      engine.stop();
      synthEngine.releaseAll();
      subtractiveEngine.releaseAll();
      wavetableEngine.releaseAll();
      samplerEngine.stopAll();
      granularEngine.releaseAll();
      modulationEngine.releaseAll();
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
    const currentTime = transport.currentTime;

    // Calculate legato offset: if the slot has legato enabled and a clip is already
    // playing on this track, start the incoming clip at the outgoing clip's position.
    let startOffset: number | undefined;
    const session = useProjectStore.getState().project?.session;
    const sceneId = session?.scenes.find((sc) => sc.index === sceneIndex)?.id;
    const slot = sceneId
      ? session?.slots.find(
          (s) => s.trackId === trackId && s.sceneId === sceneId,
        )
      : undefined;
    if (slot?.legato) {
      const outgoing = transport.launchedSessionClips[trackId];
      const projectTracks = useProjectStore.getState().project?.tracks;
      const outgoingClip = outgoing
        ? projectTracks
            ?.find((t) => t.id === trackId)
            ?.clips.find((c) => c.id === outgoing.clipId)
        : undefined;
      const incomingClip = projectTracks
        ?.find((t) => t.id === trackId)
        ?.clips.find((c) => c.id === clipId);
      if (outgoingClip) {
        const outgoingDuration = Math.max(outgoingClip.duration, 0.001);
        const elapsed = currentTime - outgoing!.launchedAt;
        const rawOffset = elapsed % outgoingDuration;
        // Clamp offset to the incoming clip's duration so it's always valid
        const incomingDuration = Math.max(incomingClip?.duration ?? outgoingDuration, 0.001);
        startOffset = rawOffset % incomingDuration;
      }
    }

    transport.launchSessionClip(trackId, clipId, sceneIndex, currentTime, startOffset);
    if (transport.isPlaying && useUIStore.getState().mainView === 'session') {
      await play(currentTime);
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
      const {
        loopEnabled,
        isRecording,
        loopRecordingEnabled,
        loopStart,
        loopEnd,
        playStartTime,
      } = useTransportStore.getState();
      if (loopEnabled) {
        const restartTime = loopEnd > loopStart ? loopStart : playStartTime;
        if (isRecording && loopRecordingEnabled) {
          void onLoopCycle();
        }
        useTransportStore.getState().setCurrentTime(restartTime);
        play(restartTime);
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
    if (!playbackTracks || !isPlaying) return;
    const engine = getAudioEngine();
    engine.masterVolume = masterVolume;
    engine.setPlaybackLatencyCompensation(getPlaybackLatencyCompensationSeconds(playbackLatency));
    engine.applyMastering(mastering);
    for (const track of playbackTracks) {
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

    // Sync aux send routing (handles amount, pre/post, and return track params)
    if (playbackTracks) {
      engine.syncSends(playbackTracks, playbackReturnTracks ?? []);
    }
  }, [isPlaying, masterVolume, mastering, playbackLatency, playbackTracks, playbackReturnTracks]);

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
