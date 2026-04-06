/**
 * useSessionRecording — orchestrates recording into session clip slots.
 *
 * Handles:
 * - Audio recording via RecordingEngine
 * - MIDI recording via MidiCaptureService
 * - Fixed-length auto-stop
 * - Count-in before recording
 * - Creating clips from recorded data and assigning to slots
 */
import { useCallback, useEffect, useRef } from 'react';
import { useProjectStore } from '../store/projectStore';
import { useTransportStore } from '../store/transportStore';
import { recordingEngine } from '../engine/RecordingEngine';
import { getMidiCaptureService } from '../services/midiCaptureService';
import { saveAudioBlob } from '../services/audioFileManager';
import { computeWaveformPeaks } from '../utils/waveformPeaks';
import { CLIP_WAVEFORM_PEAK_COUNT } from '../utils/clipAudio';
import { audioBufferToWavBlob } from '../utils/wav';
import { toastError, toastSuccess } from './useToast';
import type { Track } from '../types/project';

/** Determine recording type based on track type. */
function getRecordingType(track: Track): 'audio' | 'midi' {
  return track.trackType === 'pianoRoll' ? 'midi' : 'audio';
}

export function useSessionRecording() {
  const fixedLengthTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const startSlotRecording = useCallback(async (
    trackId: string,
    sceneId: string,
    slotId: string,
  ) => {
    const project = useProjectStore.getState().project;
    if (!project) return;

    const armedTrackIds = useTransportStore.getState().armedTrackIds;
    if (!armedTrackIds.includes(trackId)) {
      toastError('Arm the track before recording');
      return;
    }

    const track = project.tracks.find((t) => t.id === trackId);
    if (!track) return;

    const recordingType = getRecordingType(track);
    const transportTime = useTransportStore.getState().currentTime;
    const bpm = project.bpm;
    const timeSig = project.timeSignature;
    const timeSigDenom = project.timeSignatureDenominator ?? 4;

    // Start recording based on type
    if (recordingType === 'audio') {
      const ok = await recordingEngine.startRecording(trackId, slotId, transportTime);
      if (!ok) {
        toastError('Microphone access denied');
        return;
      }
    }
    // For MIDI, the MidiCaptureService rolling buffer is already running

    // Mark slot as recording in store
    useProjectStore.getState().startSessionSlotRecording(slotId);

    // Set up fixed-length auto-stop
    const session = useProjectStore.getState().project?.session;
    const fixedBars = session?.fixedLengthBars;
    if (fixedBars && fixedBars > 0) {
      const barDuration = (timeSig * 60 * 4) / (bpm * timeSigDenom);
      const totalMs = fixedBars * barDuration * 1000;
      const timer = setTimeout(() => {
        stopSlotRecording(slotId, trackId, sceneId, recordingType, fixedBars);
      }, totalMs);
      fixedLengthTimers.current.set(slotId, timer);
    }

    toastSuccess(`Recording ${recordingType === 'midi' ? 'MIDI' : 'audio'}...`);
  }, []);

  const stopSlotRecording = useCallback(async (
    slotId: string,
    trackId: string,
    sceneId: string,
    recordingType: 'audio' | 'midi',
    fixedBars?: number | null,
  ) => {
    const project = useProjectStore.getState().project;
    if (!project) return;

    // Clear any fixed-length timer
    const timer = fixedLengthTimers.current.get(slotId);
    if (timer) {
      clearTimeout(timer);
      fixedLengthTimers.current.delete(slotId);
    }

    // Stop recording in store
    useProjectStore.getState().stopSessionSlotRecording(slotId);

    const bpm = project.bpm;
    const timeSig = project.timeSignature;
    const timeSigDenom = project.timeSignatureDenominator ?? 4;
    const barDuration = (timeSig * 60 * 4) / (bpm * timeSigDenom);
    const measures = fixedBars ?? project.measures ?? 4;

    if (recordingType === 'audio') {
      // Stop audio recording and create clip
      const result = await recordingEngine.stopRecording(trackId);
      if (!result) {
        toastError('Recording failed — no audio captured');
        return;
      }

      // Create clip first to get an ID, then store audio with that ID
      const waveformPeaks = computeWaveformPeaks(result.audioBuffer, CLIP_WAVEFORM_PEAK_COUNT);

      const clip = useProjectStore.getState().addClip(trackId, {
        startTime: 0,
        duration: result.duration,
        prompt: 'Recorded audio',
        lyrics: '',
        source: 'uploaded',
        audioDuration: result.duration,
      });

      // Convert to WAV, store, and update clip
      const wavBlob = audioBufferToWavBlob(result.audioBuffer);
      const audioKey = await saveAudioBlob(project.id, clip.id, 'cumulative', wavBlob);
      useProjectStore.getState().updateClipStatus(clip.id, 'ready', {
        cumulativeMixKey: audioKey,
        waveformPeaks,
      });

      // Assign to session slot
      useProjectStore.getState().assignClipToSessionSlot(trackId, sceneId, clip.id);

      toastSuccess('Audio recording saved to slot');
    } else {
      // Stop MIDI recording — capture from rolling buffer
      const captureService = getMidiCaptureService();
      const captureTime = useTransportStore.getState().currentTime;
      const capturedClipId = useProjectStore.getState().captureMidi(
        trackId,
        captureTime,
        captureService,
        { bars: measures, quantize: '1/16' },
      );

      if (capturedClipId) {
        // Auto-assign the captured clip to the correct session slot
        useProjectStore.getState().assignClipToSessionSlot(trackId, sceneId, capturedClipId);
        toastSuccess('MIDI recording saved to slot');
      } else {
        toastError('No MIDI data captured');
      }
    }
  }, []);

  const stopAllSlotRecordings = useCallback(async () => {
    const session = useProjectStore.getState().project?.session;
    if (!session?.recordingSlotIds?.length) return;

    for (const slotId of [...session.recordingSlotIds]) {
      const slot = session.slots.find((s) => s.id === slotId);
      if (!slot) continue;
      const track = useProjectStore.getState().project?.tracks.find((t) => t.id === slot.trackId);
      if (!track) continue;
      const sceneId = slot.sceneId;
      const recordingType = getRecordingType(track);
      await stopSlotRecording(slotId, slot.trackId, sceneId, recordingType);
    }
  }, [stopSlotRecording]);

  const playCountIn = useCallback(async (
    onBeat: (bar: number, beat: number, remaining: number) => void,
  ) => {
    const project = useProjectStore.getState().project;
    if (!project) return;
    await recordingEngine.playCountIn(project.bpm, project.timeSignature, onBeat);
  }, []);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      for (const timer of fixedLengthTimers.current.values()) {
        clearTimeout(timer);
      }
      fixedLengthTimers.current.clear();
    };
  }, []);

  return {
    startSlotRecording,
    stopSlotRecording,
    stopAllSlotRecordings,
    playCountIn,
    getRecordingType,
  };
}
