/** Voice profile for AI-conditioned vocal generation. */
export interface VoiceProfile {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** IndexedDB key for the isolated vocal audio blob. */
  audioKey: string;
  /** IndexedDB key for the original (pre-separation) audio, if applicable. */
  originalAudioKey?: string;
  /** Duration of the reference audio in seconds. */
  duration: number;
  /** Vocal skill level tag. */
  skillLevel: 'beginner' | 'intermediate' | 'advanced' | 'professional';
  /** Primary language of the vocalist. */
  language: string;
  /** User-assigned tags for filtering. */
  tags: string[];
  /** Default audio influence strength (0.0–1.0). */
  audioInfluence: number;
  /** Default style influence strength (0.0–1.0). */
  styleInfluence: number;
}

/** Source type when creating a voice profile. */
export type VoiceProfileSource = 'recording' | 'upload' | 'clipImport';
