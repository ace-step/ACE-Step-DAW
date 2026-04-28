import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval';
import {
  DEFAULT_AUDIO_INFLUENCE,
  DEFAULT_STYLE_INFLUENCE,
  type VoiceProfile,
  type VoiceSkillLevel,
  type VoiceSource,
  type VoiceVerificationStatus,
} from '../types/voice';

export interface AddVoiceInput {
  name: string;
  durationSeconds: number;
  skillLevel: VoiceSkillLevel;
  source: VoiceSource;
  tags: string[];
  language?: string;
  waveformPeaks?: number[];
  verificationStatus?: VoiceVerificationStatus;
  verifiedAt?: number | null;
  verificationConfidence?: number | null;
}

interface VoiceState {
  voices: VoiceProfile[];
  selectedVoiceId: string | null;
  searchQuery: string;
  filterTag: string | null;

  addVoice: (input: AddVoiceInput, audioBlob: Blob) => string;
  updateVoice: (id: string, updates: Partial<Pick<VoiceProfile, 'name' | 'skillLevel' | 'tags' | 'language' | 'defaultAudioInfluence' | 'defaultStyleInfluence'>>) => void;
  deleteVoice: (id: string) => Promise<void>;
  selectVoice: (id: string) => void;
  deselectVoice: () => void;
  setSearchQuery: (query: string) => void;
  setFilterTag: (tag: string | null) => void;
  getFilteredVoices: () => VoiceProfile[];
  getAllTags: () => string[];
  getVoiceById: (id: string) => VoiceProfile | undefined;
  loadAudioBlob: (voiceId: string) => Promise<Blob | undefined>;
  setWaveformPeaks: (voiceId: string, peaks: number[]) => void;
}

function generateId(): string {
  return `voice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useVoiceStore = create<VoiceState>()(
  persist(
    (set, get) => ({
      voices: [],
      selectedVoiceId: null,
      searchQuery: '',
      filterTag: null,

      addVoice: (input: AddVoiceInput, audioBlob: Blob) => {
        const id = generateId();
        const audioKey = `voice-audio:${id}`;
        const now = Date.now();
        const profile: VoiceProfile = {
          id,
          name: input.name,
          createdAt: now,
          updatedAt: now,
          audioKey,
          durationSeconds: input.durationSeconds,
          skillLevel: input.skillLevel,
          tags: input.tags,
          language: input.language,
          defaultAudioInfluence: DEFAULT_AUDIO_INFLUENCE,
          defaultStyleInfluence: DEFAULT_STYLE_INFLUENCE,
          source: input.source,
          waveformPeaks: input.waveformPeaks,
          verificationStatus: input.verificationStatus ?? 'unverified',
          verifiedAt: input.verifiedAt ?? null,
          verificationConfidence: input.verificationConfidence ?? null,
        };

        set((state) => ({ voices: [...state.voices, profile] }));

        // Persist audio blob asynchronously and remove the profile if storage fails.
        void idbSet(audioKey, audioBlob).catch(() => {
          // Remove the profile and clear selection if audio storage fails (e.g. quota exceeded)
          set((state) => ({
            voices: state.voices.filter((v) => v.id !== id),
            selectedVoiceId: state.selectedVoiceId === id ? null : state.selectedVoiceId,
          }));
        });

        return id;
      },

      updateVoice: (id: string, updates) => {
        set((state) => ({
          voices: state.voices.map((v) =>
            v.id === id ? { ...v, ...updates, updatedAt: Date.now() } : v,
          ),
        }));
      },

      deleteVoice: async (id: string) => {
        const voice = get().voices.find((v) => v.id === id);
        if (voice) {
          try {
            await idbDel(voice.audioKey);
            if (voice.originalAudioKey) {
              await idbDel(voice.originalAudioKey);
            }
          } catch {
            // IDB deletion failed — still remove from state to keep UI consistent
          }
        }
        set((state) => ({
          voices: state.voices.filter((v) => v.id !== id),
          selectedVoiceId: state.selectedVoiceId === id ? null : state.selectedVoiceId,
        }));
      },

      selectVoice: (id: string) => {
        set(() => ({ selectedVoiceId: id }));
      },

      deselectVoice: () => {
        set(() => ({ selectedVoiceId: null }));
      },

      setSearchQuery: (query: string) => {
        set(() => ({ searchQuery: query }));
      },

      setFilterTag: (tag: string | null) => {
        set(() => ({ filterTag: tag }));
      },

      getFilteredVoices: () => {
        const { voices, searchQuery, filterTag } = get();
        let filtered = voices;
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          filtered = filtered.filter(
            (v) =>
              v.name.toLowerCase().includes(q) ||
              v.tags.some((t) => t.toLowerCase().includes(q)),
          );
        }
        if (filterTag) {
          filtered = filtered.filter((v) => v.tags.includes(filterTag));
        }
        return filtered;
      },

      getAllTags: () => {
        const tags = new Set<string>();
        for (const v of get().voices) {
          for (const t of v.tags) tags.add(t);
        }
        return [...tags].sort();
      },

      getVoiceById: (id: string) => {
        return get().voices.find((v) => v.id === id);
      },

      loadAudioBlob: async (voiceId: string) => {
        const voice = get().voices.find((v) => v.id === voiceId);
        if (!voice) return undefined;
        return idbGet<Blob>(voice.audioKey);
      },

      setWaveformPeaks: (voiceId: string, peaks: number[]) => {
        set((state) => ({
          voices: state.voices.map((v) =>
            v.id === voiceId ? { ...v, waveformPeaks: peaks, updatedAt: Date.now() } : v,
          ),
        }));
      },
    }),
    {
      name: 'ace-step-daw-voices',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        voices: state.voices,
        selectedVoiceId: state.selectedVoiceId,
      }),
    },
  ),
);
