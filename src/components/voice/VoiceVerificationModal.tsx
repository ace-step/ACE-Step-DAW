/**
 * VoiceVerificationModal — multi-step flow for voice identity verification.
 *
 * Steps:
 * 1. Upload/record reference vocal sample
 * 2. Display random phrase + record user reading it
 * 3. Submit both to backend for comparison
 * 4. Show result (verified / failed)
 *
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1096
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useVoiceVerificationStore } from '../../store/voiceVerificationStore';
import type { AddVoiceInput } from '../../store/voiceStore';
import { recordingEngine } from '../../engine/RecordingEngine';
import { audioBufferToWavBlob } from '../../utils/wav';
import {
  computeSimplePeaks,
  isVoiceUploadError,
  processVoiceAudioFile,
  VOICE_MIN_DURATION_SECONDS,
} from '../../services/voiceUploadService';
import { Z } from '../../utils/zIndex';

type Step = 'reference' | 'phrase' | 'verify' | 'result';

interface CapturedRecording {
  blob: Blob;
  durationSeconds: number;
  audioBuffer: AudioBuffer;
}

const REFERENCE_TRACK_ID = 'voice-ref';
const PHRASE_TRACK_ID = 'voice-phrase';
const MAX_RECORDING_SECONDS = 30;

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function VoiceVerificationModal() {
  const show = useUIStore((s) => s.showVoiceVerificationModal);
  const setShow = useUIStore((s) => s.setShowVoiceVerificationModal);

  const currentPhrase = useVoiceVerificationStore((s) => s.currentPhrase);
  const pendingVoice = useVoiceVerificationStore((s) => s.pendingVoice);
  const verificationStatus = useVoiceVerificationStore((s) => s.verificationStatus);
  const verificationError = useVoiceVerificationStore((s) => s.verificationError);
  const selfHostedSkipEnabled = useVoiceVerificationStore((s) => s.selfHostedSkipEnabled);
  const beginVerification = useVoiceVerificationStore((s) => s.beginVerification);
  const updatePendingVoiceName = useVoiceVerificationStore((s) => s.updatePendingVoiceName);
  const fetchPhrase = useVoiceVerificationStore((s) => s.fetchVerificationPhrase);
  const setRecordedPhrase = useVoiceVerificationStore((s) => s.setRecordedPhrase);
  const submitVerification = useVoiceVerificationStore((s) => s.submitVerification);
  const skipVerification = useVoiceVerificationStore((s) => s.skipVerification);
  const resetVerification = useVoiceVerificationStore((s) => s.resetVerification);
  const cancelVerification = useVoiceVerificationStore((s) => s.cancelVerification);

  const [step, setStep] = useState<Step>('reference');
  const [profileName, setProfileName] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [inputLevel, setInputLevel] = useState(0);
  const [hasPermission, setHasPermission] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [hasReferenceAudio, setHasReferenceAudio] = useState(false);
  const [hasRecordedPhrase, setHasRecordedPhrase] = useState(false);

  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const levelTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef(0);
  const activeRecordingTrackRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (show) {
      setStep('reference');
      setProfileName(pendingVoice?.input.name ?? '');
      setIsRecording(false);
      setRecordingDuration(0);
      setInputLevel(0);
      setHasPermission(recordingEngine.hasPermission);
      setPermissionError(false);
      setHasReferenceAudio(Boolean(pendingVoice));
      setHasRecordedPhrase(false);
      audioBufferRef.current = null;
    }
    return () => {
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (levelTimerRef.current) clearInterval(levelTimerRef.current);
    };
  }, [show]);

  const cleanupRecordingResources = useCallback(() => {
    if (isRecording) {
      const activeTrackId = activeRecordingTrackRef.current;
      if (activeTrackId) {
        void recordingEngine.stopRecording(activeTrackId);
      }
      activeRecordingTrackRef.current = null;
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (levelTimerRef.current) {
      clearInterval(levelTimerRef.current);
      levelTimerRef.current = null;
    }
  }, [isRecording]);

  const handleClose = useCallback(() => {
    if (
      pendingVoice &&
      verificationStatus !== 'verified' &&
      !window.confirm('Discard this pending voice verification? The captured reference audio will be lost.')
    ) {
      return;
    }

    cleanupRecordingResources();
    // Clear blobs from memory for privacy — verification audio should not
    // persist beyond the modal's lifecycle.
    cancelVerification();
    setShow(false);
  }, [cancelVerification, cleanupRecordingResources, pendingVoice, setShow, verificationStatus]);

  // Escape key handler
  useEffect(() => {
    if (!show) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); handleClose(); }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [show, handleClose]);

  const requestMicPermission = useCallback(async () => {
    const granted = await recordingEngine.requestPermission();
    setHasPermission(granted);
    setPermissionError(!granted);
    return granted;
  }, []);

  const stopRecording = useCallback(async (trackId: string): Promise<CapturedRecording | null> => {
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    if (levelTimerRef.current) {
      clearInterval(levelTimerRef.current);
      levelTimerRef.current = null;
    }

    const result = await recordingEngine.stopRecording(trackId);
    activeRecordingTrackRef.current = null;
    setIsRecording(false);
    setInputLevel(0);

    if (!result || result.duration < VOICE_MIN_DURATION_SECONDS) return null;

    audioBufferRef.current = result.audioBuffer;
    return {
      blob: audioBufferToWavBlob(result.audioBuffer),
      durationSeconds: result.duration,
      audioBuffer: result.audioBuffer,
    };
  }, []);

  const completeRecording = useCallback((trackId: string, recording: CapturedRecording) => {
    if (trackId === REFERENCE_TRACK_ID) {
      const input: AddVoiceInput = {
        name: profileName.trim() || `Recording ${new Date().toLocaleTimeString()}`,
        durationSeconds: recording.durationSeconds,
        skillLevel: 'intermediate',
        source: 'recording',
        tags: [],
        waveformPeaks: computeSimplePeaks(recording.audioBuffer, 64),
      };
      beginVerification(input, recording.blob);
      setHasReferenceAudio(true);
      return;
    }

    if (trackId === PHRASE_TRACK_ID) {
      setRecordedPhrase(recording.blob);
      setHasRecordedPhrase(true);
    }
  }, [beginVerification, profileName, setRecordedPhrase]);

  const startRecording = useCallback(async (trackId: string) => {
    let permission = hasPermission;
    if (!permission) {
      permission = await requestMicPermission();
      if (!permission) return;
    }

    const started = await recordingEngine.startRecording(trackId, 'voice-verify', 0);
    if (!started) return;

    activeRecordingTrackRef.current = trackId;
    setIsRecording(true);
    startTimeRef.current = Date.now();
    setRecordingDuration(0);

    recordingTimerRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTimeRef.current) / 1000;
      setRecordingDuration(elapsed);
      if (elapsed >= MAX_RECORDING_SECONDS) {
        void stopRecording(trackId).then((recording) => {
          if (recording) completeRecording(trackId, recording);
        });
      }
    }, 100);

    levelTimerRef.current = setInterval(() => {
      setInputLevel(recordingEngine.getInputLevelLinear());
    }, 50);
  }, [completeRecording, hasPermission, requestMicPermission, stopRecording]);

  // Step 1: Record reference vocal
  const handleRecordReference = useCallback(async () => {
    if (isRecording) {
      const recording = await stopRecording(REFERENCE_TRACK_ID);
      if (recording) completeRecording(REFERENCE_TRACK_ID, recording);
    } else {
      await startRecording(REFERENCE_TRACK_ID);
    }
  }, [completeRecording, isRecording, startRecording, stopRecording]);

  // Handle file upload for reference
  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    let ctx: AudioContext | null = null;
    try {
      ctx = new AudioContext();
      const result = await processVoiceAudioFile(file, ctx);
      if (isVoiceUploadError(result)) {
        return;
      }

      const input: AddVoiceInput = {
        name: profileName.trim() || result.name,
        durationSeconds: result.durationSeconds,
        skillLevel: 'intermediate',
        source: result.source,
        tags: [],
        waveformPeaks: result.waveformPeaks,
      };

      if (pendingVoice) {
        beginVerification(input, result.blob);
      } else {
        beginVerification(input, result.blob);
      }
      setHasReferenceAudio(true);
    } finally {
      ctx?.close();
    }
  }, [beginVerification, pendingVoice, profileName]);

  // Move to phrase step
  const handleNextToPhrase = useCallback(async () => {
    if (!profileName.trim() || !pendingVoice) return;
    updatePendingVoiceName(profileName.trim());
    await fetchPhrase('en');
    const state = useVoiceVerificationStore.getState();
    if (state.currentPhrase && state.verificationStatus !== 'error') {
      setStep('phrase');
    }
  }, [fetchPhrase, pendingVoice, profileName, updatePendingVoiceName]);

  // Step 2: Record spoken phrase
  const handleRecordPhrase = useCallback(async () => {
    if (isRecording) {
      const recording = await stopRecording(PHRASE_TRACK_ID);
      if (recording) completeRecording(PHRASE_TRACK_ID, recording);
    } else {
      await startRecording(PHRASE_TRACK_ID);
    }
  }, [completeRecording, isRecording, startRecording, stopRecording]);

  // Step 3: Submit verification
  const handleVerify = useCallback(async () => {
    setStep('verify');
    updatePendingVoiceName(profileName.trim());
    await submitVerification();
    setStep('result');
  }, [profileName, submitVerification, updatePendingVoiceName]);

  // Skip (self-hosted)
  const handleSkip = useCallback(() => {
    updatePendingVoiceName(profileName.trim());
    skipVerification();
    cleanupRecordingResources();
    setShow(false);
  }, [cleanupRecordingResources, profileName, setShow, skipVerification, updatePendingVoiceName]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm"
      style={{ zIndex: Z.modal }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
      role="dialog"
      aria-label="Voice Identity Verification"
      aria-modal="true"
    >
      <div
        className="w-[480px] rounded-xl border border-zinc-700/50 bg-zinc-900 shadow-2xl"
        data-testid="voice-verification-modal"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800">
          <h2 className="text-sm font-semibold text-zinc-200">Voice Identity Verification</h2>
          <button
            onClick={handleClose}
            className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded transition-colors"
            aria-label="Close"
            data-testid="voice-verify-close"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-zinc-800">
          {(['reference', 'phrase', 'verify', 'result'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className={`w-6 h-px ${step === s || (['reference', 'phrase', 'verify', 'result'].indexOf(step) > i - 1) ? 'bg-indigo-500' : 'bg-zinc-700'}`} />}
              <div
                className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-medium ${
                  step === s
                    ? 'bg-indigo-600 text-white'
                    : (['reference', 'phrase', 'verify', 'result'].indexOf(step) > i)
                      ? 'bg-indigo-900/60 text-indigo-300'
                      : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {i + 1}
              </div>
            </div>
          ))}
          <span className="text-[10px] text-zinc-500 ml-2">
            {step === 'reference' && 'Reference Audio'}
            {step === 'phrase' && 'Read Phrase'}
            {step === 'verify' && 'Verifying...'}
            {step === 'result' && 'Result'}
          </span>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4 min-h-[200px]">
          {/* Step 1: Reference Audio */}
          {step === 'reference' && (
            <>
              <p className="text-xs text-zinc-400">
                Provide a sample of your singing voice. This will be compared against a spoken phrase to verify your identity.
              </p>

              <div>
                <label className="text-[10px] text-zinc-500 block mb-1" htmlFor="profile-name">
                  Voice Profile Name
                </label>
                <input
                  id="profile-name"
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  placeholder="e.g., My Voice"
                  className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700/50 text-xs text-zinc-200 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              {/* Recording controls */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => void handleRecordReference()}
                    className={`flex-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded text-xs font-medium transition-colors ${
                      isRecording
                        ? 'bg-red-600 hover:bg-red-500 text-white'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/50'
                    }`}
                    aria-label={isRecording ? 'Stop recording reference' : 'Record reference vocal'}
                  >
                    {isRecording ? (
                      <>
                        <div className="w-2.5 h-2.5 rounded-sm bg-white" />
                        Stop ({formatTime(recordingDuration)})
                      </>
                    ) : (
                      <>
                        <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                        Record Reference
                      </>
                    )}
                  </button>
                  <span className="text-[10px] text-zinc-600">or</span>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-2.5 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/50 transition-colors"
                    disabled={isRecording}
                  >
                    Upload
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={(e) => handleFileUpload(e.target.files)}
                    aria-hidden="true"
                  />
                </div>

                {/* Level meter */}
                {isRecording && (
                  <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-75"
                      style={{ width: `${Math.min(100, inputLevel * 100)}%` }}
                      role="meter"
                      aria-label="Input level"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(inputLevel * 100)}
                    />
                  </div>
                )}

                {hasReferenceAudio && !isRecording && (
                  <div className="flex items-center gap-2 text-[10px] text-emerald-400">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Reference audio captured
                  </div>
                )}

                {permissionError && (
                  <p className="text-[10px] text-red-400">
                    Microphone permission denied. Please allow access in browser settings.
                  </p>
                )}

                {verificationStatus === 'error' && verificationError && (
                  <p className="text-[10px] text-red-400">
                    {verificationError}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Step 2: Read Phrase */}
          {step === 'phrase' && (
            <>
              <p className="text-xs text-zinc-400">
                Read the following phrase aloud. This confirms you are the owner of the voice being cloned.
              </p>

              {currentPhrase ? (
                <div className="p-4 rounded-lg bg-zinc-800 border border-zinc-700/50">
                  <p className="text-sm text-zinc-200 font-medium leading-relaxed" data-testid="verification-phrase-text">
                    &ldquo;{currentPhrase.text}&rdquo;
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-center py-4">
                  <div className="h-4 w-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-zinc-400 ml-2">Loading phrase...</span>
                </div>
              )}

              <div className="space-y-3">
                <button
                  onClick={() => void handleRecordPhrase()}
                  disabled={!currentPhrase}
                  className={`w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded text-xs font-medium transition-colors ${
                    isRecording
                      ? 'bg-red-600 hover:bg-red-500 text-white'
                      : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/50'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                  aria-label={isRecording ? 'Stop recording phrase' : 'Record spoken phrase'}
                >
                  {isRecording ? (
                    <>
                      <div className="w-2.5 h-2.5 rounded-sm bg-white" />
                      Stop ({formatTime(recordingDuration)})
                    </>
                  ) : (
                    <>
                      <div className="w-2.5 h-2.5 rounded-full bg-red-500" />
                      Record Phrase
                    </>
                  )}
                </button>

                {isRecording && (
                  <div className="h-1.5 w-full rounded-full bg-zinc-800 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-emerald-500 transition-all duration-75"
                      style={{ width: `${Math.min(100, inputLevel * 100)}%` }}
                    />
                  </div>
                )}

                {hasRecordedPhrase && !isRecording && (
                  <div className="flex items-center gap-2 text-[10px] text-emerald-400">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Phrase recorded
                  </div>
                )}
              </div>
            </>
          )}

          {/* Step 3: Verifying */}
          {step === 'verify' && (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <div className="h-6 w-6 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-xs text-zinc-400">Comparing voice samples...</p>
              <p className="text-[10px] text-zinc-600">This may take a few seconds</p>
            </div>
          )}

          {/* Step 4: Result */}
          {step === 'result' && (
            <div className="flex flex-col items-center justify-center py-6 gap-3">
              {verificationStatus === 'verified' && (
                <>
                  <div className="w-12 h-12 rounded-full bg-emerald-900/40 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12l5 5L19 7" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-emerald-400">Verification Successful</p>
                  <p className="text-[10px] text-zinc-500 text-center">
                    Your voice identity has been confirmed. The profile &ldquo;{profileName}&rdquo; is now verified.
                  </p>
                </>
              )}
              {verificationStatus === 'failed' && (
                <>
                  <div className="w-12 h-12 rounded-full bg-red-900/40 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M6 6l12 12M18 6L6 18" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-red-400">Verification Failed</p>
                  <p className="text-[10px] text-zinc-500 text-center">
                    {verificationError}
                  </p>
                  <button
                    onClick={() => {
                      resetVerification();
                      setStep('reference');
                      setHasReferenceAudio(Boolean(useVoiceVerificationStore.getState().pendingVoice));
                      setHasRecordedPhrase(false);
                    }}
                    className="mt-2 px-4 py-1.5 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/50 transition-colors"
                  >
                    Try Again
                  </button>
                </>
              )}
              {verificationStatus === 'error' && (
                <>
                  <div className="w-12 h-12 rounded-full bg-amber-900/40 flex items-center justify-center">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                      <path d="M12 9v4M12 17h.01" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" />
                      <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </div>
                  <p className="text-sm font-medium text-amber-400">Verification Error</p>
                  <p className="text-[10px] text-zinc-500 text-center">{verificationError}</p>
                  <button
                    onClick={() => { resetVerification(); setStep('reference'); }}
                    className="mt-2 px-4 py-1.5 rounded text-xs font-medium bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700/50 transition-colors"
                  >
                    Try Again
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-zinc-800">
          <div>
            {selfHostedSkipEnabled && step === 'reference' && (
              <button
                onClick={handleSkip}
                disabled={!profileName.trim()}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-50"
              >
                Skip verification (self-hosted)
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {step === 'reference' && (
              <button
                onClick={() => void handleNextToPhrase()}
                disabled={!hasReferenceAudio || !profileName.trim()}
                className="px-4 py-1.5 rounded text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            )}
            {step === 'phrase' && (
              <button
                onClick={() => void handleVerify()}
                disabled={!hasRecordedPhrase}
                className="px-4 py-1.5 rounded text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed transition-colors"
              >
                Verify Identity
              </button>
            )}
            {step === 'result' && verificationStatus === 'verified' && (
              <button
                onClick={handleClose}
                className="px-4 py-1.5 rounded text-xs font-medium bg-indigo-600 hover:bg-indigo-500 text-white transition-colors"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
