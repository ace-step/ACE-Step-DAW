import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { VoiceProfile, VoiceProfileSource } from '../types/voiceProfile';
import { storeAudioBlob, deleteAudioBlobByKey } from '../services/audioFileManager';

export interface AddVoiceInput {
  name: string;
  audioBlob: Blob;
  duration: number;
  skillLevel: VoiceProfile['skillLevel'];
  language: string;
  tags: string[];
  source: VoiceProfileSource;
  originalAudioBlob?: Blob;
}

export type VoiceProfileUpdate = Partial<
  Pick<VoiceProfile, 'name' | 'skillLevel' | 'language' | 'tags' | 'audioInfluence' | 'styleInfluence'>
>;

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export interface VoiceStoreState {
  voices: VoiceProfile[];
  selectedVoiceId: string | null;
  searchQuery: string;
  isCreating: boolean;
  createError: string | null;
  previewingVoiceId: string | null;

  addVoice: (input: AddVoiceInput) => Promise<void>;
  removeVoice: (id: string) => Promise<void>;
  updateVoice: (id: string, updates: VoiceProfileUpdate) => void;
  selectVoice: (id: string) => void;
  deselectVoice: () => void;
  setSearchQuery: (query: string) => void;
  setPreviewingVoiceId: (id: string | null) => void;
  getFilteredVoices: () => VoiceProfile[];
  getVoiceById: (id: string) => VoiceProfile | undefined;
}

export const useVoiceStore = create<VoiceStoreState>()(
  persist(
    (set, get) => ({
      voices: [],
      selectedVoiceId: null,
      searchQuery: '',
      isCreating: false,
      createError: null,
      previewingVoiceId: null,

      addVoice: async (input) => {
        set({ isCreating: true, createError: null });
        try {
          const audioKey = await storeAudioBlob(input.audioBlob);
          let originalAudioKey: string | undefined;
          if (input.originalAudioBlob) {
            originalAudioKey = await storeAudioBlob(input.originalAudioBlob);
          }
          const now = Date.now();
          const id = `voice_${now}_${Math.random().toString(36).slice(2, 8)}`;
          const profile: VoiceProfile = {
            id,
            name: input.name,
            createdAt: now,
            updatedAt: now,
            audioKey,
            originalAudioKey,
            duration: input.duration,
            skillLevel: input.skillLevel,
            language: input.language,
            tags: input.tags,
            audioInfluence: 0.5,
            styleInfluence: 0.5,
          };
          set((s) => ({ voices: [...s.voices, profile], isCreating: false }));
        } catch (err) {
          set({
            isCreating: false,
            createError: err instanceof Error ? err.message : String(err),
          });
        }
      },

      removeVoice: async (id) => {
        const voice = get().voices.find((v) => v.id === id);
        if (!voice) return;
        await deleteAudioBlobByKey(voice.audioKey);
        if (voice.originalAudioKey) {
          await deleteAudioBlobByKey(voice.originalAudioKey);
        }
        set((s) => ({
          voices: s.voices.filter((v) => v.id !== id),
          selectedVoiceId: s.selectedVoiceId === id ? null : s.selectedVoiceId,
          previewingVoiceId: s.previewingVoiceId === id ? null : s.previewingVoiceId,
        }));
      },

      updateVoice: (id, updates) => {
        set((s) => ({
          voices: s.voices.map((v) => {
            if (v.id !== id) return v;
            const patched = { ...v, updatedAt: Date.now() };
            if (updates.name !== undefined) patched.name = updates.name;
            if (updates.skillLevel !== undefined) patched.skillLevel = updates.skillLevel;
            if (updates.language !== undefined) patched.language = updates.language;
            if (updates.tags !== undefined) patched.tags = updates.tags;
            if (updates.audioInfluence !== undefined) patched.audioInfluence = clamp01(updates.audioInfluence);
            if (updates.styleInfluence !== undefined) patched.styleInfluence = clamp01(updates.styleInfluence);
            return patched;
          }),
        }));
      },

      selectVoice: (id) => set({ selectedVoiceId: id }),
      deselectVoice: () => set({ selectedVoiceId: null }),
      setSearchQuery: (query) => set({ searchQuery: query }),
      setPreviewingVoiceId: (id) => set({ previewingVoiceId: id }),

      getFilteredVoices: () => {
        const { voices, searchQuery } = get();
        if (!searchQuery.trim()) return voices;
        const q = searchQuery.toLowerCase();
        return voices.filter(
          (v) =>
            v.name.toLowerCase().includes(q) ||
            v.tags.some((t) => t.toLowerCase().includes(q)) ||
            v.language.toLowerCase().includes(q),
        );
      },

      getVoiceById: (id) => get().voices.find((v) => v.id === id),
    }),
    {
      name: 'ace-step-voice-store',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        voices: state.voices,
        selectedVoiceId: state.selectedVoiceId,
      }),
    },
  ),
);
