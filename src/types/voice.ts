/** Skill level classification for voice profiles. */
export type VoiceSkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'professional';

/** Source of the voice profile audio. */
export type VoiceSource = 'upload' | 'recording' | 'clip';

/** Consent/identity verification status for a voice profile. */
export type VoiceVerificationStatus = 'unverified' | 'pending' | 'verified' | 'failed';

/** A voice profile for AI-conditioned generation. */
export interface VoiceProfile {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** IDB key pointing to the stored audio blob. */
  audioKey: string;
  /** IDB key pointing to the original unprocessed audio (before any normalization). */
  originalAudioKey?: string;
  /** Duration of the voice sample in seconds. */
  durationSeconds: number;
  /** Vocal skill level of the sample. */
  skillLevel: VoiceSkillLevel;
  /** Primary language of the voice. */
  language?: string;
  /** User-defined tags for filtering/organization. */
  tags: string[];
  /** Default audio influence strength (0–100). */
  defaultAudioInfluence: number;
  /** Default style influence strength (0–100). */
  defaultStyleInfluence: number;
  /** How the voice was captured. */
  source: VoiceSource;
  /** Precomputed single-channel waveform peaks for thumbnail display. */
  waveformPeaks?: number[];
  /** Whether the user has verified ownership of this voice sample. */
  verificationStatus?: VoiceVerificationStatus;
  /** When verification was completed. */
  verifiedAt?: number | null;
  /** Backend comparison confidence (0-1). */
  verificationConfidence?: number | null;
}

/** Named preset for Audio/Style Influence slider combinations. */
export interface VoiceInfluencePreset {
  /** Machine-readable key. */
  id: string;
  /** Human-readable label. */
  label: string;
  /** Audio Influence value (0-100). */
  audioInfluence: number;
  /** Style Influence value (0-100). */
  styleInfluence: number;
}

/** Built-in influence presets for voice-conditioned generation. */
export const VOICE_INFLUENCE_PRESETS: readonly VoiceInfluencePreset[] = [
  { id: 'natural', label: 'Natural', audioInfluence: 40, styleInfluence: 60 },
  { id: 'ai-enhanced', label: 'AI Enhanced', audioInfluence: 20, styleInfluence: 80 },
  { id: 'voice-forward', label: 'Voice Forward', audioInfluence: 70, styleInfluence: 30 },
] as const;

/** Default influence values for new voice profiles. */
export const DEFAULT_AUDIO_INFLUENCE = 50;
export const DEFAULT_STYLE_INFLUENCE = 50;

export function clampInfluence(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}
