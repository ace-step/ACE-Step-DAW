/** Arrangement analysis types for the AI Arrangement Assistant. */

/** Detected musical section in the arrangement. */
export type SectionType =
  | 'intro'
  | 'verse'
  | 'pre-chorus'
  | 'chorus'
  | 'bridge'
  | 'outro'
  | 'drop'
  | 'breakdown'
  | 'solo'
  | 'interlude'
  | 'hook'
  | 'build'
  | 'tag'
  | 'unknown';

/** A detected section within the arrangement timeline. */
export interface ArrangementSection {
  id: string;
  /** Section type label. */
  type: SectionType;
  /** Start time in seconds. */
  startTime: number;
  /** End time in seconds. */
  endTime: number;
  /** Track IDs that have clips in this section. */
  trackIds: string[];
  /** Confidence score (0–1) for the section classification. */
  confidence: number;
}

/** A suggestion from the arrangement assistant. */
export type SuggestionKind =
  | 'next-section'
  | 'instrumentation'
  | 'chord-progression'
  | 'fill-gap';

export interface ArrangementSuggestion {
  id: string;
  kind: SuggestionKind;
  /** Human-readable title for the suggestion. */
  title: string;
  /** Detailed description. */
  description: string;
  /** Timeline position (seconds) where this suggestion applies. */
  time: number;
  /** Duration of the suggested content in seconds. */
  duration: number;
  /** Which track(s) this suggestion applies to (empty = global). */
  trackIds: string[];
  /** Prompt to use for generation if the suggestion is accepted. */
  prompt?: string;
  /** Suggested lyrics if applicable. */
  lyrics?: string;
  /** Suggested tags for generation. */
  tags?: string[];
  /** Section type for next-section suggestions. */
  sectionType?: SectionType;
  /** Status of the suggestion. */
  status: 'pending' | 'accepted' | 'rejected';
}

/** Analysis result containing all sections and suggestions. */
export interface ArrangementAnalysis {
  sections: ArrangementSection[];
  suggestions: ArrangementSuggestion[];
  /** Project-level metadata used for analysis. */
  projectMeta: {
    bpm: number;
    keyScale: string;
    /** Time signature numerator. */
    timeSignature: number;
    /** Time signature denominator. Defaults to 4 when not provided by the source project. */
    timeSignatureDenominator: number;
    totalDuration: number;
  };
}
