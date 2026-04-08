import { beforeEach, describe, expect, it } from 'vitest';
import { useGenerationStore } from '../../src/store/generationStore';
import type { VoiceProfile } from '../../src/types/voice';
import {
  clampInfluence,
  DEFAULT_AUDIO_INFLUENCE,
  DEFAULT_STYLE_INFLUENCE,
  VOICE_INFLUENCE_PRESETS,
} from '../../src/types/voice';

function makeVoiceProfile(overrides: Partial<VoiceProfile> = {}): VoiceProfile {
  return {
    id: `voice-${Math.random().toString(36).slice(2)}`,
    name: 'Test Voice',
    audioKey: 'test-audio-key',
    duration: 45,
    defaultAudioInfluence: 40,
    defaultStyleInfluence: 60,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('voice influence', () => {
  beforeEach(() => {
    localStorage.clear();
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
  });

  describe('clampInfluence', () => {
    it('clamps to 0–100 range', () => {
      expect(clampInfluence(-10)).toBe(0);
      expect(clampInfluence(0)).toBe(0);
      expect(clampInfluence(50)).toBe(50);
      expect(clampInfluence(100)).toBe(100);
      expect(clampInfluence(150)).toBe(100);
    });

    it('rounds to nearest integer', () => {
      expect(clampInfluence(40.7)).toBe(41);
      expect(clampInfluence(40.3)).toBe(40);
    });
  });

  describe('default state', () => {
    it('has correct default influence values', () => {
      const form = useGenerationStore.getState().generationForm;
      expect(form.selectedVoiceProfileId).toBeNull();
      expect(form.audioInfluence).toBe(DEFAULT_AUDIO_INFLUENCE);
      expect(form.styleInfluence).toBe(DEFAULT_STYLE_INFLUENCE);
    });

    it('starts with empty voice profiles', () => {
      expect(useGenerationStore.getState().voiceProfiles).toEqual([]);
    });
  });

  describe('voice profile CRUD', () => {
    it('adds a voice profile', () => {
      const profile = makeVoiceProfile({ id: 'v1', name: 'Singer A' });
      useGenerationStore.getState().addVoiceProfile(profile);
      expect(useGenerationStore.getState().voiceProfiles).toHaveLength(1);
      expect(useGenerationStore.getState().voiceProfiles[0].name).toBe('Singer A');
    });

    it('removes a voice profile', () => {
      const profile = makeVoiceProfile({ id: 'v1' });
      useGenerationStore.getState().addVoiceProfile(profile);
      useGenerationStore.getState().removeVoiceProfile('v1');
      expect(useGenerationStore.getState().voiceProfiles).toHaveLength(0);
    });

    it('clears selection when removing the selected voice profile', () => {
      const profile = makeVoiceProfile({ id: 'v1' });
      useGenerationStore.getState().addVoiceProfile(profile);
      useGenerationStore.getState().setSelectedVoiceProfile('v1');
      expect(useGenerationStore.getState().generationForm.selectedVoiceProfileId).toBe('v1');

      useGenerationStore.getState().removeVoiceProfile('v1');
      expect(useGenerationStore.getState().generationForm.selectedVoiceProfileId).toBeNull();
      expect(useGenerationStore.getState().generationForm.audioInfluence).toBe(DEFAULT_AUDIO_INFLUENCE);
      expect(useGenerationStore.getState().generationForm.styleInfluence).toBe(DEFAULT_STYLE_INFLUENCE);
    });

    it('does not clear selection when removing a different voice profile', () => {
      const p1 = makeVoiceProfile({ id: 'v1' });
      const p2 = makeVoiceProfile({ id: 'v2' });
      useGenerationStore.getState().addVoiceProfile(p1);
      useGenerationStore.getState().addVoiceProfile(p2);
      useGenerationStore.getState().setSelectedVoiceProfile('v1');

      useGenerationStore.getState().removeVoiceProfile('v2');
      expect(useGenerationStore.getState().generationForm.selectedVoiceProfileId).toBe('v1');
    });

    it('updates a voice profile', () => {
      const profile = makeVoiceProfile({ id: 'v1', name: 'Old Name' });
      useGenerationStore.getState().addVoiceProfile(profile);
      useGenerationStore.getState().updateVoiceProfile('v1', { name: 'New Name' });
      expect(useGenerationStore.getState().voiceProfiles[0].name).toBe('New Name');
    });
  });

  describe('voice selection and influence loading', () => {
    it('loads per-voice defaults when selecting a voice profile', () => {
      const profile = makeVoiceProfile({
        id: 'v1',
        defaultAudioInfluence: 70,
        defaultStyleInfluence: 30,
      });
      useGenerationStore.getState().addVoiceProfile(profile);
      useGenerationStore.getState().setSelectedVoiceProfile('v1');

      const form = useGenerationStore.getState().generationForm;
      expect(form.selectedVoiceProfileId).toBe('v1');
      expect(form.audioInfluence).toBe(70);
      expect(form.styleInfluence).toBe(30);
    });

    it('resets to defaults when deselecting voice', () => {
      const profile = makeVoiceProfile({
        id: 'v1',
        defaultAudioInfluence: 70,
        defaultStyleInfluence: 30,
      });
      useGenerationStore.getState().addVoiceProfile(profile);
      useGenerationStore.getState().setSelectedVoiceProfile('v1');
      useGenerationStore.getState().setSelectedVoiceProfile(null);

      const form = useGenerationStore.getState().generationForm;
      expect(form.selectedVoiceProfileId).toBeNull();
      expect(form.audioInfluence).toBe(DEFAULT_AUDIO_INFLUENCE);
      expect(form.styleInfluence).toBe(DEFAULT_STYLE_INFLUENCE);
    });
  });

  describe('influence setters', () => {
    it('sets audio influence with clamping', () => {
      useGenerationStore.getState().setAudioInfluence(75);
      expect(useGenerationStore.getState().generationForm.audioInfluence).toBe(75);

      useGenerationStore.getState().setAudioInfluence(-5);
      expect(useGenerationStore.getState().generationForm.audioInfluence).toBe(0);

      useGenerationStore.getState().setAudioInfluence(200);
      expect(useGenerationStore.getState().generationForm.audioInfluence).toBe(100);
    });

    it('sets style influence with clamping', () => {
      useGenerationStore.getState().setStyleInfluence(85);
      expect(useGenerationStore.getState().generationForm.styleInfluence).toBe(85);

      useGenerationStore.getState().setStyleInfluence(-10);
      expect(useGenerationStore.getState().generationForm.styleInfluence).toBe(0);
    });

    it('clears request error when setting influence', () => {
      useGenerationStore.getState().setGenerationRequestError('some error');
      useGenerationStore.getState().setAudioInfluence(50);
      expect(useGenerationStore.getState().generationForm.requestError).toBeNull();
    });
  });

  describe('influence presets', () => {
    it('applies preset values', () => {
      useGenerationStore.getState().applyVoiceInfluencePreset(20, 80);
      const form = useGenerationStore.getState().generationForm;
      expect(form.audioInfluence).toBe(20);
      expect(form.styleInfluence).toBe(80);
    });

    it('clamps preset values', () => {
      useGenerationStore.getState().applyVoiceInfluencePreset(-10, 150);
      const form = useGenerationStore.getState().generationForm;
      expect(form.audioInfluence).toBe(0);
      expect(form.styleInfluence).toBe(100);
    });

    it('has three built-in presets with valid ranges', () => {
      expect(VOICE_INFLUENCE_PRESETS).toHaveLength(3);
      for (const preset of VOICE_INFLUENCE_PRESETS) {
        expect(preset.audioInfluence).toBeGreaterThanOrEqual(0);
        expect(preset.audioInfluence).toBeLessThanOrEqual(100);
        expect(preset.styleInfluence).toBeGreaterThanOrEqual(0);
        expect(preset.styleInfluence).toBeLessThanOrEqual(100);
        expect(preset.label).toBeTruthy();
        expect(preset.id).toBeTruthy();
      }
    });
  });

  describe('form reset', () => {
    it('resets influence values when form is reset', () => {
      useGenerationStore.getState().setAudioInfluence(90);
      useGenerationStore.getState().setStyleInfluence(10);
      useGenerationStore.getState().resetGenerationForm();

      const form = useGenerationStore.getState().generationForm;
      expect(form.audioInfluence).toBe(DEFAULT_AUDIO_INFLUENCE);
      expect(form.styleInfluence).toBe(DEFAULT_STYLE_INFLUENCE);
      expect(form.selectedVoiceProfileId).toBeNull();
    });
  });

  describe('hydration', () => {
    it('hydrates influence values', () => {
      useGenerationStore.getState().hydrateGenerationForm({
        audioInfluence: 55,
        styleInfluence: 45,
        selectedVoiceProfileId: 'some-id',
      });
      const form = useGenerationStore.getState().generationForm;
      expect(form.audioInfluence).toBe(55);
      expect(form.styleInfluence).toBe(45);
      expect(form.selectedVoiceProfileId).toBe('some-id');
    });
  });
});
