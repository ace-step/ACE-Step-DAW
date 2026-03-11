import { useCallback, useEffect } from 'react';
import { useTransportStore } from '../store/transportStore';
import { useProjectStore } from '../store/projectStore';
import { getAudioEngine } from './useAudioEngine';
import { loadAudioBlobByKey } from '../services/audioFileManager';
import { isolateTrackAudio } from '../engine/waveSubtraction';

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
  const startSample = Math.floor(clipStartTime * sr);
  const endSample = Math.min(
    Math.floor((clipStartTime + clipDuration) * sr),
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

  const play = useCallback(async (fromTime?: number) => {
    const engine = getAudioEngine();
    await engine.resume();

    const proj = useProjectStore.getState().project;
    if (!proj) return;

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

    // -----------------------------------------------------------------------
    // On-the-fly isolation in DESC generation order
    //
    // Sort tracks by order DESC (mirrors the batch-generation order: the
    // highest-order track was generated FIRST from silence; each subsequent
    // lower-order track was generated with the previous cumulative as context).
    //
    // Chain:
    //   Track N (order=2, generated 1st): isolated = cumulative_N - null        = track N audio
    //   Track N-1 (order=1, generated 2nd): isolated = cumulative_N-1 - cumulative_N = track N-1 audio
    //
    // Example: guitar(order=2) + drums(order=1), generated in context mode:
    //   guitar cumulative = guitar only     → isolated = guitar - null = guitar  ✓
    //   drums  cumulative = guitar + drums  → isolated = (guitar+drums) - guitar = drums  ✓
    // -----------------------------------------------------------------------
    const tracksDesc = [...proj.tracks].sort((a, b) => b.order - a.order);
    let previousCumBuffer: AudioBuffer | null = null;

    for (const track of tracksDesc) {
      // Sync channel-strip params to the TrackNode
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
        if (clip.generationStatus !== 'ready' || !clip.cumulativeMixKey) continue;

        const cumBlob = await loadAudioBlobByKey(clip.cumulativeMixKey);
        if (!cumBlob) continue;

        const cumBuffer = await engine.decodeAudioData(cumBlob);

        // Compute isolated audio on the fly.
        //
        // If the clip was generated FROM CONTEXT, its cumulativeMixKey is a
        // cumulative mix (this track + all previously generated tracks), so we
        // must subtract the previous cumulative to isolate just this track.
        //
        // If the clip was generated FROM SILENCE, its cumulativeMixKey contains
        // ONLY this track's own audio.  Subtracting the previous buffer would
        // corrupt it (adds inverted audio from another track), so use it directly.
        const fullIsolated = (clip.generatedFromContext && previousCumBuffer !== null)
          ? isolateTrackAudio(engine.ctx, cumBuffer, previousCumBuffer)
          : cumBuffer;

        // Trim the full-project-length isolated buffer to just the clip region.
        const clipStart = clip.startTime;
        const clipDur = clip.duration;
        const trimmed = trimBuffer(engine.ctx, fullIsolated, clipStart, clipDur);

        clipBuffers.push({
          clipId: clip.id,
          trackId: track.id,
          startTime: clipStart,
          buffer: trimmed,
          audioOffset: 0,
          clipDuration: clipDur,
        });

        // This track's cumulative becomes the "previous" for the next (lower-order) track
        previousCumBuffer = cumBuffer;
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

    useTransportStore.getState().play();
  }, []);

  const pause = useCallback(() => {
    const engine = getAudioEngine();
    const time = engine.getCurrentTime();
    engine.stop();
    useTransportStore.getState().pause();
    useTransportStore.getState().seek(time);
  }, []);

  const stop = useCallback(() => {
    const engine = getAudioEngine();
    engine.stop();
    useTransportStore.getState().stop();
  }, []);

  const seek = useCallback((time: number) => {
    const engine = getAudioEngine();
    if (engine.playing) {
      engine.stop();
      useTransportStore.getState().seek(time);
      play(time);
    } else {
      useTransportStore.getState().seek(time);
    }
  }, [play]);

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
