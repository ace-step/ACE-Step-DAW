/** Skill level classification for voice profiles. */
export type VoiceSkillLevel = 'beginner' | 'intermediate' | 'advanced' | 'professional';

/** Source of the voice profile audio. */
export type VoiceSource = 'upload' | 'recording' | 'clip';

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
}
