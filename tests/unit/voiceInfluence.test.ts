import { describe, expect, it } from 'vitest';
import {
  clampInfluence,
  DEFAULT_AUDIO_INFLUENCE,
  DEFAULT_STYLE_INFLUENCE,
  VOICE_INFLUENCE_PRESETS,
} from '../../src/types/voice';

describe('voice influence helpers', () => {
  describe('clampInfluence', () => {
    it('clamps to the 0-100 range', () => {
      expect(clampInfluence(-10)).toBe(0);
      expect(clampInfluence(0)).toBe(0);
      expect(clampInfluence(50)).toBe(50);
      expect(clampInfluence(100)).toBe(100);
      expect(clampInfluence(150)).toBe(100);
    });

    it('rounds to the nearest integer', () => {
      expect(clampInfluence(40.7)).toBe(41);
      expect(clampInfluence(40.3)).toBe(40);
    });
  });

  it('keeps default influence values aligned with new voice profiles', () => {
    expect(DEFAULT_AUDIO_INFLUENCE).toBe(50);
    expect(DEFAULT_STYLE_INFLUENCE).toBe(50);
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
