export interface EnhancePreset {
  id: string;
  label: string;
  icon: string;
  caption: string;
  consistency: 'low' | 'medium' | 'high';
  tags: string[];
}

export const ENHANCE_PRESETS: EnhancePreset[] = [
  {
    id: 'jazz',
    label: 'Jazz',
    icon: '\u{1F3B7}',
    caption: 'jazz arrangement, upright bass, brushed drums, warm piano chords, swing feel',
    consistency: 'medium',
    tags: ['jazz', 'swing'],
  },
  {
    id: 'lofi',
    label: 'Lo-Fi',
    icon: '\u{1F319}',
    caption: 'lo-fi hip hop, vinyl crackle, mellow Rhodes piano, tape saturation, chill beats',
    consistency: 'medium',
    tags: ['lofi', 'chill'],
  },
  {
    id: 'orchestral',
    label: 'Orchestral',
    icon: '\u{1F3BB}',
    caption: 'orchestral arrangement, strings, woodwinds, cinematic, sweeping dynamics',
    consistency: 'high',
    tags: ['orchestral', 'cinematic'],
  },
  {
    id: 'acoustic',
    label: 'Acoustic',
    icon: '\u{1F3B8}',
    caption: 'acoustic guitar, fingerpicking, warm vocals, intimate, folk-inspired',
    consistency: 'medium',
    tags: ['acoustic', 'folk'],
  },
  {
    id: 'electronic',
    label: 'Electronic',
    icon: '\u{1F3B9}',
    caption: 'electronic synths, arpeggiator, side-chain compression, modern beat',
    consistency: 'low',
    tags: ['electronic', 'synth'],
  },
  {
    id: 'cinematic',
    label: 'Cinematic',
    icon: '\u{1F3AC}',
    caption: 'cinematic score, epic brass, tension building, dramatic percussion',
    consistency: 'high',
    tags: ['cinematic', 'epic'],
  },
  {
    id: 'rnb',
    label: 'R&B',
    icon: '\u{1F3A4}',
    caption: 'smooth R&B, neo-soul, warm harmonies, groovy bassline, silky vocals',
    consistency: 'medium',
    tags: ['rnb', 'soul'],
  },
  {
    id: 'ambient',
    label: 'Ambient',
    icon: '\u{1F30A}',
    caption: 'ambient soundscape, ethereal pads, reverb-drenched textures, atmospheric',
    consistency: 'low',
    tags: ['ambient', 'atmospheric'],
  },
  {
    id: 'hiphop',
    label: 'Hip-Hop',
    icon: '\u{1F3A7}',
    caption: 'hip-hop beat, heavy 808 bass, crisp snare, trap hi-hats, dark energy',
    consistency: 'medium',
    tags: ['hiphop', 'trap'],
  },
  {
    id: 'reggae',
    label: 'Reggae',
    icon: '\u{1F3DD}\u{FE0F}',
    caption: 'reggae rhythm, offbeat guitar, deep bass, one drop drum pattern, sunny',
    consistency: 'medium',
    tags: ['reggae', 'island'],
  },
  {
    id: 'metal',
    label: 'Metal',
    icon: '\u{1F918}',
    caption: 'heavy metal, distorted guitars, double kick drums, aggressive, powerful riffs',
    consistency: 'medium',
    tags: ['metal', 'rock'],
  },
  {
    id: 'bossa',
    label: 'Bossa Nova',
    icon: '\u{2615}',
    caption: 'bossa nova, nylon guitar, soft brush percussion, gentle swing, warm',
    consistency: 'medium',
    tags: ['bossa', 'latin'],
  },
];

/**
 * Pick a random preset, or combine two presets for a "Surprise Me" result.
 * Consistency is always 'low' or 'medium' (never 'high') for surprises.
 * Uses an optional random function for testability.
 */
export function surpriseMe(
  presets: EnhancePreset[] = ENHANCE_PRESETS,
  randomFn: () => number = Math.random,
): { caption: string; consistency: 'low' | 'medium' } {
  if (presets.length === 0) {
    return { caption: '', consistency: 'medium' };
  }

  if (presets.length === 1) {
    const consistency = randomFn() < 0.5 ? 'low' : 'medium';
    return { caption: presets[0].caption, consistency };
  }

  const shouldCombine = randomFn() < 0.4;
  const consistency: 'low' | 'medium' = randomFn() < 0.5 ? 'low' : 'medium';

  if (shouldCombine && presets.length >= 2) {
    const idxA = Math.floor(randomFn() * presets.length);
    let idxB = Math.floor(randomFn() * (presets.length - 1));
    if (idxB >= idxA) idxB += 1;
    const a = presets[idxA];
    const b = presets[idxB];
    return {
      caption: `${a.caption}, ${b.caption}`,
      consistency,
    };
  }

  const idx = Math.floor(randomFn() * presets.length);
  return { caption: presets[idx].caption, consistency };
}
