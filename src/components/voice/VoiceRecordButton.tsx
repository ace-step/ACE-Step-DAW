import { useCallback, useEffect, useRef, useState } from 'react';
import { recordingEngine } from '../../engine/RecordingEngine';
import { audioBufferToWavBlob } from '../../utils/wav';
import { useVoiceStore } from '../../store/voiceStore';
import { computeSimplePeaks } from '../../services/voiceUploadService';
import { toastError, toastSuccess, toastInfo } from '../../hooks/useToast';
import { VOICE_MIN_DURATION_SECONDS } from '../../services/voiceUploadService';

const VOICE_RECORD_TRACK_ID = '__voice-recording__';

export function VoiceRecordButton() {
  const addVoice = useVoiceStore((s) => s.addVoice);
  const [isRecording, setIsRecording] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clean up interval on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startRecording = useCallback(async () => {
    const ok = await recordingEngine.requestPermission();
    if (!ok) {
      toastError('Microphone permission denied');
      return;
    }

    try {
      await recordingEngine.startRecording(VOICE_RECORD_TRACK_ID, 'voice-region', 0);
      setIsRecording(true);
      setRecordingDuration(0);
      toastInfo('Recording... Sing or speak into your microphone.');

      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        setRecordingDuration(Math.floor((Date.now() - startTime) / 1000));
      }, 500);
    } catch {
      toastError('Failed to start recording');
    }
  }, []);

  const stopRecording = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsStopping(true);

    const result = await recordingEngine.stopRecording(VOICE_RECORD_TRACK_ID);
    setIsRecording(false);
    setIsStopping(false);
    if (!result) {
      toastError('No audio captured');
      return;
    }

    if (result.duration < VOICE_MIN_DURATION_SECONDS) {
      toastError(`Recording too short (${Math.round(result.duration)}s). Minimum is ${VOICE_MIN_DURATION_SECONDS}s.`);
      return;
    }

    const blob = audioBufferToWavBlob(result.audioBuffer);
    const peaks = computeSimplePeaks(result.audioBuffer, 64);
    const name = `Recording ${new Date().toLocaleTimeString()}`;

    addVoice(
      {
        name,
        durationSeconds: result.duration,
        skillLevel: 'intermediate',
        source: 'recording',
        tags: [],
        waveformPeaks: peaks,
      },
      blob,
    );

    toastSuccess(`Voice recording "${name}" added (${Math.round(result.duration)}s)`);
    setRecordingDuration(0);
  }, [addVoice]);

  return (
    <button
      type="button"
      onClick={isRecording ? stopRecording : startRecording}
      disabled={isStopping}
      className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-medium transition-colors ${
        isRecording
          ? 'bg-red-900/40 text-red-300 hover:bg-red-900/60'
          : 'bg-transparent text-zinc-400 hover:bg-daw-hover-subtle hover:text-zinc-200'
      } ${isStopping ? 'opacity-50 cursor-not-allowed' : ''}`}
      aria-label={isStopping ? 'Stopping...' : isRecording ? 'Stop recording' : 'Record voice'}
      data-testid="voice-record-btn"
    >
      {isRecording ? (
        <>
          <div className="w-2 h-2 rounded-sm bg-red-400 animate-pulse" />
          <span className="font-mono">{recordingDuration}s</span>
        </>
      ) : (
        <>
          <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="5" r="3" />
            <path d="M13 8v1a5 5 0 0 1-10 0V8H2v1a6 6 0 0 0 5.5 5.98V17h1v-2.02A6 6 0 0 0 14 9V8h-1z" />
          </svg>
          <span>Record</span>
        </>
      )}
    </button>
  );
}
