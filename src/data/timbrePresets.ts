/**
 * AI Timbre Presets — curated prompt templates for consistent AI generation timbre.
 *
 * Each preset provides an optimized prompt template that guides the ACE-Step model
 * to produce a specific sonic character. Presets can optionally reference audio
 * for timbre transfer.
 *
 * Part of #1229 (Sound Design & Timbre System epic), issue #1235.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const TIMBRE_CATEGORIES = [
  'Vocal Styles',
  'Guitar Tones',
  'Synth Textures',
  'Drum Kits',
  'Bass Sounds',
  'Orchestral',
  'Lo-fi',
  'Keys & Piano',
] as const;

export type TimbreCategory = (typeof TIMBRE_CATEGORIES)[number];

export interface TimbrePreset {
  id: string;
  name: string;
  category: TimbreCategory;
  tags: string[];
  /** Optimized prompt text for AI generation. */
  promptTemplate: string;
  /** Short human-readable description. */
  description: string;
  /** Whether this is a built-in factory preset. */
  isFactory: boolean;
  /** Optional IndexedDB key for reference audio. */
  referenceAudioKey?: string;
  /** Optional cover strength when reference audio is used (0–1). */
  coverStrength?: number;
}

// ---------------------------------------------------------------------------
// Factory Presets
// ---------------------------------------------------------------------------

export const FACTORY_TIMBRE_PRESETS: readonly TimbrePreset[] = [
  // ── Vocal Styles ──────────────────────────────────────────────────────
  {
    id: 'timbre-warm-soul-vocal',
    name: 'Warm Soul Vocal',
    category: 'Vocal Styles',
    tags: ['soul', 'warm', 'vocal', 'r&b'],
    promptTemplate: 'warm soulful vocal, smooth and rich tone, slight vibrato, intimate R&B feel',
    description: 'Rich, warm vocal with soulful phrasing and natural vibrato.',
    isFactory: true,
  },
  {
    id: 'timbre-ethereal-choir',
    name: 'Ethereal Choir',
    category: 'Vocal Styles',
    tags: ['choir', 'ethereal', 'ambient', 'reverb'],
    promptTemplate: 'ethereal choir, cathedral reverb, layered harmonies, airy angelic voices',
    description: 'Lush choral voices drenched in reverb for ambient/cinematic use.',
    isFactory: true,
  },
  {
    id: 'timbre-raspy-rock-vocal',
    name: 'Raspy Rock Vocal',
    category: 'Vocal Styles',
    tags: ['rock', 'raspy', 'gritty', 'vocal'],
    promptTemplate: 'raspy rock vocal, gritty and powerful, raw emotional delivery, slight distortion',
    description: 'Gritty, powerful rock vocal with natural rasp and emotion.',
    isFactory: true,
  },
  {
    id: 'timbre-airy-pop-vocal',
    name: 'Airy Pop Vocal',
    category: 'Vocal Styles',
    tags: ['pop', 'airy', 'bright', 'vocal'],
    promptTemplate: 'airy pop vocal, bright and clear, breathy tone, modern pop production, polished',
    description: 'Clean, breathy pop vocal with modern production polish.',
    isFactory: true,
  },

  // ── Guitar Tones ──────────────────────────────────────────────────────
  {
    id: 'timbre-clean-jazz-guitar',
    name: 'Clean Jazz Guitar',
    category: 'Guitar Tones',
    tags: ['jazz', 'clean', 'guitar', 'warm'],
    promptTemplate: 'clean jazz guitar, warm hollow-body tone, round and mellow, fingerstyle',
    description: 'Warm, clean hollow-body jazz guitar with mellow round tone.',
    isFactory: true,
  },
  {
    id: 'timbre-nashville-country',
    name: 'Nashville Country',
    category: 'Guitar Tones',
    tags: ['country', 'acoustic', 'guitar', 'nashville'],
    promptTemplate: 'country acoustic guitar fingerpicking, warm Nashville tone, slight reverb, twangy',
    description: 'Bright Nashville-style acoustic fingerpicking with natural warmth.',
    isFactory: true,
  },
  {
    id: 'timbre-crunch-blues',
    name: 'Blues Crunch',
    category: 'Guitar Tones',
    tags: ['blues', 'crunch', 'guitar', 'overdrive'],
    promptTemplate: 'blues electric guitar, warm tube amp crunch, expressive bends, B.B. King inspired tone',
    description: 'Classic blues crunch with tube amp warmth and expressive bends.',
    isFactory: true,
  },
  {
    id: 'timbre-metal-distortion',
    name: 'Metal High-Gain',
    category: 'Guitar Tones',
    tags: ['metal', 'distortion', 'guitar', 'heavy'],
    promptTemplate: 'heavy metal guitar, high-gain distortion, palm muting, aggressive down-tuned riff',
    description: 'High-gain metal guitar tone for heavy riffs and palm-muted chugging.',
    isFactory: true,
  },

  // ── Synth Textures ────────────────────────────────────────────────────
  {
    id: 'timbre-analog-synthwave',
    name: 'Analog Synthwave',
    category: 'Synth Textures',
    tags: ['synthwave', 'analog', 'retro', '80s'],
    promptTemplate: 'retro synthwave, analog polysynth pad, warm detuned oscillators, 80s nostalgic atmosphere',
    description: 'Warm detuned analog pad for retro synthwave productions.',
    isFactory: true,
  },
  {
    id: 'timbre-supersaw-edm',
    name: 'Supersaw EDM',
    category: 'Synth Textures',
    tags: ['edm', 'supersaw', 'bright', 'energetic'],
    promptTemplate: 'bright supersaw synth lead, wide stereo, EDM anthem, energetic and uplifting',
    description: 'Wide, bright supersaw for EDM drops and anthemic leads.',
    isFactory: true,
  },
  {
    id: 'timbre-dark-pad',
    name: 'Dark Ambient Pad',
    category: 'Synth Textures',
    tags: ['ambient', 'dark', 'pad', 'atmospheric'],
    promptTemplate: 'dark ambient pad, slowly evolving texture, deep sub harmonics, mysterious atmosphere',
    description: 'Evolving dark pad for ambient and atmospheric soundscapes.',
    isFactory: true,
  },
  {
    id: 'timbre-pluck-future-bass',
    name: 'Future Bass Pluck',
    category: 'Synth Textures',
    tags: ['future-bass', 'pluck', 'bright', 'synth'],
    promptTemplate: 'bright future bass pluck synth, short staccato, sidechain pumping, colorful chords',
    description: 'Short, bright pluck synth for future bass chord stabs.',
    isFactory: true,
  },

  // ── Drum Kits ─────────────────────────────────────────────────────────
  {
    id: 'timbre-808-trap',
    name: '808 Trap Kit',
    category: 'Drum Kits',
    tags: ['trap', '808', 'drums', 'hip-hop'],
    promptTemplate: 'trap drum kit, punchy 808 kick, crisp hi-hats, snappy snare with clap layer, hard-hitting',
    description: 'Classic 808-style trap drum kit with punchy low end.',
    isFactory: true,
  },
  {
    id: 'timbre-acoustic-live-drums',
    name: 'Acoustic Live Kit',
    category: 'Drum Kits',
    tags: ['acoustic', 'live', 'drums', 'natural'],
    promptTemplate: 'natural acoustic drum kit, live room recording, warm kick, snappy snare, shimmer cymbals',
    description: 'Natural-sounding acoustic drum kit from a live room recording.',
    isFactory: true,
  },
  {
    id: 'timbre-lofi-vinyl-drums',
    name: 'Lo-fi Vinyl Drums',
    category: 'Drum Kits',
    tags: ['lo-fi', 'vinyl', 'drums', 'dusty'],
    promptTemplate: 'lo-fi drum break, dusty vinyl crackle, mellow boom bap groove, tape-saturated',
    description: 'Dusty vinyl-textured drum break with lo-fi boom bap character.',
    isFactory: true,
  },
  {
    id: 'timbre-electronic-minimal',
    name: 'Minimal Electronic',
    category: 'Drum Kits',
    tags: ['electronic', 'minimal', 'techno', 'drums'],
    promptTemplate: 'minimal electronic drums, tight clean kick, crisp closed hi-hat, subtle clap, techno groove',
    description: 'Clean, minimal electronic drum pattern for techno and minimal house.',
    isFactory: true,
  },

  // ── Bass Sounds ───────────────────────────────────────────────────────
  {
    id: 'timbre-deep-sub-bass',
    name: 'Deep Sub Bass',
    category: 'Bass Sounds',
    tags: ['sub', 'bass', 'deep', 'clean'],
    promptTemplate: 'deep sub bass, clean sine wave low end, tight and controlled, minimal harmonics',
    description: 'Pure, deep sub bass for genres needing clean low end.',
    isFactory: true,
  },
  {
    id: 'timbre-funky-slap-bass',
    name: 'Funky Slap Bass',
    category: 'Bass Sounds',
    tags: ['funk', 'slap', 'bass', 'groovy'],
    promptTemplate: 'funky slap bass, bright attack, popping technique, groovy rhythm, Marcus Miller inspired',
    description: 'Bright, percussive slap bass with funky groove character.',
    isFactory: true,
  },
  {
    id: 'timbre-dubstep-wobble',
    name: 'Dubstep Wobble',
    category: 'Bass Sounds',
    tags: ['dubstep', 'wobble', 'bass', 'aggressive'],
    promptTemplate: 'aggressive dubstep wobble bass, heavy LFO modulation, distorted growl, massive low end',
    description: 'Heavy wobble bass with LFO modulation for dubstep and bass music.',
    isFactory: true,
  },
  {
    id: 'timbre-upright-jazz-bass',
    name: 'Upright Jazz Bass',
    category: 'Bass Sounds',
    tags: ['jazz', 'upright', 'bass', 'acoustic'],
    promptTemplate: 'acoustic upright double bass, warm woody tone, fingerstyle walking bass line, jazz',
    description: 'Warm, woody upright bass tone for jazz walking lines.',
    isFactory: true,
  },

  // ── Orchestral ────────────────────────────────────────────────────────
  {
    id: 'timbre-cinematic-strings',
    name: 'Cinematic Strings',
    category: 'Orchestral',
    tags: ['strings', 'cinematic', 'epic', 'orchestral'],
    promptTemplate: 'epic cinematic string section, lush legato violins, deep cellos, dramatic crescendo',
    description: 'Lush, dramatic string section for epic cinematic scores.',
    isFactory: true,
  },
  {
    id: 'timbre-french-horn-fanfare',
    name: 'French Horn Fanfare',
    category: 'Orchestral',
    tags: ['brass', 'horn', 'fanfare', 'orchestral'],
    promptTemplate: 'majestic french horn fanfare, noble brass section, powerful and heroic, film score',
    description: 'Noble, powerful French horn fanfare for heroic film score moments.',
    isFactory: true,
  },
  {
    id: 'timbre-gentle-woodwinds',
    name: 'Gentle Woodwinds',
    category: 'Orchestral',
    tags: ['woodwinds', 'gentle', 'flute', 'orchestral'],
    promptTemplate: 'gentle woodwind ensemble, delicate flute melody, warm clarinet, pastoral and peaceful',
    description: 'Delicate woodwind ensemble with pastoral, peaceful character.',
    isFactory: true,
  },
  {
    id: 'timbre-timpani-percussion',
    name: 'Orchestral Percussion',
    category: 'Orchestral',
    tags: ['percussion', 'timpani', 'orchestral', 'epic'],
    promptTemplate: 'orchestral percussion, thundering timpani rolls, crashing cymbals, dramatic impact hits',
    description: 'Thundering orchestral percussion for dramatic moments.',
    isFactory: true,
  },

  // ── Lo-fi ─────────────────────────────────────────────────────────────
  {
    id: 'timbre-lofi-piano',
    name: 'Lo-fi Piano',
    category: 'Lo-fi',
    tags: ['lo-fi', 'piano', 'warm', 'tape'],
    promptTemplate: 'warm lo-fi piano, tape-saturated, slight detuning, vinyl texture, mellow and nostalgic',
    description: 'Tape-saturated piano with vinyl warmth for lo-fi productions.',
    isFactory: true,
  },
  {
    id: 'timbre-lofi-vinyl-atmosphere',
    name: 'Vinyl Atmosphere',
    category: 'Lo-fi',
    tags: ['lo-fi', 'vinyl', 'ambient', 'crackle'],
    promptTemplate: 'lo-fi vinyl crackle atmosphere, warm tape hiss, ambient room tone, nostalgic texture',
    description: 'Vinyl crackle and tape hiss texture for lo-fi ambience.',
    isFactory: true,
  },
  {
    id: 'timbre-lofi-rhodes',
    name: 'Lo-fi Rhodes',
    category: 'Lo-fi',
    tags: ['lo-fi', 'rhodes', 'keys', 'warm'],
    promptTemplate: 'lo-fi electric piano Rhodes, warm tremolo, tape wobble, jazzy chords, chill vibes',
    description: 'Warm Rhodes electric piano with tape wobble for chill lo-fi.',
    isFactory: true,
  },
  {
    id: 'timbre-lofi-guitar',
    name: 'Lo-fi Clean Guitar',
    category: 'Lo-fi',
    tags: ['lo-fi', 'guitar', 'clean', 'ambient'],
    promptTemplate: 'lo-fi clean guitar, warm reverb, gentle strumming, mellow and relaxed, ambient feel',
    description: 'Gentle clean guitar with reverb for relaxed lo-fi atmosphere.',
    isFactory: true,
  },

  // ── Keys & Piano ──────────────────────────────────────────────────────
  {
    id: 'timbre-grand-piano-concert',
    name: 'Concert Grand Piano',
    category: 'Keys & Piano',
    tags: ['piano', 'grand', 'classical', 'concert'],
    promptTemplate: 'concert grand piano, rich full tone, expressive dynamics, pristine acoustic recording',
    description: 'Rich, full-bodied concert grand piano with expressive dynamics.',
    isFactory: true,
  },
  {
    id: 'timbre-honky-tonk-piano',
    name: 'Honky-Tonk Piano',
    category: 'Keys & Piano',
    tags: ['piano', 'honky-tonk', 'vintage', 'detuned'],
    promptTemplate: 'honky-tonk piano, slightly detuned, bright and jangling, ragtime character, vintage',
    description: 'Bright, slightly detuned vintage piano with ragtime character.',
    isFactory: true,
  },
  {
    id: 'timbre-wurlitzer-keys',
    name: 'Wurlitzer Electric Piano',
    category: 'Keys & Piano',
    tags: ['wurlitzer', 'keys', 'vintage', 'tremolo'],
    promptTemplate: 'Wurlitzer electric piano, warm tremolo, vintage 60s soul tone, slightly overdriven',
    description: 'Warm vintage Wurlitzer with tremolo for soul and R&B.',
    isFactory: true,
  },
  {
    id: 'timbre-hammond-organ',
    name: 'Hammond B3 Organ',
    category: 'Keys & Piano',
    tags: ['organ', 'hammond', 'gospel', 'vintage'],
    promptTemplate: 'Hammond B3 organ, warm drawbar tone, Leslie speaker rotary effect, gospel and soul',
    description: 'Classic Hammond B3 organ tone with Leslie speaker character.',
    isFactory: true,
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function getTimbrePresetById(
  id: string,
  userPresets: TimbrePreset[] = [],
): TimbrePreset | undefined {
  return FACTORY_TIMBRE_PRESETS.find((p) => p.id === id) ?? userPresets.find((p) => p.id === id);
}

export function getTimbrePresetsByCategory(
  category: TimbreCategory,
  userPresets: TimbrePreset[] = [],
): TimbrePreset[] {
  return [...FACTORY_TIMBRE_PRESETS, ...userPresets].filter((p) => p.category === category);
}

export function getAllTimbreCategories(): TimbreCategory[] {
  return [...new Set(FACTORY_TIMBRE_PRESETS.map((p) => p.category))];
}

export function createUserTimbrePreset(input: {
  name: string;
  category: TimbreCategory;
  promptTemplate: string;
  tags: string[];
  description: string;
  referenceAudioKey?: string;
  coverStrength?: number;
}): TimbrePreset {
  const coverStrength =
    input.coverStrength === undefined
      ? undefined
      : Math.min(1, Math.max(0, input.coverStrength));

  return {
    id: `user-timbre-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    isFactory: false,
    name: input.name,
    category: input.category,
    promptTemplate: input.promptTemplate,
    tags: [...input.tags],
    description: input.description,
    referenceAudioKey: input.referenceAudioKey,
    coverStrength,
  };
}
