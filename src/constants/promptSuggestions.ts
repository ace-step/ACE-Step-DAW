export interface PromptSuggestion {
  text: string;
  category: PromptSuggestionCategory;
}

export type PromptSuggestionCategory = 'genre' | 'instrument' | 'mood' | 'technique';

export const PROMPT_SUGGESTION_CATEGORIES: PromptSuggestionCategory[] = [
  'genre',
  'instrument',
  'mood',
  'technique',
];

export const PROMPT_SUGGESTIONS: PromptSuggestion[] = [
  // Genres
  { text: 'pop', category: 'genre' },
  { text: 'rock', category: 'genre' },
  { text: 'jazz', category: 'genre' },
  { text: 'blues', category: 'genre' },
  { text: 'classical', category: 'genre' },
  { text: 'electronic', category: 'genre' },
  { text: 'hip-hop', category: 'genre' },
  { text: 'r&b', category: 'genre' },
  { text: 'soul', category: 'genre' },
  { text: 'funk', category: 'genre' },
  { text: 'country', category: 'genre' },
  { text: 'folk', category: 'genre' },
  { text: 'reggae', category: 'genre' },
  { text: 'latin', category: 'genre' },
  { text: 'metal', category: 'genre' },
  { text: 'punk', category: 'genre' },
  { text: 'indie', category: 'genre' },
  { text: 'ambient', category: 'genre' },
  { text: 'lo-fi', category: 'genre' },
  { text: 'synthwave', category: 'genre' },
  { text: 'house', category: 'genre' },
  { text: 'techno', category: 'genre' },
  { text: 'drum and bass', category: 'genre' },
  { text: 'dubstep', category: 'genre' },
  { text: 'trap', category: 'genre' },
  { text: 'boom bap', category: 'genre' },
  { text: 'bebop', category: 'genre' },
  { text: 'bossa nova', category: 'genre' },
  { text: 'disco', category: 'genre' },
  { text: 'gospel', category: 'genre' },
  { text: 'grunge', category: 'genre' },
  { text: 'new wave', category: 'genre' },
  { text: 'shoegaze', category: 'genre' },
  { text: 'post-rock', category: 'genre' },
  { text: 'world music', category: 'genre' },

  // Instruments
  { text: 'piano', category: 'instrument' },
  { text: 'acoustic guitar', category: 'instrument' },
  { text: 'electric guitar', category: 'instrument' },
  { text: 'bass guitar', category: 'instrument' },
  { text: 'drums', category: 'instrument' },
  { text: 'synthesizer', category: 'instrument' },
  { text: 'violin', category: 'instrument' },
  { text: 'cello', category: 'instrument' },
  { text: 'trumpet', category: 'instrument' },
  { text: 'saxophone', category: 'instrument' },
  { text: 'flute', category: 'instrument' },
  { text: 'clarinet', category: 'instrument' },
  { text: 'organ', category: 'instrument' },
  { text: 'Rhodes piano', category: 'instrument' },
  { text: 'strings', category: 'instrument' },
  { text: 'brass', category: 'instrument' },
  { text: 'woodwinds', category: 'instrument' },
  { text: 'harp', category: 'instrument' },
  { text: 'ukulele', category: 'instrument' },
  { text: 'banjo', category: 'instrument' },
  { text: 'mandolin', category: 'instrument' },
  { text: 'harmonica', category: 'instrument' },
  { text: 'accordion', category: 'instrument' },
  { text: 'marimba', category: 'instrument' },
  { text: 'vibraphone', category: 'instrument' },
  { text: 'timpani', category: 'instrument' },
  { text: '808 bass', category: 'instrument' },
  { text: 'drum machine', category: 'instrument' },
  { text: 'synth pad', category: 'instrument' },
  { text: 'synth lead', category: 'instrument' },
  { text: 'vocoder', category: 'instrument' },
  { text: 'choir', category: 'instrument' },
  { text: 'vocals', category: 'instrument' },

  // Moods
  { text: 'happy', category: 'mood' },
  { text: 'sad', category: 'mood' },
  { text: 'melancholic', category: 'mood' },
  { text: 'energetic', category: 'mood' },
  { text: 'relaxing', category: 'mood' },
  { text: 'dreamy', category: 'mood' },
  { text: 'dark', category: 'mood' },
  { text: 'uplifting', category: 'mood' },
  { text: 'aggressive', category: 'mood' },
  { text: 'mellow', category: 'mood' },
  { text: 'warm', category: 'mood' },
  { text: 'cold', category: 'mood' },
  { text: 'ethereal', category: 'mood' },
  { text: 'groovy', category: 'mood' },
  { text: 'cinematic', category: 'mood' },
  { text: 'nostalgic', category: 'mood' },
  { text: 'peaceful', category: 'mood' },
  { text: 'intense', category: 'mood' },
  { text: 'playful', category: 'mood' },
  { text: 'mysterious', category: 'mood' },
  { text: 'romantic', category: 'mood' },
  { text: 'epic', category: 'mood' },
  { text: 'haunting', category: 'mood' },
  { text: 'triumphant', category: 'mood' },
  { text: 'contemplative', category: 'mood' },
  { text: 'atmospheric', category: 'mood' },

  // Techniques
  { text: 'reverb', category: 'technique' },
  { text: 'delay', category: 'technique' },
  { text: 'distortion', category: 'technique' },
  { text: 'chorus', category: 'technique' },
  { text: 'compression', category: 'technique' },
  { text: 'sidechain', category: 'technique' },
  { text: 'arpeggiated', category: 'technique' },
  { text: 'staccato', category: 'technique' },
  { text: 'legato', category: 'technique' },
  { text: 'vibrato', category: 'technique' },
  { text: 'tremolo', category: 'technique' },
  { text: 'fingerpicking', category: 'technique' },
  { text: 'strumming', category: 'technique' },
  { text: 'palm muting', category: 'technique' },
  { text: 'slides', category: 'technique' },
  { text: 'hammer-on', category: 'technique' },
  { text: 'vinyl crackle', category: 'technique' },
  { text: 'tape saturation', category: 'technique' },
  { text: 'lo-fi processing', category: 'technique' },
  { text: 'analog warmth', category: 'technique' },
  { text: 'glitch', category: 'technique' },
  { text: 'granular', category: 'technique' },
  { text: 'pitch shifting', category: 'technique' },
  { text: 'time stretching', category: 'technique' },
  { text: 'four-on-the-floor', category: 'technique' },
  { text: 'syncopation', category: 'technique' },
  { text: 'polyrhythm', category: 'technique' },
  { text: 'call and response', category: 'technique' },
  { text: 'crescendo', category: 'technique' },
  { text: 'fade in', category: 'technique' },
  { text: 'fade out', category: 'technique' },
];

/**
 * Get suggestions matching a query token using prefix + fuzzy matching.
 * Returns results ranked by relevance (exact prefix first, then contains).
 */
export function getPromptSuggestions(
  query: string,
  maxResults: number = 8,
): PromptSuggestion[] {
  const q = query.toLowerCase().trim();
  if (q.length === 0) return [];

  const prefixMatches: PromptSuggestion[] = [];
  const containsMatches: PromptSuggestion[] = [];

  for (const suggestion of PROMPT_SUGGESTIONS) {
    const text = suggestion.text.toLowerCase();
    const textNormalized = text.replace(/-/g, '');
    const qNormalized = q.replace(/-/g, '');
    if (text.startsWith(q) || textNormalized.startsWith(qNormalized)) {
      prefixMatches.push(suggestion);
    } else if (text.includes(q) || textNormalized.includes(qNormalized)) {
      containsMatches.push(suggestion);
    }
  }

  return [...prefixMatches, ...containsMatches].slice(0, maxResults);
}
