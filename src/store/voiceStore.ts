/**
 * Voice Store — Zustand state for voice cloning feature (#1087)
 *
 * Manages voice profiles in memory with IndexedDB persistence via voiceProfileService.
 */

import { create } from 'zustand';
import { v4 as uuidv4 } from 'uuid';
import type { VoiceProfile } from '../types/voice';
import * as svc from '../services/voiceProfileService';
import { computeWaveformPeaks } from '../utils/waveformPeaks';

const VOICE_WAVEFORM_PEAKS = 64;

export interface VoiceStoreState {
  profiles: VoiceProfile[];
  selectedProfileId: string | null;
  /** Audio influence: how much to preserve reference voice (0-1) */
  audioInfluence: number;
  /** Style influence: how much AI style to apply (0-1) */
  styleInfluence: number;
  loading: boolean;
  recording: boolean;
  error: string | null;
}

export interface VoiceStoreActions {
  /** Load all profiles from IndexedDB */
  loadProfiles: () => Promise<void>;

  /** Add a voice profile from an uploaded or recorded audio blob */
  addProfile: (
    name: string,
    source: 'recording' | 'upload',
    audioBlob: Blob,
    durationSec: number,
  ) => Promise<VoiceProfile>;

  /** Delete a voice profile */
  removeProfile: (id: string) => Promise<void>;

  /** Rename a voice profile */
  renameProfile: (id: string, newName: string) => Promise<void>;

  /** Select a voice profile for generation */
  selectProfile: (id: string | null) => void;

  /** Set recording state */
  setRecording: (recording: boolean) => void;

  /** Set audio influence */
  setAudioInfluence: (value: number) => void;

  /** Set style influence */
  setStyleInfluence: (value: number) => void;

  /** Apply an influence preset */
  applyInfluencePreset: (audioInfluence: number, styleInfluence: number) => void;

  /** Clear error */
  clearError: () => void;
}

export type VoiceStore = VoiceStoreState & VoiceStoreActions;

export const useVoiceStore = create<VoiceStore>()((set, get) => ({
  profiles: [],
  selectedProfileId: null,
  audioInfluence: 0.4,
  styleInfluence: 0.6,
  loading: false,
  recording: false,
  error: null,

  loadProfiles: async () => {
    set({ loading: true, error: null });
    try {
      const profiles = await svc.listVoiceProfiles();
      set({ profiles, loading: false });
    } catch (e) {
      set({
        loading: false,
        error: e instanceof Error ? e.message : 'Failed to load voice profiles',
      });
    }
  },

  addProfile: async (name, source, audioBlob, durationSec) => {
    const id = uuidv4();
    let peaks: number[] = [];
    try {
      const ctx = new OfflineAudioContext(1, 1, 44100);
      const arrayBuf = await audioBlob.arrayBuffer();
      const audioBuf = await ctx.decodeAudioData(arrayBuf);
      peaks = computeWaveformPeaks(audioBuf, VOICE_WAVEFORM_PEAKS);
    } catch {
      // Waveform computation is best-effort
      peaks = Array.from({ length: VOICE_WAVEFORM_PEAKS }, () => 0);
    }

    const now = Date.now();
    const profile: VoiceProfile = {
      id,
      name: name.trim(),
      source,
      mimeType: audioBlob.type || 'audio/wav',
      duration: durationSec,
      fileSize: audioBlob.size,
      waveformPeaks: peaks,
      defaultAudioInfluence: 0.4,
      defaultStyleInfluence: 0.6,
      createdAt: now,
      updatedAt: now,
    };

    await svc.saveVoiceProfile(profile, audioBlob);
    set((s) => ({ profiles: [profile, ...s.profiles], error: null }));
    return profile;
  },

  removeProfile: async (id) => {
    await svc.deleteVoiceProfile(id);
    set((s) => ({
      profiles: s.profiles.filter((p) => p.id !== id),
      selectedProfileId: s.selectedProfileId === id ? null : s.selectedProfileId,
    }));
  },

  renameProfile: async (id, newName) => {
    const updated = await svc.updateVoiceProfileName(id, newName);
    set((s) => ({
      profiles: s.profiles.map((p) => (p.id === id ? updated : p)),
    }));
  },

  selectProfile: (id) => {
    if (id) {
      const profile = get().profiles.find((p) => p.id === id);
      if (profile) {
        set({
          selectedProfileId: id,
          audioInfluence: profile.defaultAudioInfluence,
          styleInfluence: profile.defaultStyleInfluence,
        });
        return;
      }
    }
    set({ selectedProfileId: id });
  },

  setAudioInfluence: (value) => set({ audioInfluence: Math.max(0, Math.min(1, value)) }),
  setStyleInfluence: (value) => set({ styleInfluence: Math.max(0, Math.min(1, value)) }),
  applyInfluencePreset: (audioInfluence, styleInfluence) => set({ audioInfluence, styleInfluence }),

  setRecording: (recording) => set({ recording }),

  clearError: () => set({ error: null }),
}));
