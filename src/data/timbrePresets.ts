/**
 * Timbre Presets — curated timbral profiles that influence AI generation output.
 *
 * Each preset provides a `promptFragment` that is prepended to the user's prompt
 * to guide the AI model toward a specific sonic character.
 */

export type TimbreCategory =
  | 'Vocal Styles'
  | 'Guitar Tones'
  | 'Synth Textures'
  | 'Keys & Piano'
  | 'Bass Tones'
  | 'Drums & Percussion'
  | 'Strings & Orchestral'
  | 'Wind & Brass'
  | 'Production Styles';

export interface TimbrePreset {
  id: string;
  name: string;
  category: TimbreCategory;
  description: string;
  /** Text fragment prepended to the user prompt to influence timbre. */
  promptFragment: string;
  /** Optional tags for search/filter. */
  tags?: string[];
}

export const TIMBRE_CATEGORIES: TimbreCategory[] = [
  'Vocal Styles',
  'Guitar Tones',
  'Synth Textures',
  'Keys & Piano',
  'Bass Tones',
  'Drums & Percussion',
  'Strings & Orchestral',
  'Wind & Brass',
  'Production Styles',
];

export const TIMBRE_PRESETS: TimbrePreset[] = [
  // ── Vocal Styles ──────────────────────────────────────────────────────────
  {
    id: 'vocal-clear-female',
    name: 'Clear Female Vocal',
    category: 'Vocal Styles',
    description: 'Clean, bright female vocal with clarity and presence.',
    promptFragment: 'clear female vocal, bright and airy, polished tone, upfront presence',
    tags: ['female', 'clean', 'bright'],
  },
  {
    id: 'vocal-deep-male',
    name: 'Deep Male Vocal',
    category: 'Vocal Styles',
    description: 'Rich, warm male voice with low register depth.',
    promptFragment: 'deep male vocal, warm and rich tone, low register, smooth baritone timbre',
    tags: ['male', 'deep', 'warm'],
  },
  {
    id: 'vocal-raspy',
    name: 'Raspy Vocal',
    category: 'Vocal Styles',
    description: 'Gritty, textured vocal with natural rasp and character.',
    promptFragment: 'raspy vocal, gritty and textured voice, raw emotional delivery, natural distortion',
    tags: ['raspy', 'gritty', 'raw'],
  },
  {
    id: 'vocal-ethereal',
    name: 'Ethereal Vocal',
    category: 'Vocal Styles',
    description: 'Dreamy, reverb-drenched vocal floating in space.',
    promptFragment: 'ethereal vocal, dreamy and floating, heavy reverb, angelic whispered tone',
    tags: ['ethereal', 'dreamy', 'reverb'],
  },
  {
    id: 'vocal-soulful',
    name: 'Soulful Vocal',
    category: 'Vocal Styles',
    description: 'Expressive soul vocal with melisma and dynamic range.',
    promptFragment: 'soulful vocal, expressive melisma, dynamic range, gospel-influenced warm delivery',
    tags: ['soul', 'expressive', 'gospel'],
  },
  {
    id: 'vocal-autotune',
    name: 'Auto-Tuned Vocal',
    category: 'Vocal Styles',
    description: 'Modern pitch-corrected vocal with T-Pain effect.',
    promptFragment: 'auto-tuned vocal, heavy pitch correction, robotic melodic effect, modern trap vocal',
    tags: ['autotune', 'modern', 'trap'],
  },

  // ── Guitar Tones ──────────────────────────────────────────────────────────
  {
    id: 'guitar-clean-sparkle',
    name: 'Clean Sparkle',
    category: 'Guitar Tones',
    description: 'Bright clean electric guitar with chorus and shimmer.',
    promptFragment: 'clean electric guitar, bright sparkle, chorus effect, Fender-style chime',
    tags: ['clean', 'bright', 'chorus'],
  },
  {
    id: 'guitar-overdriven',
    name: 'Overdriven Crunch',
    category: 'Guitar Tones',
    description: 'Medium-gain crunch tone with tube amp warmth.',
    promptFragment: 'overdriven guitar, tube amp crunch, warm midrange, Marshall-style breakup',
    tags: ['overdrive', 'crunch', 'tube'],
  },
  {
    id: 'guitar-heavy-distortion',
    name: 'Heavy Distortion',
    category: 'Guitar Tones',
    description: 'High-gain distortion for metal and hard rock.',
    promptFragment: 'heavy distorted guitar, high gain, tight palm mutes, aggressive metal tone',
    tags: ['distortion', 'metal', 'heavy'],
  },
  {
    id: 'guitar-acoustic-fingerstyle',
    name: 'Acoustic Fingerstyle',
    category: 'Guitar Tones',
    description: 'Warm nylon or steel-string acoustic with intimate feel.',
    promptFragment: 'acoustic guitar, fingerstyle playing, warm body resonance, intimate close-mic tone',
    tags: ['acoustic', 'fingerstyle', 'warm'],
  },

  // ── Synth Textures ────────────────────────────────────────────────────────
  {
    id: 'synth-analog-warm',
    name: 'Warm Analog',
    category: 'Synth Textures',
    description: 'Classic analog synthesizer warmth with subtle detuning.',
    promptFragment: 'warm analog synth, vintage Moog-style, subtle detuning, rich harmonics, fat tone',
    tags: ['analog', 'warm', 'vintage'],
  },
  {
    id: 'synth-digital-crisp',
    name: 'Digital Crisp',
    category: 'Synth Textures',
    description: 'Clean digital synthesis with precise harmonics.',
    promptFragment: 'crisp digital synth, clean waveforms, precise harmonics, modern FM synthesis',
    tags: ['digital', 'crisp', 'FM'],
  },
  {
    id: 'synth-supersaw',
    name: 'Supersaw',
    category: 'Synth Textures',
    description: 'Massive detuned saw stack for EDM and trance.',
    promptFragment: 'supersaw synth, massive detuned saw waves, wide stereo, trance lead, euphoric',
    tags: ['supersaw', 'trance', 'EDM'],
  },
  {
    id: 'synth-pad-ambient',
    name: 'Ambient Pad',
    category: 'Synth Textures',
    description: 'Evolving ambient pad with slow modulation.',
    promptFragment: 'ambient synth pad, slowly evolving texture, deep reverb, granular modulation',
    tags: ['ambient', 'pad', 'evolving'],
  },
  {
    id: 'synth-retro-80s',
    name: 'Retro 80s Synth',
    category: 'Synth Textures',
    description: 'Classic 80s poly synth with chorus and arpeggios.',
    promptFragment: 'retro 80s synth, Juno-style chorus, bright poly pads, synthwave arpeggios',
    tags: ['80s', 'retro', 'chorus'],
  },

  // ── Keys & Piano ──────────────────────────────────────────────────────────
  {
    id: 'keys-grand-piano',
    name: 'Concert Grand',
    category: 'Keys & Piano',
    description: 'Full-bodied concert grand piano with rich sustain.',
    promptFragment: 'concert grand piano, rich full-bodied tone, expressive dynamics, Steinway resonance',
    tags: ['grand', 'concert', 'classical'],
  },
  {
    id: 'keys-upright-honky',
    name: 'Honky-Tonk Upright',
    category: 'Keys & Piano',
    description: 'Slightly detuned upright piano with character.',
    promptFragment: 'honky-tonk upright piano, slightly detuned, bar-room character, bright and percussive',
    tags: ['upright', 'detuned', 'character'],
  },
  {
    id: 'keys-rhodes',
    name: 'Rhodes Electric Piano',
    category: 'Keys & Piano',
    description: 'Warm Fender Rhodes with bell-like tines.',
    promptFragment: 'Rhodes electric piano, warm bell-like tines, tremolo, neo-soul character',
    tags: ['rhodes', 'electric', 'soul'],
  },
  {
    id: 'keys-wurlitzer',
    name: 'Wurlitzer',
    category: 'Keys & Piano',
    description: 'Biting Wurlitzer with reedy midrange.',
    promptFragment: 'Wurlitzer electric piano, reedy midrange bite, slightly overdriven, funky tone',
    tags: ['wurlitzer', 'funky', 'midrange'],
  },

  // ── Bass Tones ────────────────────────────────────────────────────────────
  {
    id: 'bass-sub-808',
    name: '808 Sub Bass',
    category: 'Bass Tones',
    description: 'Deep 808 kick-bass with long sustain and distortion.',
    promptFragment: 'deep 808 sub bass, long sustain, distorted harmonics, trap-style low end',
    tags: ['808', 'sub', 'trap'],
  },
  {
    id: 'bass-fingerstyle',
    name: 'Fingerstyle Bass',
    category: 'Bass Tones',
    description: 'Round electric bass with fingerstyle warmth.',
    promptFragment: 'fingerstyle electric bass, round warm tone, smooth attack, Motown-style groove',
    tags: ['fingerstyle', 'electric', 'warm'],
  },
  {
    id: 'bass-synth-wobble',
    name: 'Wobble Bass',
    category: 'Bass Tones',
    description: 'Aggressive LFO-modulated dubstep bass.',
    promptFragment: 'wobble bass, aggressive LFO modulation, dubstep growl, heavy distorted low end',
    tags: ['wobble', 'dubstep', 'LFO'],
  },
  {
    id: 'bass-upright-acoustic',
    name: 'Upright Acoustic Bass',
    category: 'Bass Tones',
    description: 'Warm acoustic upright bass with woody resonance.',
    promptFragment: 'upright acoustic bass, warm woody tone, pizzicato pluck, jazz walking bass feel',
    tags: ['upright', 'acoustic', 'jazz'],
  },

  // ── Drums & Percussion ────────────────────────────────────────────────────
  {
    id: 'drums-punchy-electronic',
    name: 'Punchy Electronic',
    category: 'Drums & Percussion',
    description: 'Tight electronic drums with punch and clarity.',
    promptFragment: 'punchy electronic drums, tight kick, crisp snare, clean hi-hats, modern production',
    tags: ['electronic', 'punchy', 'tight'],
  },
  {
    id: 'drums-live-room',
    name: 'Live Room Drums',
    category: 'Drums & Percussion',
    description: 'Natural live drums with room ambience.',
    promptFragment: 'live room drums, natural room ambience, dynamic playing, overhead mic warmth',
    tags: ['live', 'room', 'natural'],
  },
  {
    id: 'drums-dusty-lofi',
    name: 'Dusty Lo-fi Drums',
    category: 'Drums & Percussion',
    description: 'Vinyl-degraded drums with crackle and warmth.',
    promptFragment: 'dusty lo-fi drums, vinyl crackle, tape-saturated, soft transients, chill beat',
    tags: ['lofi', 'dusty', 'vinyl'],
  },
  {
    id: 'drums-808-trap',
    name: '808 Trap Kit',
    category: 'Drums & Percussion',
    description: 'Modern trap drum kit with rolling hi-hats.',
    promptFragment: '808 trap drums, rolling hi-hat patterns, hard snare, deep kick, modern trap beat',
    tags: ['808', 'trap', 'modern'],
  },

  // ── Strings & Orchestral ──────────────────────────────────────────────────
  {
    id: 'strings-lush-ensemble',
    name: 'Lush String Ensemble',
    category: 'Strings & Orchestral',
    description: 'Full orchestral string section with vibrato and legato.',
    promptFragment: 'lush string ensemble, wide vibrato, legato phrasing, cinematic orchestral warmth',
    tags: ['strings', 'orchestral', 'lush'],
  },
  {
    id: 'strings-solo-violin',
    name: 'Solo Violin',
    category: 'Strings & Orchestral',
    description: 'Expressive solo violin with intimate tone.',
    promptFragment: 'solo violin, expressive vibrato, intimate close-mic, lyrical phrasing',
    tags: ['violin', 'solo', 'expressive'],
  },
  {
    id: 'strings-pizzicato',
    name: 'Pizzicato Strings',
    category: 'Strings & Orchestral',
    description: 'Plucked string section with playful character.',
    promptFragment: 'pizzicato strings, plucked staccato, playful bouncing rhythm, light and airy',
    tags: ['pizzicato', 'plucked', 'playful'],
  },

  // ── Wind & Brass ──────────────────────────────────────────────────────────
  {
    id: 'brass-warm-trumpet',
    name: 'Warm Trumpet',
    category: 'Wind & Brass',
    description: 'Warm muted trumpet with jazz inflection.',
    promptFragment: 'warm muted trumpet, Harmon mute, jazz phrasing, Miles Davis inspired tone',
    tags: ['trumpet', 'muted', 'jazz'],
  },
  {
    id: 'brass-epic-horns',
    name: 'Epic French Horns',
    category: 'Wind & Brass',
    description: 'Powerful French horn section for cinematic scoring.',
    promptFragment: 'epic French horns, powerful brass section, cinematic fanfare, heroic theme',
    tags: ['horns', 'epic', 'cinematic'],
  },
  {
    id: 'wind-flute-breathy',
    name: 'Breathy Flute',
    category: 'Wind & Brass',
    description: 'Airy concert flute with breathy overtones.',
    promptFragment: 'breathy concert flute, airy tone, gentle vibrato, pastoral melodic phrasing',
    tags: ['flute', 'breathy', 'airy'],
  },
  {
    id: 'wind-saxophone-smooth',
    name: 'Smooth Saxophone',
    category: 'Wind & Brass',
    description: 'Silky tenor saxophone for smooth jazz.',
    promptFragment: 'smooth tenor saxophone, silky warm tone, legato phrasing, smooth jazz character',
    tags: ['saxophone', 'smooth', 'jazz'],
  },

  // ── Production Styles ─────────────────────────────────────────────────────
  {
    id: 'prod-tape-warmth',
    name: 'Tape Warmth',
    category: 'Production Styles',
    description: 'Analog tape saturation with gentle compression.',
    promptFragment: 'tape-saturated warmth, analog hiss, gentle compression, vintage recording quality',
    tags: ['tape', 'analog', 'vintage'],
  },
  {
    id: 'prod-vinyl-nostalgia',
    name: 'Vinyl Nostalgia',
    category: 'Production Styles',
    description: 'Vinyl record character with crackle and warmth.',
    promptFragment: 'vinyl record quality, surface crackle, warm EQ curve, nostalgic lo-fi character',
    tags: ['vinyl', 'nostalgia', 'lofi'],
  },
  {
    id: 'prod-modern-polished',
    name: 'Modern Polished',
    category: 'Production Styles',
    description: 'Clean, loud, and polished modern production.',
    promptFragment: 'modern polished production, clean mix, loud mastering, crisp transients, radio-ready',
    tags: ['modern', 'polished', 'clean'],
  },
  {
    id: 'prod-lo-fi-bedroom',
    name: 'Bedroom Lo-fi',
    category: 'Production Styles',
    description: 'Intimate bedroom recording aesthetic.',
    promptFragment: 'bedroom lo-fi production, intimate recording, room ambience, imperfect charm',
    tags: ['bedroom', 'lofi', 'intimate'],
  },
];

// ── Public API ──────────────────────────────────────────────────────────────

const PRESET_MAP = new Map(TIMBRE_PRESETS.map((p) => [p.id, p]));

export function getTimbrePresetById(id: string): TimbrePreset | undefined {
  return PRESET_MAP.get(id);
}

export function getTimbrePresetsByCategory(category: TimbreCategory): TimbrePreset[] {
  return TIMBRE_PRESETS.filter((p) => p.category === category);
}

/**
 * Build a generation prompt by prepending the timbre preset's fragment.
 * Avoids duplication if the fragment is already present.
 */
export function buildPromptWithTimbre(userPrompt: string, preset: TimbrePreset | null): string {
  if (!preset) return userPrompt;
  const trimmed = userPrompt.trim();
  if (!trimmed) return preset.promptFragment;
  if (trimmed.includes(preset.promptFragment)) return trimmed;
  return `${preset.promptFragment}, ${trimmed}`;
}
