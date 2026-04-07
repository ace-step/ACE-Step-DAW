/**
 * Zustand store for Voice Identity Verification (#1096).
 *
 * Manages the verification flow for voice cloning consent:
 * - Verification modal open/close state
 * - Recording state and duration
 * - Verification result tracking
 * - Self-hosted bypass settings
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  VerificationStatus,
  VerificationPhrase,
  VerificationResult,
  VoiceVerificationSettings,
} from '../types/voiceVerification';
import {
  getRandomPhrase,
  submitVerification,
  VoiceRecorder,
} from '../services/voiceVerificationService';

export interface VoiceVerificationState {
  /** Whether the verification modal is open */
  modalOpen: boolean;

  /** Current verification status */
  status: VerificationStatus;

  /** The phrase currently displayed for the user to read */
  currentPhrase: VerificationPhrase | null;

  /** Recorded spoken audio blob */
  spokenAudioBlob: Blob | null;

  /** Reference singing audio blob (from voice profile creation) */
  singingAudioBlob: Blob | null;

  /** Result from the verification API */
  result: VerificationResult | null;

  /** Error message */
  error: string | null;

  /** Recording duration in seconds */
  recordingDuration: number;

  /** Number of retry attempts in current session */
  retryCount: number;

  /** Settings (persisted) */
  settings: VoiceVerificationSettings;

  // ─── Actions ──────────────────────────────────────────

  /** Open the verification modal with a singing reference sample */
  openVerification: (singingAudioBlob: Blob, language?: string) => void;

  /** Close the verification modal and reset state */
  closeVerification: () => void;

  /** Start recording spoken verification phrase */
  startRecording: () => Promise<void>;

  /** Stop recording and store the spoken audio */
  stopRecording: () => Promise<void>;

  /** Submit the verification (spoken + singing) to backend */
  submitVerification: () => Promise<void>;

  /** Retry with a new phrase */
  retry: () => void;

  /** Update verification settings */
  updateSettings: (patch: Partial<VoiceVerificationSettings>) => void;

  /** Check if verification is required (respects self-hosted bypass) */
  isVerificationRequired: () => boolean;

  /** Reset to initial state (keeps settings) */
  reset: () => void;
}

const DEFAULT_SETTINGS: VoiceVerificationSettings = {
  enabled: true,
  micDeviceId: null,
  minRecordingDurationSec: 3,
  maxRetries: 3,
};

let activeRecorder: VoiceRecorder | null = null;

export const useVoiceVerificationStore = create<VoiceVerificationState>()(
  persist(
    (set, get) => ({
      modalOpen: false,
      status: 'idle',
      currentPhrase: null,
      spokenAudioBlob: null,
      singingAudioBlob: null,
      result: null,
      error: null,
      recordingDuration: 0,
      retryCount: 0,
      settings: DEFAULT_SETTINGS,

      openVerification: (singingAudioBlob: Blob, language?: string) => {
        const phrase = getRandomPhrase(language);
        set({
          modalOpen: true,
          status: 'idle',
          currentPhrase: phrase,
          singingAudioBlob,
          spokenAudioBlob: null,
          result: null,
          error: null,
          recordingDuration: 0,
          retryCount: 0,
        });
      },

      closeVerification: () => {
        if (activeRecorder) {
          activeRecorder.dispose();
          activeRecorder = null;
        }
        set({
          modalOpen: false,
          status: 'idle',
          currentPhrase: null,
          spokenAudioBlob: null,
          singingAudioBlob: null,
          result: null,
          error: null,
          recordingDuration: 0,
          retryCount: 0,
        });
      },

      startRecording: async () => {
        const { settings } = get();
        try {
          activeRecorder = new VoiceRecorder();
          await activeRecorder.startRecording(settings.micDeviceId);

          set({ status: 'recording', error: null, recordingDuration: 0 });

          // Update duration periodically
          const interval = setInterval(() => {
            if (activeRecorder?.isRecording) {
              set({ recordingDuration: activeRecorder.duration });
            } else {
              clearInterval(interval);
            }
          }, 100);
        } catch (err) {
          set({
            status: 'error',
            error: err instanceof Error
              ? err.message
              : 'Failed to access microphone. Please check permissions.',
          });
        }
      },

      stopRecording: async () => {
        if (!activeRecorder?.isRecording) {
          set({ status: 'error', error: 'Not recording' });
          return;
        }

        try {
          const blob = await activeRecorder.stopRecording();
          const duration = activeRecorder.duration;
          activeRecorder = null;

          const { settings } = get();
          if (duration < settings.minRecordingDurationSec) {
            set({
              status: 'error',
              error: `Recording too short. Please record for at least ${settings.minRecordingDurationSec} seconds.`,
              spokenAudioBlob: null,
            });
            return;
          }

          set({
            status: 'idle',
            spokenAudioBlob: blob,
            recordingDuration: duration,
          });
        } catch (err) {
          activeRecorder = null;
          set({
            status: 'error',
            error: err instanceof Error ? err.message : 'Recording failed',
          });
        }
      },

      submitVerification: async () => {
        const { currentPhrase, spokenAudioBlob, singingAudioBlob } = get();
        if (!currentPhrase || !spokenAudioBlob || !singingAudioBlob) {
          set({ status: 'error', error: 'Missing audio samples for verification' });
          return;
        }

        set({ status: 'submitting', error: null });

        try {
          const result = await submitVerification(
            currentPhrase.id,
            spokenAudioBlob,
            singingAudioBlob,
          );

          set({
            status: result.verified ? 'verified' : 'rejected',
            result,
          });
        } catch (err) {
          set({
            status: 'error',
            error: err instanceof Error ? err.message : 'Verification request failed',
          });
        }
      },

      retry: () => {
        const { retryCount, settings } = get();
        if (retryCount >= settings.maxRetries) {
          set({
            status: 'error',
            error: `Maximum retry attempts (${settings.maxRetries}) exceeded. Please try again later.`,
          });
          return;
        }

        if (activeRecorder) {
          activeRecorder.dispose();
          activeRecorder = null;
        }

        const phrase = getRandomPhrase(get().currentPhrase?.language);
        set({
          status: 'idle',
          currentPhrase: phrase,
          spokenAudioBlob: null,
          result: null,
          error: null,
          recordingDuration: 0,
          retryCount: retryCount + 1,
        });
      },

      updateSettings: (patch: Partial<VoiceVerificationSettings>) => {
        set((s) => ({
          settings: { ...s.settings, ...patch },
        }));
      },

      isVerificationRequired: () => {
        return get().settings.enabled;
      },

      reset: () => {
        if (activeRecorder) {
          activeRecorder.dispose();
          activeRecorder = null;
        }
        set({
          modalOpen: false,
          status: 'idle',
          currentPhrase: null,
          spokenAudioBlob: null,
          singingAudioBlob: null,
          result: null,
          error: null,
          recordingDuration: 0,
          retryCount: 0,
        });
      },
    }),
    {
      name: 'ace-daw-voice-verification',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Only persist settings, not transient state
        settings: state.settings,
      }),
    },
  ),
);
