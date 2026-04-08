/** Voice profile for voice-conditioned AI generation. */
export interface VoiceProfile {
  id: string;
  /** Display name chosen by user. */
  name: string;
  /** IndexedDB audio key for the stored voice sample. */
  audioKey: string;
  /** Duration of the voice sample in seconds. */
  duration: number;
  /** Default Audio Influence (0–100) for this voice. */
  defaultAudioInfluence: number;
  /** Default Style Influence (0–100) for this voice. */
  defaultStyleInfluence: number;
  createdAt: number;
  updatedAt: number;
}

/** Named preset for Audio/Style Influence slider combinations. */
export interface VoiceInfluencePreset {
  /** Machine-readable key. */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Audio Influence value (0–100). */
  audioInfluence: number;
  /** Style Influence value (0–100). */
  styleInfluence: number;
}

/** Built-in influence presets inspired by Suno v5.5 sweet-spots. */
export const VOICE_INFLUENCE_PRESETS: readonly VoiceInfluencePreset[] = [
  { id: 'natural', label: 'Natural', audioInfluence: 40, styleInfluence: 60 },
  { id: 'ai-enhanced', label: 'AI Enhanced', audioInfluence: 20, styleInfluence: 80 },
  { id: 'voice-forward', label: 'Voice Forward', audioInfluence: 70, styleInfluence: 30 },
] as const;

/** Default influence values when no voice-specific defaults are set. */
export const DEFAULT_AUDIO_INFLUENCE = 40;
export const DEFAULT_STYLE_INFLUENCE = 60;

export function clampInfluence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
