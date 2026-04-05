import { DEFAULT_GENERATION } from '../constants/defaults';
import type { ProjectTemplate, TrackName, TrackType } from '../types/project';

export interface GenreTemplateEntry {
  id: string;
  genre: string;
  title: string;
  description: string;
  bpm: number;
  keyScale: string;
  tracks: string[];
}

interface TrackInput {
  trackName: TrackName;
  trackType: TrackType;
  displayName: string;
  color: string;
  synthPreset?: string;
  localCaption: string;
}

function buildTemplate(
  id: string,
  name: string,
  description: string,
  bpm: number,
  keyScale: string,
  tracks: TrackInput[],
): ProjectTemplate {
  return {
    id,
    name,
    description,
    createdAt: 0,
    bpm,
    keyScale,
    timeSignature: 4,
    measures: 64,
    generationDefaults: structuredClone(DEFAULT_GENERATION),
    tracks: tracks.map((t) => ({
      trackName: t.trackName,
      trackType: t.trackType,
      displayName: t.displayName,
      color: t.color,
      volume: 0.8,
      pan: 0,
      synthPreset: t.synthPreset as never,
      localCaption: t.localCaption,
    })),
  };
}

// ── Genre Template Entries (metadata for browsing) ──────────────────────────

export const GENRE_TEMPLATES: GenreTemplateEntry[] = [
  // ── Electronic ──
  {
    id: 'edm-house',
    genre: 'Electronic',
    title: 'EDM / House',
    description: 'Four-on-the-floor dance production with sidechain bass, synth hooks, and build-drop structure.',
    bpm: 128,
    keyScale: 'F minor',
    tracks: ['Kick & Drums', 'Bass', 'Lead Synth', 'Pad', 'FX Risers'],
  },
  {
    id: 'synthwave-retro',
    genre: 'Electronic',
    title: 'Synthwave / Retrowave',
    description: '80s-inspired analog synths, gated reverb drums, and neon-soaked arpeggios.',
    bpm: 118,
    keyScale: 'E minor',
    tracks: ['Drums', 'Bass', 'Arpeggio', 'Lead Synth', 'Pad'],
  },
  {
    id: 'ambient-soundscape',
    genre: 'Electronic',
    title: 'Ambient / Soundscape',
    description: 'Textural layers, evolving pads, and atmospheric drones for immersive sonic landscapes.',
    bpm: 70,
    keyScale: 'D major',
    tracks: ['Drone', 'Pad', 'Texture', 'Melody', 'Field Recording'],
  },

  // ── Hip Hop ──
  {
    id: 'lofi-hiphop',
    genre: 'Hip Hop',
    title: 'Lo-fi Hip Hop',
    description: 'Dusty vinyl drums, jazzy chords, and warm tape-saturated melodies for chill beats.',
    bpm: 82,
    keyScale: 'Bb major',
    tracks: ['Drums', 'Bass', 'Keys', 'Melody', 'Vinyl Texture'],
  },
  {
    id: 'trap-hiphop',
    genre: 'Hip Hop',
    title: 'Trap / Hip Hop',
    description: 'Hard-hitting 808s, rolling hi-hats, and aggressive synth leads for modern trap.',
    bpm: 140,
    keyScale: 'C minor',
    tracks: ['Drums', '808 Bass', 'Lead', 'Vocals', 'FX'],
  },

  // ── Rock / Indie ──
  {
    id: 'indie-rock',
    genre: 'Rock / Indie',
    title: 'Indie Rock',
    description: 'Driving guitars, punchy drums, and raw energy with room for vocal melodies.',
    bpm: 130,
    keyScale: 'A major',
    tracks: ['Drums', 'Bass', 'Rhythm Guitar', 'Lead Guitar', 'Vocals'],
  },

  // ── Jazz ──
  {
    id: 'jazz-combo',
    genre: 'Jazz',
    title: 'Jazz Combo',
    description: 'Classic small ensemble with walking bass, brushed drums, and improvisational space.',
    bpm: 120,
    keyScale: 'Bb major',
    tracks: ['Drums', 'Upright Bass', 'Piano', 'Horn'],
  },

  // ── Orchestral ──
  {
    id: 'orchestral-cinematic',
    genre: 'Orchestral',
    title: 'Orchestral Cinematic',
    description: 'Epic film scoring setup with strings, brass, woodwinds, and percussion for dramatic compositions.',
    bpm: 100,
    keyScale: 'D minor',
    tracks: ['Percussion', 'Strings', 'Brass', 'Woodwinds', 'Choir'],
  },
  {
    id: 'classical-chamber',
    genre: 'Orchestral',
    title: 'Classical Chamber',
    description: 'Intimate chamber ensemble with piano, strings, and woodwind for delicate classical writing.',
    bpm: 96,
    keyScale: 'G major',
    tracks: ['Piano', 'Violin', 'Cello', 'Flute'],
  },

  // ── Pop ──
  {
    id: 'pop-production',
    genre: 'Pop',
    title: 'Pop Production',
    description: 'Radio-ready pop arrangement with punchy drums, layered synths, and vocal-forward mix.',
    bpm: 110,
    keyScale: 'C major',
    tracks: ['Drums', 'Bass', 'Synth Pad', 'Lead Vocal', 'Backing Vocals'],
  },

  // ── R&B / Soul ──
  {
    id: 'rnb-soul',
    genre: 'R&B / Soul',
    title: 'R&B / Soul',
    description: 'Smooth grooves, warm keys, and soulful vocal arrangements over laid-back rhythms.',
    bpm: 90,
    keyScale: 'Eb major',
    tracks: ['Drums', 'Bass', 'Keys', 'Guitar', 'Vocals'],
  },

  // ── World ──
  {
    id: 'world-fusion',
    genre: 'World',
    title: 'World Fusion',
    description: 'Cross-cultural sonic exploration blending traditional instruments with modern production.',
    bpm: 105,
    keyScale: 'A minor',
    tracks: ['Percussion', 'Bass', 'Melody', 'Pad', 'Vocals'],
  },
];

// ── Template Builders (full ProjectTemplate with track details) ─────────────

const TEMPLATE_MAP: Record<string, ProjectTemplate> = {
  'edm-house': buildTemplate(
    'edm-house',
    'EDM / House',
    'Four-on-the-floor dance production with sidechain bass and build-drop structure.',
    128,
    'F minor',
    [
      { trackName: 'drums', trackType: 'drumMachine', displayName: 'Kick & Drums', color: '#ef4444', localCaption: 'punchy four-on-the-floor kick, crisp claps, rolling hi-hats, tight percussion' },
      { trackName: 'bass', trackType: 'pianoRoll', displayName: 'Bass', color: '#f97316', synthPreset: 'bass', localCaption: 'deep sidechain bass, plucky sub with rhythmic pumping' },
      { trackName: 'synth', trackType: 'pianoRoll', displayName: 'Lead Synth', color: '#3b82f6', synthPreset: 'lead', localCaption: 'bright supersaw lead with filter automation and wide stereo' },
      { trackName: 'strings', trackType: 'pianoRoll', displayName: 'Pad', color: '#8b5cf6', synthPreset: 'pad', localCaption: 'lush evolving pad with slow filter sweep and reverb tail' },
      { trackName: 'fx', trackType: 'stems', displayName: 'FX Risers', color: '#06b6d4', localCaption: 'white noise risers, impacts, reverse crashes, transition effects' },
    ],
  ),
  'synthwave-retro': buildTemplate(
    'synthwave-retro',
    'Synthwave / Retrowave',
    '80s-inspired analog synths with gated reverb drums and neon arpeggios.',
    118,
    'E minor',
    [
      { trackName: 'drums', trackType: 'drumMachine', displayName: 'Drums', color: '#ef4444', localCaption: 'gated reverb snare, punchy electronic kick, tight hi-hats, 80s drum machine feel' },
      { trackName: 'bass', trackType: 'pianoRoll', displayName: 'Bass', color: '#f97316', synthPreset: 'bass', localCaption: 'deep analog bass with subtle glide and warm saturation' },
      { trackName: 'synth', trackType: 'pianoRoll', displayName: 'Arpeggio', color: '#22c55e', synthPreset: 'pluck', localCaption: 'shimmering 16th-note arpeggio with chorus and delay, classic 80s sequencer feel' },
      { trackName: 'custom', trackType: 'pianoRoll', displayName: 'Lead Synth', color: '#3b82f6', synthPreset: 'lead', localCaption: 'soaring saw lead with portamento, bright and expressive, neon-lit melodies' },
      { trackName: 'strings', trackType: 'pianoRoll', displayName: 'Pad', color: '#8b5cf6', synthPreset: 'pad', localCaption: 'wide analog pad with slow attack and lush chorus, cinematic atmosphere' },
    ],
  ),
  'ambient-soundscape': buildTemplate(
    'ambient-soundscape',
    'Ambient / Soundscape',
    'Textural layers and evolving pads for immersive sonic landscapes.',
    70,
    'D major',
    [
      { trackName: 'strings', trackType: 'pianoRoll', displayName: 'Drone', color: '#6366f1', synthPreset: 'pad', localCaption: 'deep sustained drone with harmonic overtones, slowly evolving timbre' },
      { trackName: 'synth', trackType: 'pianoRoll', displayName: 'Pad', color: '#8b5cf6', synthPreset: 'pad', localCaption: 'ethereal granular pad with long release and modulated filter' },
      { trackName: 'fx', trackType: 'stems', displayName: 'Texture', color: '#06b6d4', localCaption: 'subtle textural layer with crackle, hiss, and organic movement' },
      { trackName: 'custom', trackType: 'pianoRoll', displayName: 'Melody', color: '#22c55e', synthPreset: 'pluck', localCaption: 'sparse crystalline melody with long reverb tail, delicate and minimal' },
      { trackName: 'vocals', trackType: 'stems', displayName: 'Field Recording', color: '#a855f7', localCaption: 'nature ambience, rain, wind, or distant urban atmosphere' },
    ],
  ),
  'lofi-hiphop': buildTemplate(
    'lofi-hiphop',
    'Lo-fi Hip Hop',
    'Dusty vinyl drums and jazzy chords for chill beats.',
    82,
    'Bb major',
    [
      { trackName: 'drums', trackType: 'sequencer', displayName: 'Drums', color: '#ef4444', localCaption: 'dusty lo-fi drums with vinyl crackle, lazy swing, soft transients' },
      { trackName: 'bass', trackType: 'pianoRoll', displayName: 'Bass', color: '#f97316', synthPreset: 'bass', localCaption: 'warm round bass with tape saturation, subtle fingerstyle feel' },
      { trackName: 'keyboard', trackType: 'pianoRoll', displayName: 'Keys', color: '#22c55e', synthPreset: 'piano', localCaption: 'jazzy rhodes chords with tremolo, warm and nostalgic, 7th and 9th voicings' },
      { trackName: 'synth', trackType: 'pianoRoll', displayName: 'Melody', color: '#3b82f6', synthPreset: 'lead', localCaption: 'tape-worn topline with pitch wobble, sparse and dreamy phrasing' },
      { trackName: 'fx', trackType: 'stems', displayName: 'Vinyl Texture', color: '#a855f7', localCaption: 'vinyl crackle and hiss layer, subtle room ambience, lo-fi warmth' },
    ],
  ),
  'trap-hiphop': buildTemplate(
    'trap-hiphop',
    'Trap / Hip Hop',
    'Hard-hitting 808s and rolling hi-hats for modern trap.',
    140,
    'C minor',
    [
      { trackName: 'drums', trackType: 'drumMachine', displayName: 'Drums', color: '#ef4444', localCaption: 'hard trap drums, crisp snare, rapid hi-hat rolls, punchy claps' },
      { trackName: 'bass', trackType: 'pianoRoll', displayName: '808 Bass', color: '#f97316', synthPreset: 'bass', localCaption: 'distorted 808 bass with long sustain, deep sub with pitch slides' },
      { trackName: 'synth', trackType: 'pianoRoll', displayName: 'Lead', color: '#3b82f6', synthPreset: 'lead', localCaption: 'dark melodic lead with delay, minor key arpeggios and bell-like tones' },
      { trackName: 'vocals', trackType: 'stems', displayName: 'Vocals', color: '#f43f5e', localCaption: 'aggressive rap vocals, rhythmic flow with ad-libs and vocal chops' },
      { trackName: 'fx', trackType: 'stems', displayName: 'FX', color: '#8b5cf6', localCaption: 'gun cocks, sirens, risers, and trap transition effects' },
    ],
  ),
  'indie-rock': buildTemplate(
    'indie-rock',
    'Indie Rock',
    'Driving guitars, punchy drums, and raw energy.',
    130,
    'A major',
    [
      { trackName: 'drums', trackType: 'stems', displayName: 'Drums', color: '#ef4444', localCaption: 'natural live drums, tight kick, cracking snare, open hi-hats, room mic warmth' },
      { trackName: 'bass', trackType: 'stems', displayName: 'Bass', color: '#f97316', localCaption: 'driving bass guitar with pick attack, punchy midrange, lock with kick drum' },
      { trackName: 'guitar', trackType: 'stems', displayName: 'Rhythm Guitar', color: '#eab308', localCaption: 'overdriven rhythm guitar with palm mutes and open chords, crunchy tone' },
      { trackName: 'custom', trackType: 'stems', displayName: 'Lead Guitar', color: '#22c55e', localCaption: 'clean to dirty lead guitar with delay, melodic riffs and bends' },
      { trackName: 'vocals', trackType: 'stems', displayName: 'Vocals', color: '#f43f5e', localCaption: 'raw indie vocal delivery, emotional and slightly raspy, upfront in the mix' },
    ],
  ),
  'jazz-combo': buildTemplate(
    'jazz-combo',
    'Jazz Combo',
    'Classic small ensemble with walking bass and improvisational space.',
    120,
    'Bb major',
    [
      { trackName: 'drums', trackType: 'stems', displayName: 'Drums', color: '#ef4444', localCaption: 'brushed jazz drums with swing feel, subtle ride cymbal, light touch' },
      { trackName: 'bass', trackType: 'stems', displayName: 'Upright Bass', color: '#f97316', localCaption: 'warm acoustic upright bass, walking bass lines, round pizzicato tone' },
      { trackName: 'keyboard', trackType: 'pianoRoll', displayName: 'Piano', color: '#22c55e', synthPreset: 'piano', localCaption: 'jazz piano comping with rich voicings, Herbie Hancock-inspired harmonic choices' },
      { trackName: 'brass', trackType: 'stems', displayName: 'Horn', color: '#eab308', localCaption: 'warm trumpet or saxophone melody, bebop phrasing, expressive dynamics' },
    ],
  ),
  'orchestral-cinematic': buildTemplate(
    'orchestral-cinematic',
    'Orchestral Cinematic',
    'Epic film scoring setup with strings, brass, woodwinds, and percussion.',
    100,
    'D minor',
    [
      { trackName: 'drums', trackType: 'stems', displayName: 'Percussion', color: '#ef4444', localCaption: 'epic orchestral percussion, timpani rolls, taiko hits, cymbal swells' },
      { trackName: 'strings', trackType: 'stems', displayName: 'Strings', color: '#3b82f6', localCaption: 'lush string ensemble, legato phrases, dramatic crescendos, wide vibrato' },
      { trackName: 'brass', trackType: 'stems', displayName: 'Brass', color: '#eab308', localCaption: 'powerful brass section, French horns and trumpets, heroic fanfares' },
      { trackName: 'woodwinds', trackType: 'stems', displayName: 'Woodwinds', color: '#22c55e', localCaption: 'delicate woodwind ensemble, flute and oboe melodies, pastoral countermelodies' },
      { trackName: 'vocals', trackType: 'stems', displayName: 'Choir', color: '#a855f7', localCaption: 'epic choir, latin chanting, dramatic vocal swells, ethereal harmonies' },
    ],
  ),
  'classical-chamber': buildTemplate(
    'classical-chamber',
    'Classical Chamber',
    'Intimate chamber ensemble for delicate classical writing.',
    96,
    'G major',
    [
      { trackName: 'keyboard', trackType: 'pianoRoll', displayName: 'Piano', color: '#22c55e', synthPreset: 'piano', localCaption: 'concert grand piano with expressive dynamics, classical phrasing and pedal work' },
      { trackName: 'strings', trackType: 'stems', displayName: 'Violin', color: '#3b82f6', localCaption: 'solo violin with vibrato, lyrical melodic lines, classical bow technique' },
      { trackName: 'bass', trackType: 'stems', displayName: 'Cello', color: '#f97316', localCaption: 'warm cello with rich tone, supporting bass lines and melodic passages' },
      { trackName: 'woodwinds', trackType: 'stems', displayName: 'Flute', color: '#eab308', localCaption: 'silver flute with breathy tone, ornamental trills and delicate passages' },
    ],
  ),
  'pop-production': buildTemplate(
    'pop-production',
    'Pop Production',
    'Radio-ready pop arrangement with punchy drums and vocal-forward mix.',
    110,
    'C major',
    [
      { trackName: 'drums', trackType: 'drumMachine', displayName: 'Drums', color: '#ef4444', localCaption: 'punchy pop drums, tight kick, snappy snare, shaker and tambourine' },
      { trackName: 'bass', trackType: 'pianoRoll', displayName: 'Bass', color: '#f97316', synthPreset: 'bass', localCaption: 'modern pop bass, clean sub with occasional slides, groove-locked' },
      { trackName: 'synth', trackType: 'pianoRoll', displayName: 'Synth Pad', color: '#8b5cf6', synthPreset: 'pad', localCaption: 'warm synth pad with gentle movement, fills harmonic space without dominating' },
      { trackName: 'vocals', trackType: 'stems', displayName: 'Lead Vocal', color: '#f43f5e', localCaption: 'clear pop vocal, upfront and intimate, tuned and polished delivery' },
      { trackName: 'backing_vocals', trackType: 'stems', displayName: 'Backing Vocals', color: '#ec4899', localCaption: 'layered backing harmonies, tight doubles, breathy ad-libs' },
    ],
  ),
  'rnb-soul': buildTemplate(
    'rnb-soul',
    'R&B / Soul',
    'Smooth grooves and warm keys with soulful vocal arrangements.',
    90,
    'Eb major',
    [
      { trackName: 'drums', trackType: 'sequencer', displayName: 'Drums', color: '#ef4444', localCaption: 'smooth R&B drums with swing, soft kick, rimshot snare, subtle ghost notes' },
      { trackName: 'bass', trackType: 'pianoRoll', displayName: 'Bass', color: '#f97316', synthPreset: 'bass', localCaption: 'warm fingerstyle bass with smooth legato, groove-locked with drums' },
      { trackName: 'keyboard', trackType: 'pianoRoll', displayName: 'Keys', color: '#22c55e', synthPreset: 'piano', localCaption: 'rhodes or wurlitzer electric piano with chorus, soulful 9th and 13th chords' },
      { trackName: 'guitar', trackType: 'stems', displayName: 'Guitar', color: '#eab308', localCaption: 'clean R&B guitar with subtle wah, rhythmic muted strums and fills' },
      { trackName: 'vocals', trackType: 'stems', displayName: 'Vocals', color: '#f43f5e', localCaption: 'smooth soulful vocal with melisma, intimate and dynamic delivery' },
    ],
  ),
  'world-fusion': buildTemplate(
    'world-fusion',
    'World Fusion',
    'Cross-cultural sonic exploration with traditional and modern elements.',
    105,
    'A minor',
    [
      { trackName: 'drums', trackType: 'stems', displayName: 'Percussion', color: '#ef4444', localCaption: 'world percussion ensemble, djembe, congas, tabla, shaker, polyrhythmic grooves' },
      { trackName: 'bass', trackType: 'pianoRoll', displayName: 'Bass', color: '#f97316', synthPreset: 'bass', localCaption: 'deep bass foundation blending acoustic and electronic, grounding the rhythm' },
      { trackName: 'synth', trackType: 'pianoRoll', displayName: 'Melody', color: '#22c55e', synthPreset: 'lead', localCaption: 'modal melodic instrument, sitar-like or koto-like phrases with ornaments' },
      { trackName: 'strings', trackType: 'pianoRoll', displayName: 'Pad', color: '#8b5cf6', synthPreset: 'pad', localCaption: 'warm ambient pad with ethnic texture, blending traditional and electronic' },
      { trackName: 'vocals', trackType: 'stems', displayName: 'Vocals', color: '#f43f5e', localCaption: 'world vocal style, chanting or melodic singing, culturally rich expression' },
    ],
  ),
};

// ── Public API ──────────────────────────────────────────────────────────────

export function getGenreTemplateById(id: string): ProjectTemplate | undefined {
  return TEMPLATE_MAP[id];
}

export function getGenreTemplatesByCategory(genre: string): GenreTemplateEntry[] {
  return GENRE_TEMPLATES.filter((t) => t.genre === genre);
}

export function getGenreCategories(): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const t of GENRE_TEMPLATES) {
    if (!seen.has(t.genre)) {
      seen.add(t.genre);
      result.push(t.genre);
    }
  }
  return result;
}
