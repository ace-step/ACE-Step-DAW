import { describe, it, expect } from 'vitest';
import { mapVoiceInfluenceToApiParams } from '../voiceInfluenceMapping';

describe('mapVoiceInfluenceToApiParams', () => {
  it('maps audioInfluence 0–100 to audio_cover_strength 0.0–1.0', () => {
    expect(mapVoiceInfluenceToApiParams(0, 50).audio_cover_strength).toBe(0);
    expect(mapVoiceInfluenceToApiParams(50, 50).audio_cover_strength).toBe(0.5);
    expect(mapVoiceInfluenceToApiParams(100, 50).audio_cover_strength).toBe(1);
  });

  it('maps styleInfluence 0–100 to guidance_scale_factor 0.0–1.0', () => {
    expect(mapVoiceInfluenceToApiParams(50, 0).guidance_scale_factor).toBe(0);
    expect(mapVoiceInfluenceToApiParams(50, 50).guidance_scale_factor).toBe(0.5);
    expect(mapVoiceInfluenceToApiParams(50, 100).guidance_scale_factor).toBe(1);
  });

  it('clamps out-of-range values', () => {
    const result = mapVoiceInfluenceToApiParams(-10, 150);
    expect(result.audio_cover_strength).toBe(0);
    expect(result.guidance_scale_factor).toBe(1);
  });

  it('returns null values when no voice is active', () => {
    const result = mapVoiceInfluenceToApiParams(null, null);
    expect(result.audio_cover_strength).toBeNull();
    expect(result.guidance_scale_factor).toBeNull();
  });
});
