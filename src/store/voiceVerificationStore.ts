import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { VoiceProfile } from '../types/api';
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

export interface VoiceVerificationStore {
  profiles: VoiceProfile[];
  currentPhrase: CurrentPhrase | null;
  verificationStatus: VerificationFlowStatus;
  verificationError: string | null;
  recordedPhrase: Blob | null;
  referenceAudio: Blob | null;
  selfHostedSkipEnabled: boolean;

  // Phrase management
  fetchVerificationPhrase: (language?: string) => Promise<void>;

  // Audio capture
  setReferenceAudio: (blob: Blob) => void;
  setRecordedPhrase: (blob: Blob) => void;

  // Verification
  submitVerification: (profileName: string) => Promise<void>;
  skipVerification: (profileName: string) => void;
  resetVerification: () => void;

  // Profile management
  deleteProfile: (profileId: string) => void;
  setSelfHostedSkipEnabled: (enabled: boolean) => void;
}

function generateProfileId(): string {
  return `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useVoiceVerificationStore = create<VoiceVerificationStore>()(
  persist(
    (set, get) => ({
      profiles: [],
      currentPhrase: null,
      verificationStatus: 'idle',
      verificationError: null,
      recordedPhrase: null,
      referenceAudio: null,
      selfHostedSkipEnabled: false,

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

      setReferenceAudio: (blob: Blob) => {
        set({ referenceAudio: blob });
      },

      setRecordedPhrase: (blob: Blob) => {
        set({ recordedPhrase: blob });
      },

      submitVerification: async (profileName: string) => {
        const { referenceAudio, recordedPhrase, currentPhrase } = get();

        if (!referenceAudio || !recordedPhrase || !currentPhrase) {
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
            const profile: VoiceProfile = {
              id: generateProfileId(),
              name: profileName,
              createdAt: Date.now(),
              referenceAudioKey: null,
              verificationStatus: 'verified',
              verifiedAt: Date.now(),
              verificationConfidence: result.confidence,
            };

            set((s) => ({
              profiles: [...s.profiles, profile],
              verificationStatus: 'verified',
              verificationError: null,
            }));
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

      skipVerification: (profileName: string) => {
        if (!get().selfHostedSkipEnabled) return;

        const profile: VoiceProfile = {
          id: generateProfileId(),
          name: profileName,
          createdAt: Date.now(),
          referenceAudioKey: null,
          verificationStatus: 'unverified',
          verifiedAt: null,
          verificationConfidence: null,
        };

        set((s) => ({
          profiles: [...s.profiles, profile],
          verificationStatus: 'idle',
        }));
      },

      resetVerification: () => {
        set({
          currentPhrase: null,
          verificationStatus: 'idle',
          verificationError: null,
          recordedPhrase: null,
          referenceAudio: null,
        });
      },

      deleteProfile: (profileId: string) => {
        set((s) => ({
          profiles: s.profiles.filter((p) => p.id !== profileId),
        }));
      },

      setSelfHostedSkipEnabled: (enabled: boolean) => {
        set({ selfHostedSkipEnabled: enabled });
      },
    }),
    {
      name: 'ace-step-voice-verification',
      storage: createJSONStorage(() => localStorage),
      // Only persist profiles and settings — verification flow state is transient.
      // Blobs (referenceAudio, recordedPhrase) cannot be serialized to localStorage.
      partialize: (state) => ({
        profiles: state.profiles,
        selfHostedSkipEnabled: state.selfHostedSkipEnabled,
      }),
    },
  ),
);
