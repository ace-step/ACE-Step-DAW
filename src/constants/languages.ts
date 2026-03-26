/**
 * Vocal language options for music generation.
 *
 * Values must be a subset of the server's VALID_LANGUAGES
 * (acestep/constants.py). The server uses "unknown" to trigger
 * Chain-of-Thought language auto-detection.
 */
export const VOCAL_LANGUAGES = [
  { value: 'unknown', label: 'Auto' },
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日本語' },
  { value: 'ko', label: '한국어' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'de', label: 'Deutsch' },
  { value: 'ru', label: 'Русский' },
  { value: 'pt', label: 'Português' },
  { value: 'it', label: 'Italiano' },
  { value: 'th', label: 'ไทย' },
  { value: 'vi', label: 'Tiếng Việt' },
  { value: 'yue', label: '粵語' },
] as const;

/** Default vocal language — "unknown" triggers server-side auto-detection via CoT. */
export const DEFAULT_VOCAL_LANGUAGE = 'unknown';
