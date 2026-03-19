import { useCallback, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { recordingEngine } from '../engine/RecordingEngine';
import { useTransportStore } from '../store/transportStore';
import { useProjectStore } from '../store/projectStore';
import { toastError, toastInfo, toastSuccess } from './useToast';
import { saveAudioBlob } from '../services/audioFileManager';
import { computeWaveformPeaks } from '../utils/waveformPeaks';
import { audioBufferToWavBlob } from '../utils/wav';

/** Map of trackId to clipId used during loop recording to accumulate takes. */
const loopRecordingClipIds = new Map<string, string>();

export function useRecording() {
  const isRecording = useTransportStore((s) => s.isRecording);
  const armedTrackIds = useTransportStore((s) => s.armedTrackIds);
  const setIsRecording = useTransportStore((s) => s.setIsRecording);
  const storeArmTrack = useTransportStore((s) => s.armTrack);
  const storeDisarmTrack = useTransportStore((s) => s.disarmTrack);
  const storeToggleArmTrack = useTransportStore((s) => s.toggleArmTrack);
  const storeDisarmAll = useTransportStore((s) => s.disarmAll);
  const setCountIn = useTransportStore((s) => s.setCountIn);
  const addClip = useProjectStore((s) => s.addClip);
  const updateClipStatus = useProjectStore((s) => s.updateClipStatus);
  const updateTrack = useProjectStore((s) => s.updateTrack);
  const addTake = useProjectStore((s) => s.addTake);
  const [hasPermission, setHasPermission] = useState(recordingEngine.hasPermission);

  const armTrack = useCallback((id: string) => {
    storeArmTrack(id);
    recordingEngine.setMonitoring(id, true);
    updateTrack(id, { armed: true });
  }, [storeArmTrack, updateTrack]);

  const disarmTrack = useCallback((id: string) => {
    storeDisarmTrack(id);
    recordingEngine.setMonitoring(id, false);
    updateTrack(id, { armed: false });
  }, [storeDisarmTrack, updateTrack]);

  const toggleArmTrack = useCallback((id: string, exclusive = true) => {
    const state = useTransportStore.getState();
    const isArmed = state.armedTrackIds.includes(id);

    if (isArmed) {
      disarmTrack(id);
      return;
    }

    if (exclusive) {
      for (const prevId of state.armedTrackIds) {
        recordingEngine.setMonitoring(prevId, false);
        updateTrack(prevId, { armed: false });
      }
      storeDisarmAll();
    }

    storeToggleArmTrack(id, false);
    recordingEngine.setMonitoring(id, true);
    updateTrack(id, { armed: true });
  }, [disarmTrack, storeToggleArmTrack, storeDisarmAll, updateTrack]);

  const onLoopCycle = useCallback(async () => {
    const project = useProjectStore.getState().project;
    if (!project) return;

    const transport = useTransportStore.getState();
    const armedIds = transport.armedTrackIds;

    const results = await recordingEngine.stopAllRecordings();

    for (const [trackId, result] of results.entries()) {
      let clipId = loopRecordingClipIds.get(trackId);

      if (!clipId) {
        const clip = addClip(trackId, {
          startTime: transport.loopStart,
          duration: transport.loopEnd - transport.loopStart,
          prompt: 'Recording',
          lyrics: '',
          source: 'uploaded',
        });
        clipId = clip.id;
        loopRecordingClipIds.set(trackId, clipId);

        const wavBlob = audioBufferToWavBlob(result.audioBuffer);
        const isolatedAudioKey = await saveAudioBlob(project.id, clipId, 'isolated', wavBlob);
        const waveformPeaks = computeWaveformPeaks(result.audioBuffer, 200);
        updateClipStatus(clipId, 'ready', {
          isolatedAudioKey,
          waveformPeaks,
          audioDuration: result.duration,
          audioOffset: 0,
          source: 'uploaded',
        });
      } else {
        const wavBlob = audioBufferToWavBlob(result.audioBuffer);
        const audioKey = await saveAudioBlob(project.id, `${clipId}-take-${Date.now()}`, 'isolated', wavBlob);
        addTake(clipId, audioKey);
      }
    }

    useTransportStore.getState().incrementLoopCycle();

    const transportTime = transport.loopStart;
    for (const trackId of armedIds) {
      await recordingEngine.startRecording(trackId, uuidv4(), transportTime);
    }
  }, [addClip, addTake, updateClipStatus]);

  const stopRecording = useCallback(async () => {
    const project = useProjectStore.getState().project;
    if (!project) {
      setIsRecording(false);
      return;
    }

    const sessionStartTimes = new Map<string, number>();
    for (const trackId of useTransportStore.getState().armedTrackIds) {
      const session = recordingEngine.getSession(trackId);
      if (session) {
        sessionStartTimes.set(trackId, session.startTime);
      }
    }

    const results = await recordingEngine.stopAllRecordings();
    const isLoopRec = loopRecordingClipIds.size > 0;
    let createdCount = 0;

    for (const [trackId, result] of results.entries()) {
      if (isLoopRec) {
        const clipId = loopRecordingClipIds.get(trackId);
        if (clipId) {
          const wavBlob = audioBufferToWavBlob(result.audioBuffer);
          const audioKey = await saveAudioBlob(project.id, `${clipId}-take-${Date.now()}`, 'isolated', wavBlob);
          addTake(clipId, audioKey);
          createdCount += 1;
        }
      } else {
        const clip = addClip(trackId, {
          startTime: sessionStartTimes.get(trackId) ?? useTransportStore.getState().currentTime,
          duration: result.duration,
          prompt: 'Recording',
          lyrics: '',
          source: 'uploaded',
        });
        const wavBlob = audioBufferToWavBlob(result.audioBuffer);
        const isolatedAudioKey = await saveAudioBlob(project.id, clip.id, 'isolated', wavBlob);
        const waveformPeaks = computeWaveformPeaks(result.audioBuffer, 200);

        updateClipStatus(clip.id, 'ready', {
          isolatedAudioKey,
          waveformPeaks,
          audioDuration: result.duration,
          audioOffset: 0,
          source: 'uploaded',
        });
        createdCount += 1;
      }
    }

    loopRecordingClipIds.clear();
    useTransportStore.getState().setLoopCycleCount(0);

    setIsRecording(false);

    if (createdCount > 0) {
      toastSuccess(isLoopRec ? 'Loop recording saved' : 'Recording saved');
    }
  }, [addClip, addTake, setIsRecording, updateClipStatus]);

  const toggleRecord = useCallback(async () => {
    if (useTransportStore.getState().isRecording) {
      await stopRecording();
      return;
    }

    const currentArmedTrackIds = useTransportStore.getState().armedTrackIds;
    if (currentArmedTrackIds.length === 0) {
      toastError('Arm a track first');
      return;
    }

    const granted = await recordingEngine.requestPermission();
    setHasPermission(granted);
    if (!granted) {
      toastError('Microphone access denied');
      return;
    }

    const project = useProjectStore.getState().project;
    const bpm = project?.bpm ?? 120;
    const beatsPerBar = (typeof project?.timeSignature === 'number' ? project.timeSignature : 4);

    if (recordingEngine.getCountInLength() !== 'off') {
      setCountIn(true, -(beatsPerBar * (recordingEngine.getCountInLength() === '1bar' ? 1 : 2)));
      await recordingEngine.playCountIn(bpm, beatsPerBar, (_bar, _beat, remaining) => {
        setCountIn(true, -remaining);
      });
      setCountIn(false, 0);
    }

    setIsRecording(true);
    const transportTime = useTransportStore.getState().currentTime;
    let startedCount = 0;

    for (const trackId of currentArmedTrackIds) {
      const started = await recordingEngine.startRecording(trackId, uuidv4(), transportTime);
      if (started) {
        startedCount += 1;
      }
    }

    if (startedCount === 0) {
      setIsRecording(false);
      toastError('Unable to start recording');
      return;
    }

    toastInfo('Recording started');
  }, [setIsRecording, setCountIn, stopRecording]);

  return {
    isRecording,
    armedTrackIds,
    toggleRecord,
    stopRecording,
    onLoopCycle,
    armTrack,
    disarmTrack,
    toggleArmTrack,
    hasPermission,
  };
}
