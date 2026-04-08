/**
 * Maps voice influence UI values (0–100%) to backend API parameters.
 *
 * - audioInfluence → audio_cover_strength (0.0–1.0):
 *   Controls how much of the reference voice character is preserved.
 *   0% = pure AI voice, 100% = maximum voice fidelity.
 *
 * - styleInfluence → guidance_scale_factor (0.0–1.0):
 *   Controls how strongly the AI's trained style is applied.
 *   0% = neutral/minimal style, 100% = full AI style.
 *
 * ACE-Step 1.5 implements this via classifier-free guidance (CFG):
 * the voice reference acts as negative conditioning in the diffusion process.
 */
export interface VoiceInfluenceApiParams {
  /** Maps to CoverTaskParams.audio_cover_strength. null = no voice active. */
  audio_cover_strength: number | null;
  /** Multiplier for guidance_scale. null = no voice active. */
  guidance_scale_factor: number | null;
}

export function mapVoiceInfluenceToApiParams(
  audioInfluence: number | null,
  styleInfluence: number | null,
): VoiceInfluenceApiParams {
  if (audioInfluence === null || styleInfluence === null) {
    return { audio_cover_strength: null, guidance_scale_factor: null };
  }

  const clampedAudio = Math.max(0, Math.min(100, audioInfluence));
  const clampedStyle = Math.max(0, Math.min(100, styleInfluence));

  return {
    audio_cover_strength: Math.round(clampedAudio) / 100,
    guidance_scale_factor: Math.round(clampedStyle) / 100,
  };
}
