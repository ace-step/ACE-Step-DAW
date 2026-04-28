import { useCallback, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { recordingEngine } from '../engine/RecordingEngine';
import { useTransportStore } from '../store/transportStore';
import { useProjectStore } from '../store/projectStore';
import { toastError, toastInfo, toastSuccess } from './useToast';
import { saveAudioBlob } from '../services/audioFileManager';
import { computeWaveformWithMipmap } from '../utils/waveformPeaks';
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

    // Determine recording region: punch range overrides loop range when punch is enabled
    const usePunch = transport.punchEnabled && transport.punchInTime !== null && transport.punchOutTime !== null;
    const regionStart = usePunch ? transport.punchInTime! : transport.loopStart;
    const regionEnd = usePunch ? transport.punchOutTime! : transport.loopEnd;
    const regionDuration = regionEnd - regionStart;

    const results = await recordingEngine.stopAllRecordings();

    for (const [trackId, result] of results.entries()) {
      let clipId = loopRecordingClipIds.get(trackId);

      if (!clipId) {
        const clip = addClip(trackId, {
          startTime: regionStart,
          duration: regionDuration,
          prompt: 'Recording',
          lyrics: '',
          source: 'uploaded',
        });
        clipId = clip.id;
        loopRecordingClipIds.set(trackId, clipId);

        const wavBlob = audioBufferToWavBlob(result.audioBuffer);
        const isolatedAudioKey = await saveAudioBlob(project.id, clipId, 'isolated', wavBlob);
        const waveformPeaks = await computeWaveformWithMipmap(isolatedAudioKey, result.audioBuffer);
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
        const waveformPeaks = await computeWaveformWithMipmap(audioKey, result.audioBuffer);
        addTake(clipId, audioKey, waveformPeaks);
      }
    }

    useTransportStore.getState().incrementLoopCycle();

    const transportTime = regionStart;
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

    const transport = useTransportStore.getState();
    const usePunch = transport.punchEnabled && transport.punchInTime !== null && transport.punchOutTime !== null;

    const sessionStartTimes = new Map<string, number>();
    for (const trackId of transport.armedTrackIds) {
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
          const waveformPeaks = await computeWaveformWithMipmap(audioKey, result.audioBuffer);
          addTake(clipId, audioKey, waveformPeaks);
          createdCount += 1;
        }
      } else {
        // For punch-in (non-loop), place clip at punch-in time with punch duration
        const clipStart = usePunch
          ? transport.punchInTime!
          : (sessionStartTimes.get(trackId) ?? transport.currentTime);
        const clipDuration = usePunch
          ? (transport.punchOutTime! - transport.punchInTime!)
          : result.duration;

        const clip = addClip(trackId, {
          startTime: clipStart,
          duration: clipDuration,
          prompt: 'Recording',
          lyrics: '',
          source: 'uploaded',
        });
        const wavBlob = audioBufferToWavBlob(result.audioBuffer);
        const isolatedAudioKey = await saveAudioBlob(project.id, clip.id, 'isolated', wavBlob);
        const waveformPeaks = await computeWaveformWithMipmap(isolatedAudioKey, result.audioBuffer);

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

    // Auto-show take lanes on armed tracks after loop recording
    if (isLoopRec) {
      const armedIds = transport.armedTrackIds;
      for (const trackId of armedIds) {
        const track = useProjectStore.getState().project?.tracks.find((t) => t.id === trackId);
        if (track && !track.showTakeLanes) {
          useProjectStore.getState().toggleTakeLanes(trackId);
        }
      }
    }

    loopRecordingClipIds.clear();
    useTransportStore.getState().setLoopCycleCount(0);

    setIsRecording(false);

    if (createdCount > 0) {
      const mode = isLoopRec ? 'Loop recording' : (usePunch ? 'Punch recording' : 'Recording');
      toastSuccess(`${mode} saved`);
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

    // Sync count-in bars from transport store to recording engine.
    // The engine only supports 0, 1, or 2 bars, so normalize any persisted
    // out-of-range value before mapping it to the engine enum.
    const storeCountInBars = useTransportStore.getState().countInBars;
    const normalizedCountInBars = Math.max(0, Math.min(storeCountInBars, 2));
    recordingEngine.setCountInLength(
      normalizedCountInBars === 0 ? 'off' : normalizedCountInBars === 1 ? '1bar' : '2bars'
    );

    if (recordingEngine.getCountInLength() !== 'off') {
      setCountIn(true, -(beatsPerBar * (recordingEngine.getCountInLength() === '1bar' ? 1 : 2)));
      await recordingEngine.playCountIn(bpm, beatsPerBar, (_bar, _beat, remaining) => {
        setCountIn(true, -remaining);
      });
      setCountIn(false, 0);
    }

    setIsRecording(true);

    // Determine start time: if punch-in is enabled, use punch-in time
    const transport = useTransportStore.getState();
    const usePunch = transport.punchEnabled && transport.punchInTime !== null;
    const transportTime = usePunch ? transport.punchInTime! : transport.currentTime;
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

    toastInfo(usePunch ? 'Punch-in recording started' : 'Recording started');
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
