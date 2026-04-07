/**
 * VoiceVerificationModal — Voice identity verification for voice cloning consent.
 *
 * Displays a random phrase for the user to read aloud, records their spoken voice,
 * and submits both spoken + singing samples to verify ownership.
 *
 * Flow: Display Phrase → Record → Submit → Result (verified / rejected / retry)
 */
import { useCallback, useEffect, useRef } from 'react';
import { useVoiceVerificationStore } from '../../store/voiceVerificationStore';

const MIN_DISPLAY_DURATION = 1; // seconds before recording is allowed

export function VoiceVerificationModal() {
  const modalOpen = useVoiceVerificationStore((s) => s.modalOpen);
  const status = useVoiceVerificationStore((s) => s.status);
  const currentPhrase = useVoiceVerificationStore((s) => s.currentPhrase);
  const spokenAudioBlob = useVoiceVerificationStore((s) => s.spokenAudioBlob);
  const result = useVoiceVerificationStore((s) => s.result);
  const error = useVoiceVerificationStore((s) => s.error);
  const recordingDuration = useVoiceVerificationStore((s) => s.recordingDuration);
  const retryCount = useVoiceVerificationStore((s) => s.retryCount);
  const settings = useVoiceVerificationStore((s) => s.settings);

  const closeVerification = useVoiceVerificationStore((s) => s.closeVerification);
  const startRecording = useVoiceVerificationStore((s) => s.startRecording);
  const stopRecording = useVoiceVerificationStore((s) => s.stopRecording);
  const submitVerificationAction = useVoiceVerificationStore((s) => s.submitVerification);
  const retry = useVoiceVerificationStore((s) => s.retry);

  const backdropRef = useRef<HTMLDivElement>(null);

  // Escape key handler
  useEffect(() => {
    if (!modalOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        closeVerification();
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [modalOpen, closeVerification]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === backdropRef.current) {
        closeVerification();
      }
    },
    [closeVerification],
  );

  const handleRecord = useCallback(async () => {
    if (status === 'recording') {
      await stopRecording();
    } else {
      await startRecording();
    }
  }, [status, startRecording, stopRecording]);

  const handleSubmit = useCallback(async () => {
    await submitVerificationAction();
  }, [submitVerificationAction]);

  if (!modalOpen) return null;

  const canRecord = status === 'idle' || status === 'error';
  const canSubmit = status === 'idle' && spokenAudioBlob !== null;
  const isRecording = status === 'recording';
  const isSubmitting = status === 'submitting';
  const isVerified = status === 'verified';
  const isRejected = status === 'rejected';
  const canRetry = retryCount < settings.maxRetries && (isRejected || status === 'error');

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: 'rgba(0, 0, 0, 0.6)' }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Voice identity verification"
    >
      <div
        className="rounded-lg border shadow-xl"
        style={{
          backgroundColor: 'var(--color-daw-surface)',
          borderColor: 'var(--color-daw-border)',
          width: '480px',
          maxWidth: '90vw',
          maxHeight: '90vh',
          overflow: 'auto',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between border-b px-5 py-3"
          style={{ borderColor: 'var(--color-daw-border)' }}
        >
          <h2 className="text-sm font-semibold" style={{ color: 'white' }}>
            Voice Identity Verification
          </h2>
          <button
            onClick={closeVerification}
            className="flex h-6 w-6 items-center justify-center rounded text-xs hover:bg-white/10"
            style={{ color: 'var(--color-daw-text-muted)' }}
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {/* Explanation */}
          <p className="text-xs leading-relaxed" style={{ color: 'var(--color-daw-text-muted)' }}>
            To protect against unauthorized voice cloning, please read the phrase below aloud.
            We will verify that your speaking voice matches the singing sample you provided.
          </p>

          {/* Phrase Display */}
          {currentPhrase && !isVerified && (
            <div
              className="rounded-md border px-4 py-3"
              style={{
                backgroundColor: 'var(--color-daw-surface-2)',
                borderColor: 'var(--color-daw-border)',
              }}
            >
              <div
                className="mb-1 text-[10px] uppercase tracking-wider"
                style={{ color: 'var(--color-daw-text-muted)' }}
              >
                Read this phrase aloud:
              </div>
              <div className="text-sm font-medium leading-relaxed" style={{ color: 'white' }}>
                {currentPhrase.text}
              </div>
            </div>
          )}

          {/* Recording Controls */}
          {!isVerified && !isRejected && (
            <div className="flex items-center gap-3">
              <button
                onClick={handleRecord}
                disabled={!canRecord && !isRecording}
                className="flex items-center gap-2 rounded-md px-4 py-2 text-xs font-medium transition-colors"
                style={{
                  backgroundColor: isRecording
                    ? 'rgb(220, 38, 38)'
                    : 'var(--color-daw-accent)',
                  color: 'white',
                  opacity: (!canRecord && !isRecording) ? 0.5 : 1,
                }}
                aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              >
                {isRecording ? (
                  <>
                    <span className="inline-block h-2 w-2 rounded-sm bg-white" />
                    Stop Recording
                  </>
                ) : (
                  <>
                    <span className="inline-block h-2 w-2 rounded-full bg-red-400" />
                    {spokenAudioBlob ? 'Re-record' : 'Start Recording'}
                  </>
                )}
              </button>

              {/* Duration display */}
              {(isRecording || recordingDuration > 0) && (
                <span
                  className="text-xs tabular-nums"
                  style={{ color: isRecording ? 'rgb(220, 38, 38)' : 'var(--color-daw-text-muted)' }}
                >
                  {recordingDuration.toFixed(1)}s
                  {isRecording && (
                    <span className="ml-1 animate-pulse">●</span>
                  )}
                </span>
              )}

              {/* Min duration hint */}
              {isRecording && recordingDuration < settings.minRecordingDurationSec && (
                <span className="text-[10px]" style={{ color: 'var(--color-daw-text-muted)' }}>
                  min {settings.minRecordingDurationSec}s
                </span>
              )}
            </div>
          )}

          {/* Submit button */}
          {canSubmit && (
            <button
              onClick={handleSubmit}
              className="w-full rounded-md py-2 text-xs font-medium transition-colors"
              style={{
                backgroundColor: 'var(--color-daw-accent)',
                color: 'white',
              }}
            >
              Verify My Voice
            </button>
          )}

          {/* Submitting state */}
          {isSubmitting && (
            <div className="flex items-center justify-center gap-2 py-2">
              <div
                className="h-4 w-4 animate-spin rounded-full border-2 border-t-transparent"
                style={{ borderColor: 'var(--color-daw-accent)', borderTopColor: 'transparent' }}
              />
              <span className="text-xs" style={{ color: 'var(--color-daw-text-muted)' }}>
                Verifying identity...
              </span>
            </div>
          )}

          {/* Success result */}
          {isVerified && result && (
            <div
              className="flex items-center gap-3 rounded-md border px-4 py-3"
              style={{
                backgroundColor: 'rgba(34, 197, 94, 0.1)',
                borderColor: 'rgba(34, 197, 94, 0.3)',
              }}
            >
              <span className="text-lg">✓</span>
              <div>
                <div className="text-sm font-medium" style={{ color: 'rgb(34, 197, 94)' }}>
                  Verification Successful
                </div>
                <div className="text-xs" style={{ color: 'var(--color-daw-text-muted)' }}>
                  {result.message}
                  {result.confidence > 0 && ` (confidence: ${Math.round(result.confidence * 100)}%)`}
                </div>
              </div>
            </div>
          )}

          {/* Rejected result */}
          {isRejected && result && (
            <div
              className="flex items-center gap-3 rounded-md border px-4 py-3"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                borderColor: 'rgba(239, 68, 68, 0.3)',
              }}
            >
              <span className="text-lg">✗</span>
              <div>
                <div className="text-sm font-medium" style={{ color: 'rgb(239, 68, 68)' }}>
                  Verification Failed
                </div>
                <div className="text-xs" style={{ color: 'var(--color-daw-text-muted)' }}>
                  {result.message}. The voices did not match. Please ensure you are the owner of the singing sample.
                </div>
              </div>
            </div>
          )}

          {/* Error display */}
          {error && status === 'error' && (
            <div
              className="rounded-md px-3 py-2 text-xs"
              style={{
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                color: 'rgb(239, 68, 68)',
              }}
            >
              {error}
            </div>
          )}

          {/* Retry info */}
          {retryCount > 0 && !isVerified && (
            <div className="text-[10px]" style={{ color: 'var(--color-daw-text-muted)' }}>
              Attempt {retryCount + 1} of {settings.maxRetries + 1}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-end gap-2 border-t px-5 py-3"
          style={{ borderColor: 'var(--color-daw-border)' }}
        >
          {canRetry && (
            <button
              onClick={retry}
              className="rounded-md px-4 py-1.5 text-xs font-medium transition-colors hover:bg-white/10"
              style={{
                color: 'var(--color-daw-text-muted)',
                border: '1px solid var(--color-daw-border)',
              }}
            >
              Try Again
            </button>
          )}

          {isVerified ? (
            <button
              onClick={closeVerification}
              className="rounded-md px-4 py-1.5 text-xs font-medium"
              style={{
                backgroundColor: 'var(--color-daw-accent)',
                color: 'white',
              }}
            >
              Continue
            </button>
          ) : (
            <button
              onClick={closeVerification}
              className="rounded-md px-4 py-1.5 text-xs font-medium transition-colors hover:bg-white/10"
              style={{ color: 'var(--color-daw-text-muted)' }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
