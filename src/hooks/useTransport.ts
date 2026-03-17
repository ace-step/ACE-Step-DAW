import { useCallback, useEffect } from 'react';
import { useTransportStore } from '../store/transportStore';
import { useProjectStore } from '../store/projectStore';
import { getAudioEngine } from './useAudioEngine';
import { loadAudioBlobByKey } from '../services/audioFileManager';
import { getSample } from '../services/sampleManager';

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

    // Schedule sequencer patterns
    for (const track of proj.tracks) {
      if ((track.trackType ?? 'stems') !== 'sequencer') continue;
      if (!track.sequencerPattern || track.sequencerPattern.rows.length === 0) continue;

      const sampleBuffers = new Map<string, AudioBuffer>();
      for (const row of track.sequencerPattern.rows) {
        if (row.muted) continue;
        const buf = await getSample(engine.ctx, row.sampleKey);
        if (buf) sampleBuffers.set(row.sampleKey, buf);
      }

      if (sampleBuffers.size > 0) {
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
      }

      // Defer actual scheduling after we know startFrom and effectiveEnd (below)
      (engine as any).__pendingSequencers = (engine as any).__pendingSequencers || [];
      (engine as any).__pendingSequencers.push({
        trackId: track.id,
        pattern: track.sequencerPattern,
        sampleBuffers,
        bpm: proj.bpm,
      });
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

    // Schedule any pending sequencer patterns
    const pendingSeqs = (engine as any).__pendingSequencers as any[] | undefined;
    if (pendingSeqs) {
      for (const seqInfo of pendingSeqs) {
        engine.scheduleSequencer(seqInfo, startFrom, effectiveEnd);
      }
      delete (engine as any).__pendingSequencers;
    }

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
