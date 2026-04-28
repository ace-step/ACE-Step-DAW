import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { AddVoiceInput } from './voiceStore';
import { useVoiceStore } from './voiceStore';
import {
  getVerificationPhrase,
  verifyVoiceIdentity,
} from '../services/aceStepApi';

export type VerificationFlowStatus = 'idle' | 'fetching_phrase' | 'recording' | 'verifying' | 'verified' | 'failed' | 'error';

export interface CurrentPhrase {
  phraseId: string;
  text: string;
  language: string;
}

export interface PendingVoiceVerification {
  input: AddVoiceInput;
  audioBlob: Blob;
}

export interface VoiceVerificationStore {
  pendingVoice: PendingVoiceVerification | null;
  currentPhrase: CurrentPhrase | null;
  verificationStatus: VerificationFlowStatus;
  verificationError: string | null;
  recordedPhrase: Blob | null;
  referenceAudio: Blob | null;
  selfHostedSkipEnabled: boolean;

  beginVerification: (input: AddVoiceInput, audioBlob: Blob) => void;
  updatePendingVoiceName: (name: string) => void;

  fetchVerificationPhrase: (language?: string) => Promise<void>;

  setReferenceAudio: (blob: Blob) => void;
  setRecordedPhrase: (blob: Blob) => void;

  submitVerification: () => Promise<void>;
  skipVerification: () => void;
  resetVerification: () => void;
  cancelVerification: () => void;

  setSelfHostedSkipEnabled: (enabled: boolean) => void;
}

export const useVoiceVerificationStore = create<VoiceVerificationStore>()(
  persist(
    (set, get) => ({
      pendingVoice: null,
      currentPhrase: null,
      verificationStatus: 'idle',
      verificationError: null,
      recordedPhrase: null,
      referenceAudio: null,
      selfHostedSkipEnabled: false,

      beginVerification: (input, audioBlob) => {
        set({
          pendingVoice: { input, audioBlob },
          referenceAudio: audioBlob,
          recordedPhrase: null,
          currentPhrase: null,
          verificationStatus: 'idle',
          verificationError: null,
        });
      },

      updatePendingVoiceName: (name) => {
        set((state) => state.pendingVoice
          ? {
              pendingVoice: {
                ...state.pendingVoice,
                input: { ...state.pendingVoice.input, name },
              },
            }
          : {});
      },

      fetchVerificationPhrase: async (language = 'en') => {
        set({ verificationStatus: 'fetching_phrase', verificationError: null });
        try {
          const response = await getVerificationPhrase(language);
          set({
            currentPhrase: {
              phraseId: response.phrase_id,
              text: response.text,
              language: response.language,
            },
            verificationStatus: 'idle',
          });
        } catch (err) {
          set({
            verificationStatus: 'error',
            verificationError: err instanceof Error ? err.message : String(err),
          });
        }
      },

      setReferenceAudio: (blob) => {
        set((state) => ({
          referenceAudio: blob,
          pendingVoice: state.pendingVoice
            ? { ...state.pendingVoice, audioBlob: blob }
            : state.pendingVoice,
        }));
      },

      setRecordedPhrase: (blob) => {
        set({ recordedPhrase: blob });
      },

      submitVerification: async () => {
        const { pendingVoice, referenceAudio, recordedPhrase, currentPhrase } = get();

        if (!pendingVoice || !referenceAudio || !recordedPhrase || !currentPhrase) {
          set({
            verificationStatus: 'error',
            verificationError: 'Reference audio and recorded phrase are required.',
          });
          return;
        }

        set({ verificationStatus: 'verifying', verificationError: null });

        try {
          const result = await verifyVoiceIdentity(
            referenceAudio,
            recordedPhrase,
            currentPhrase.phraseId,
          );

          if (result.match) {
            useVoiceStore.getState().addVoice(
              {
                ...pendingVoice.input,
                verificationStatus: 'verified',
                verifiedAt: Date.now(),
                verificationConfidence: result.confidence,
              },
              pendingVoice.audioBlob,
            );

            set({
              pendingVoice: null,
              referenceAudio: null,
              recordedPhrase: null,
              verificationStatus: 'verified',
              verificationError: null,
            });
          } else {
            set({
              verificationStatus: 'failed',
              verificationError: 'Voice samples did not match. Please ensure you are recording your own voice.',
            });
          }
        } catch (err) {
          set({
            verificationStatus: 'error',
            verificationError: err instanceof Error ? err.message : String(err),
          });
        }
      },

      skipVerification: () => {
        const { pendingVoice, selfHostedSkipEnabled } = get();
        if (!selfHostedSkipEnabled || !pendingVoice) return;

        useVoiceStore.getState().addVoice(
          {
            ...pendingVoice.input,
            verificationStatus: 'unverified',
            verifiedAt: null,
            verificationConfidence: null,
          },
          pendingVoice.audioBlob,
        );

        set({
          pendingVoice: null,
          currentPhrase: null,
          verificationStatus: 'idle',
          verificationError: null,
          recordedPhrase: null,
          referenceAudio: null,
        });
      },

      resetVerification: () => {
        set({
          currentPhrase: null,
          verificationStatus: 'idle',
          verificationError: null,
          recordedPhrase: null,
        });
      },

      cancelVerification: () => {
        set({
          pendingVoice: null,
          currentPhrase: null,
          verificationStatus: 'idle',
          verificationError: null,
          recordedPhrase: null,
          referenceAudio: null,
        });
      },

      setSelfHostedSkipEnabled: (enabled) => {
        set({ selfHostedSkipEnabled: enabled });
      },
    }),
    {
      name: 'ace-step-voice-verification',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        selfHostedSkipEnabled: state.selfHostedSkipEnabled,
      }),
    },
  ),
);
