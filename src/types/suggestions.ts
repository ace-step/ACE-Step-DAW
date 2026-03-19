/** Inline AI suggestion shown on the timeline. */
export interface InlineSuggestion {
  id: string;
  /** Human-readable suggestion text. */
  text: string;
  /** Timeline position in seconds where the suggestion applies. */
  time: number;
  /** Track this suggestion applies to (optional — omit for global arrangement suggestions). */
  trackId?: string;
  /** Category of suggestion. */
  type: 'fill' | 'arrangement' | 'variation' | 'next';
}
