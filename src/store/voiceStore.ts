import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { get, set, del, keys } from 'idb-keyval';
import type { VoiceProfile } from '../types/voice';
import { DEFAULT_AUDIO_INFLUENCE, DEFAULT_STYLE_INFLUENCE } from '../types/voice';

/** Minimum voice sample duration in seconds (matches Suno v5.5 requirement). */
export const MIN_VOICE_SAMPLE_DURATION = 30;

/** Accepted audio MIME types for voice upload. */
export const ACCEPTED_VOICE_MIME_TYPES = [
  'audio/wav',
  'audio/x-wav',
  'audio/mpeg',
  'audio/mp3',
  'audio/flac',
  'audio/x-flac',
] as const;

/** Accepted file extensions for voice upload. */
export const ACCEPTED_VOICE_EXTENSIONS = ['.wav', '.mp3', '.flac'] as const;

// ─── IndexedDB helpers for voice audio blobs ────────────────────────────────

function voiceAudioKey(profileId: string): string {
  return `voice-audio:${profileId}`;
}

export async function saveVoiceAudioBlob(profileId: string, blob: Blob): Promise<string> {
  const key = voiceAudioKey(profileId);
  await set(key, blob);
  return key;
}

export async function loadVoiceAudioBlob(profileId: string): Promise<Blob | undefined> {
  return get<Blob>(voiceAudioKey(profileId));
}

export async function deleteVoiceAudioBlob(profileId: string): Promise<void> {
  await del(voiceAudioKey(profileId));
}

export async function deleteAllVoiceAudioBlobs(): Promise<void> {
  const allKeys = await keys();
  const voiceKeys = allKeys.filter(
    (k) => typeof k === 'string' && k.startsWith('voice-audio:'),
  );
  await Promise.all(voiceKeys.map((k) => del(k)));
}

// ─── Voice Store ─────────────────────────────────────────────────────────────

export interface VoiceStoreState {
  /** All voice profiles (metadata only; audio in IndexedDB). */
  profiles: VoiceProfile[];
  /** Currently recording voice profile (null when not recording). */
  recordingProfileId: string | null;
  /** Upload/processing in progress. */
  isProcessing: boolean;
  /** Error message from last operation. */
  error: string | null;

  // ── CRUD ──
  addProfile: (profile: VoiceProfile) => void;
  removeProfile: (profileId: string) => Promise<void>;
  updateProfile: (profileId: string, updates: Partial<Omit<VoiceProfile, 'id'>>) => void;
  getProfile: (profileId: string) => VoiceProfile | undefined;

  // ── Recording ──
  setRecordingProfileId: (id: string | null) => void;

  // ── Upload / Processing ──
  setIsProcessing: (v: boolean) => void;
  setError: (msg: string | null) => void;

  /**
   * Save a voice audio blob to IndexedDB and create a VoiceProfile.
   * Returns the created profile, or null on failure.
   */
  saveVoiceFromBlob: (params: {
    name: string;
    blob: Blob;
    duration: number;
  }) => Promise<VoiceProfile | null>;
}

export const useVoiceStore = create<VoiceStoreState>()(
  persist(
    (set, get) => ({
      profiles: [],
      recordingProfileId: null,
      isProcessing: false,
      error: null,

      addProfile: (profile) =>
        set((s) => ({ profiles: [...s.profiles, profile] })),

      removeProfile: async (profileId) => {
        await deleteVoiceAudioBlob(profileId);
        set((s) => ({
          profiles: s.profiles.filter((p) => p.id !== profileId),
          error: null,
        }));
      },

      updateProfile: (profileId, updates) =>
        set((s) => ({
          profiles: s.profiles.map((p) =>
            p.id === profileId ? { ...p, ...updates, updatedAt: Date.now() } : p,
          ),
        })),

      getProfile: (profileId) =>
        get().profiles.find((p) => p.id === profileId),

      setRecordingProfileId: (id) => set({ recordingProfileId: id }),
      setIsProcessing: (v) => set({ isProcessing: v }),
      setError: (msg) => set({ error: msg }),

      saveVoiceFromBlob: async ({ name, blob, duration }) => {
        if (duration < MIN_VOICE_SAMPLE_DURATION) {
          set({ error: `Voice sample must be at least ${MIN_VOICE_SAMPLE_DURATION} seconds (got ${Math.round(duration)}s).` });
          return null;
        }

        const profileId = crypto.randomUUID();
        try {
          set({ isProcessing: true, error: null });

          const audioKey = await saveVoiceAudioBlob(profileId, blob);

          const profile: VoiceProfile = {
            id: profileId,
            name: name.trim() || 'Untitled Voice',
            audioKey,
            duration,
            defaultAudioInfluence: DEFAULT_AUDIO_INFLUENCE,
            defaultStyleInfluence: DEFAULT_STYLE_INFLUENCE,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };

          set((s) => ({
            profiles: [...s.profiles, profile],
            isProcessing: false,
          }));
          return profile;
        } catch (err) {
          set({
            isProcessing: false,
            error: err instanceof Error ? err.message : 'Failed to save voice profile.',
          });
          return null;
        }
      },
    }),
    {
      name: 'ace-step-voice-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ profiles: state.profiles }) as unknown as VoiceStoreState,
    },
  ),
);
