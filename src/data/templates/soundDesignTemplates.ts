/**
 * Sound Design Template Library — genre-specific preset collections.
 *
 * Each template defines a set of pre-configured tracks with instrument settings,
 * AI generation prompt suggestions, and sonic roles — giving users a
 * genre-appropriate starting point instead of a blank canvas.
 *
 * Part of #1229 (Sound Design & Timbre System epic).
 */

import type { TrackName, TrackType, InstrumentKind, ProjectTemplate, ProjectTemplateTrack } from '../../types/project';
import { getPresetById } from '../instrumentPresets';
import { DEFAULT_GENERATION, DEFAULT_MEASURES } from '../../constants/defaults';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrackTemplate {
  /** Sonic role of this track (e.g. "Lead Synth", "Sub Bass", "Drums"). */
  role: string;
  /** Track name category. */
  trackName: TrackName;
  /** Track type. */
  trackType: TrackType;
  /** Display name shown in the UI. */
  displayName: string;
  /** Track color (hex). */
  color: string;
  /** AI stem description — used as prompt suggestion for generation. */
  stemDescription: string;
  /** Instrument kind hint (subtractive, fm, wavetable). */
  instrumentKind?: InstrumentKind;
  /** Factory preset ID to apply (from instrumentPresets). */
  presetId?: string;
  /** Initial volume (0–1). */
  volume?: number;
  /** Initial pan (-1 to +1). */
  pan?: number;
}

export interface TemplateGenerationDefaults {
  /** Suggested global caption / song description for AI generation. */
  globalCaption: string;
}

export interface SoundDesignTemplate {
  id: string;
  name: string;
  genre: string;
  description: string;
  tracks: TrackTemplate[];
  generationDefaults: TemplateGenerationDefaults;
}

// ---------------------------------------------------------------------------
// Factory Templates
// ---------------------------------------------------------------------------

export const SOUND_DESIGN_TEMPLATES: readonly SoundDesignTemplate[] = [
  // ── Lo-fi Hip Hop ──────────────────────────────────────────────────────
  {
    id: 'template-lofi-hip-hop',
    name: 'Lo-fi Hip Hop',
    genre: 'Hip Hop',
    description: 'Mellow keys, vinyl-textured drums, warm bass, and ambient textures for chill beats.',
    tracks: [
      {
        role: 'Keys / Rhodes',
        trackName: 'keyboard',
        trackType: 'pianoRoll',
        displayName: 'Lo-fi Keys',
        color: '#8b5cf6',
        stemDescription: 'warm mellow rhodes piano with vinyl crackle, lo-fi hip hop jazzy chords',
        instrumentKind: 'subtractive',
        presetId: 'factory-electric-piano',
        volume: 0.7,
      },
      {
        role: 'Bass',
        trackName: 'bass',
        trackType: 'pianoRoll',
        displayName: 'Warm Bass',
        color: '#f97316',
        stemDescription: 'warm deep sub bass, smooth round tone, lo-fi hip hop',
        instrumentKind: 'subtractive',
        presetId: 'factory-sub-bass',
        volume: 0.75,
      },
      {
        role: 'Drums',
        trackName: 'drums',
        trackType: 'stems',
        displayName: 'Vinyl Drums',
        color: '#ef4444',
        stemDescription: 'lo-fi dusty boom bap drum break with vinyl crackle, mellow kick and snappy snare',
        volume: 0.8,
      },
      {
        role: 'Ambient Texture',
        trackName: 'fx',
        trackType: 'stems',
        displayName: 'Ambient Pad',
        color: '#06b6d4',
        stemDescription: 'ambient lo-fi texture pad with tape hiss and warm reverb atmosphere',
        volume: 0.4,
      },
    ],
    generationDefaults: {
      globalCaption: 'chill lo-fi hip hop beat, jazzy piano chords, vinyl crackle, mellow boom bap drums, warm analog bass, relaxing ambient atmosphere',
    },
  },

  // ── Synthwave / Retrowave ──────────────────────────────────────────────
  {
    id: 'template-synthwave',
    name: 'Synthwave',
    genre: 'Electronic',
    description: 'Analog polysynths, arpeggiated bass, 80s drum machines, and lush pads for retro-futuristic vibes.',
    tracks: [
      {
        role: 'Lead Synth',
        trackName: 'synth',
        trackType: 'pianoRoll',
        displayName: 'Retro Lead',
        color: '#ec4899',
        stemDescription: 'bright analog synth lead with portamento, 80s synthwave retro tone',
        instrumentKind: 'subtractive',
        presetId: 'factory-saw-lead',
        volume: 0.7,
      },
      {
        role: 'Arpeggio Bass',
        trackName: 'bass',
        trackType: 'pianoRoll',
        displayName: 'Synth Bass',
        color: '#f97316',
        stemDescription: 'pulsing analog synth bass arpeggio, dark and driving, synthwave style',
        instrumentKind: 'subtractive',
        presetId: 'factory-saw-bass',
        volume: 0.75,
      },
      {
        role: 'Pad',
        trackName: 'synth',
        trackType: 'pianoRoll',
        displayName: 'Lush Pad',
        color: '#8b5cf6',
        stemDescription: 'wide lush analog pad with slow attack, warm detuned synthwave atmosphere',
        instrumentKind: 'subtractive',
        presetId: 'factory-warm-pad',
        volume: 0.5,
      },
      {
        role: 'Drums',
        trackName: 'drums',
        trackType: 'stems',
        displayName: '80s Drums',
        color: '#ef4444',
        stemDescription: 'punchy 80s electronic drum machine, gated reverb snare, tight kick, synthwave',
        volume: 0.8,
      },
    ],
    generationDefaults: {
      globalCaption: 'synthwave retrowave track, analog polysynth leads, lush detuned pads, pulsing arpeggiated bass, 80s drum machine, nostalgic retro-futuristic atmosphere',
    },
  },

  // ── Orchestral Cinematic ───────────────────────────────────────────────
  {
    id: 'template-orchestral-cinematic',
    name: 'Orchestral Cinematic',
    genre: 'Orchestral',
    description: 'Strings, brass, woodwinds, and percussion for epic cinematic compositions.',
    tracks: [
      {
        role: 'Strings',
        trackName: 'strings',
        trackType: 'stems',
        displayName: 'Strings',
        color: '#a855f7',
        stemDescription: 'lush orchestral string section, legato violins and cellos, cinematic and emotional',
        volume: 0.75,
      },
      {
        role: 'Brass',
        trackName: 'brass',
        trackType: 'stems',
        displayName: 'Brass',
        color: '#eab308',
        stemDescription: 'powerful orchestral brass section, french horns and trumpets, epic cinematic',
        volume: 0.7,
      },
      {
        role: 'Woodwinds',
        trackName: 'woodwinds',
        trackType: 'stems',
        displayName: 'Woodwinds',
        color: '#22c55e',
        stemDescription: 'delicate woodwind section, flutes and clarinets, orchestral cinematic texture',
        volume: 0.6,
      },
      {
        role: 'Percussion',
        trackName: 'percussion',
        trackType: 'stems',
        displayName: 'Timpani & Perc',
        color: '#ef4444',
        stemDescription: 'epic orchestral percussion, timpani rolls, cymbals, cinematic impact hits',
        volume: 0.8,
      },
    ],
    generationDefaults: {
      globalCaption: 'epic orchestral cinematic score, lush string legato, powerful brass fanfare, delicate woodwinds, timpani percussion, emotional and dramatic',
    },
  },

  // ── Trap / Hip Hop ─────────────────────────────────────────────────────
  {
    id: 'template-trap',
    name: 'Trap / Hip Hop',
    genre: 'Hip Hop',
    description: '808 bass, rolling hi-hats, hard-hitting snares, and melodic synth leads for modern trap.',
    tracks: [
      {
        role: '808 Bass',
        trackName: 'bass',
        trackType: 'pianoRoll',
        displayName: '808 Bass',
        color: '#f97316',
        stemDescription: 'deep distorted 808 bass slide, hard-hitting sub bass, trap hip hop',
        instrumentKind: 'subtractive',
        presetId: 'factory-sub-bass',
        volume: 0.85,
      },
      {
        role: 'Hi-Hats',
        trackName: 'drums',
        trackType: 'stems',
        displayName: 'Hi-Hats',
        color: '#eab308',
        stemDescription: 'rapid rolling trap hi-hats with triplet patterns, crisp and bright',
        volume: 0.7,
      },
      {
        role: 'Snare & Kick',
        trackName: 'drums',
        trackType: 'stems',
        displayName: 'Kick & Snare',
        color: '#ef4444',
        stemDescription: 'punchy trap kick with hard-hitting snare and clap layered, aggressive',
        volume: 0.8,
      },
      {
        role: 'Melodic Lead',
        trackName: 'synth',
        trackType: 'pianoRoll',
        displayName: 'Melody',
        color: '#8b5cf6',
        stemDescription: 'dark melodic synth lead with auto-tune effect, trap hip hop melody',
        instrumentKind: 'subtractive',
        presetId: 'factory-saw-lead',
        volume: 0.65,
      },
    ],
    generationDefaults: {
      globalCaption: 'dark trap hip hop beat, heavy distorted 808 bass slides, rolling triplet hi-hats, punchy kick and snare, melodic synth lead',
    },
  },

  // ── Indie Rock ─────────────────────────────────────────────────────────
  {
    id: 'template-indie-rock',
    name: 'Indie Rock',
    genre: 'Rock',
    description: 'Electric guitars, bass guitar, acoustic drums, and vocals for indie rock productions.',
    tracks: [
      {
        role: 'Electric Guitar',
        trackName: 'guitar',
        trackType: 'stems',
        displayName: 'Electric Guitar',
        color: '#ef4444',
        stemDescription: 'jangly electric guitar with light overdrive, indie rock clean-to-crunch tone',
        volume: 0.7,
      },
      {
        role: 'Bass Guitar',
        trackName: 'bass',
        trackType: 'stems',
        displayName: 'Bass Guitar',
        color: '#f97316',
        stemDescription: 'round warm bass guitar, fingerstyle indie rock groove',
        volume: 0.75,
      },
      {
        role: 'Drums',
        trackName: 'drums',
        trackType: 'stems',
        displayName: 'Acoustic Drums',
        color: '#eab308',
        stemDescription: 'punchy acoustic drum kit, tight kick, snappy snare, indie rock energy',
        volume: 0.8,
      },
      {
        role: 'Vocals',
        trackName: 'vocals',
        trackType: 'stems',
        displayName: 'Vocals',
        color: '#3b82f6',
        stemDescription: 'indie rock vocal, expressive and slightly raspy, mid-tempo singing',
        volume: 0.8,
      },
    ],
    generationDefaults: {
      globalCaption: 'indie rock track, jangly electric guitar with overdrive, warm bass guitar, punchy acoustic drums, expressive vocals, energetic and melodic',
    },
  },

  // ── EDM / House ────────────────────────────────────────────────────────
  {
    id: 'template-edm-house',
    name: 'EDM / House',
    genre: 'Electronic',
    description: 'Supersaw leads, sub bass, four-on-the-floor kicks, and energetic plucks for electronic dance music.',
    tracks: [
      {
        role: 'Supersaw Lead',
        trackName: 'synth',
        trackType: 'pianoRoll',
        displayName: 'Supersaw Lead',
        color: '#ec4899',
        stemDescription: 'bright energetic supersaw synth lead, wide stereo, EDM house anthem',
        instrumentKind: 'subtractive',
        presetId: 'factory-saw-lead',
        volume: 0.7,
      },
      {
        role: 'Sub Bass',
        trackName: 'bass',
        trackType: 'pianoRoll',
        displayName: 'Sub Bass',
        color: '#f97316',
        stemDescription: 'deep clean sub bass, tight and punchy, EDM house groove',
        instrumentKind: 'subtractive',
        presetId: 'factory-sub-bass',
        volume: 0.8,
      },
      {
        role: 'Drums',
        trackName: 'drums',
        trackType: 'stems',
        displayName: '4/4 Drums',
        color: '#ef4444',
        stemDescription: 'four-on-the-floor kick drum, offbeat hi-hats, clap on 2 and 4, EDM house',
        volume: 0.85,
      },
      {
        role: 'Pluck',
        trackName: 'synth',
        trackType: 'pianoRoll',
        displayName: 'Pluck Stab',
        color: '#22c55e',
        stemDescription: 'short bright pluck synth stab, rhythmic chord hits, EDM house energy',
        instrumentKind: 'subtractive',
        presetId: 'factory-pluck',
        volume: 0.6,
      },
    ],
    generationDefaults: {
      globalCaption: 'energetic EDM house track, bright supersaw lead, deep sub bass, four-on-the-floor kick, offbeat hi-hats, pluck chord stabs, dancefloor energy',
    },
  },

  // ── Jazz ───────────────────────────────────────────────────────────────
  {
    id: 'template-jazz',
    name: 'Jazz',
    genre: 'Jazz',
    description: 'Acoustic piano, upright bass, brush drums, and horn section for classic and modern jazz.',
    tracks: [
      {
        role: 'Piano',
        trackName: 'keyboard',
        trackType: 'pianoRoll',
        displayName: 'Jazz Piano',
        color: '#3b82f6',
        stemDescription: 'acoustic jazz piano, warm tone, complex voicings, swing feel comping',
        instrumentKind: 'subtractive',
        presetId: 'factory-electric-piano',
        volume: 0.7,
      },
      {
        role: 'Upright Bass',
        trackName: 'bass',
        trackType: 'stems',
        displayName: 'Upright Bass',
        color: '#f97316',
        stemDescription: 'acoustic upright double bass, walking bass line, warm woody jazz tone',
        volume: 0.75,
      },
      {
        role: 'Drums',
        trackName: 'drums',
        trackType: 'stems',
        displayName: 'Brush Drums',
        color: '#eab308',
        stemDescription: 'jazz brush drums, ride cymbal swing pattern, soft snare brushwork, subtle kick',
        volume: 0.7,
      },
      {
        role: 'Horn Section',
        trackName: 'brass',
        trackType: 'stems',
        displayName: 'Horn Section',
        color: '#a855f7',
        stemDescription: 'jazz horn section, warm trumpet and saxophone, bebop phrasing',
        volume: 0.65,
      },
    ],
    generationDefaults: {
      globalCaption: 'classic jazz combo, acoustic piano with rich voicings, walking upright bass, brush drums with swing feel, warm trumpet and saxophone, bebop harmony',
    },
  },

  // ── Ambient / Soundscape ───────────────────────────────────────────────
  {
    id: 'template-ambient',
    name: 'Ambient / Soundscape',
    genre: 'Ambient',
    description: 'Granular pads, reverb-drenched textures, and evolving soundscapes for meditative music.',
    tracks: [
      {
        role: 'Granular Pad',
        trackName: 'synth',
        trackType: 'pianoRoll',
        displayName: 'Granular Pad',
        color: '#06b6d4',
        stemDescription: 'evolving granular pad with long reverb tail, shimmering ambient texture',
        instrumentKind: 'wavetable',
        presetId: 'wt-vocal-formants',
        volume: 0.6,
      },
      {
        role: 'Reverb Keys',
        trackName: 'keyboard',
        trackType: 'pianoRoll',
        displayName: 'Reverb Keys',
        color: '#8b5cf6',
        stemDescription: 'sparse piano notes drenched in reverb, ambient ethereal atmosphere',
        instrumentKind: 'subtractive',
        presetId: 'factory-electric-piano',
        volume: 0.5,
      },
      {
        role: 'Drone Texture',
        trackName: 'fx',
        trackType: 'stems',
        displayName: 'Drone',
        color: '#14b8a6',
        stemDescription: 'deep ambient drone layer, slowly evolving harmonic texture, meditative',
        volume: 0.4,
      },
      {
        role: 'Field Recording',
        trackName: 'fx',
        trackType: 'stems',
        displayName: 'Field Recording',
        color: '#22c55e',
        stemDescription: 'subtle nature field recording, rain or forest ambience, atmospheric background',
        volume: 0.3,
      },
    ],
    generationDefaults: {
      globalCaption: 'ambient soundscape, evolving granular pads, sparse reverb-drenched piano, deep harmonic drone, subtle nature field recordings, meditative and peaceful',
    },
  },

  // ── Pop ────────────────────────────────────────────────────────────────
  {
    id: 'template-pop',
    name: 'Pop',
    genre: 'Pop',
    description: 'Modern drums, synth bass, vocal, and piano/keys for contemporary pop productions.',
    tracks: [
      {
        role: 'Vocals',
        trackName: 'vocals',
        trackType: 'stems',
        displayName: 'Lead Vocal',
        color: '#ec4899',
        stemDescription: 'modern pop vocal, clear and bright, catchy melody, polished production',
        volume: 0.85,
      },
      {
        role: 'Synth Bass',
        trackName: 'bass',
        trackType: 'pianoRoll',
        displayName: 'Pop Bass',
        color: '#f97316',
        stemDescription: 'modern synth bass, clean and punchy, pop groove, tight with kick',
        instrumentKind: 'subtractive',
        presetId: 'factory-square-bass',
        volume: 0.75,
      },
      {
        role: 'Drums',
        trackName: 'drums',
        trackType: 'stems',
        displayName: 'Pop Drums',
        color: '#ef4444',
        stemDescription: 'modern pop drums, tight kick and snare, crisp hi-hats, polished production',
        volume: 0.8,
      },
      {
        role: 'Keys / Synth',
        trackName: 'keyboard',
        trackType: 'pianoRoll',
        displayName: 'Piano/Keys',
        color: '#3b82f6',
        stemDescription: 'bright pop piano chords, modern synth keys, uplifting harmonic progression',
        instrumentKind: 'subtractive',
        presetId: 'factory-electric-piano',
        volume: 0.6,
      },
    ],
    generationDefaults: {
      globalCaption: 'modern pop track, catchy vocal melody, punchy synth bass, tight modern drums, bright piano chords, polished radio-ready production',
    },
  },

  // ── Classical Chamber ──────────────────────────────────────────────────
  {
    id: 'template-classical-chamber',
    name: 'Classical Chamber',
    genre: 'Classical',
    description: 'Piano, violin, cello, and clarinet for intimate classical chamber music.',
    tracks: [
      {
        role: 'Piano',
        trackName: 'keyboard',
        trackType: 'pianoRoll',
        displayName: 'Piano',
        color: '#3b82f6',
        stemDescription: 'classical acoustic piano, expressive dynamics, chamber music performance',
        instrumentKind: 'subtractive',
        presetId: 'factory-electric-piano',
        volume: 0.7,
      },
      {
        role: 'Violin',
        trackName: 'strings',
        trackType: 'stems',
        displayName: 'Violin',
        color: '#a855f7',
        stemDescription: 'solo violin, expressive vibrato, lyrical classical melody, chamber music',
        volume: 0.7,
      },
      {
        role: 'Cello',
        trackName: 'strings',
        trackType: 'stems',
        displayName: 'Cello',
        color: '#8b5cf6',
        stemDescription: 'rich cello, warm deep tone, legato classical phrasing, chamber music',
        volume: 0.7,
      },
      {
        role: 'Clarinet',
        trackName: 'woodwinds',
        trackType: 'stems',
        displayName: 'Clarinet',
        color: '#22c55e',
        stemDescription: 'solo clarinet, warm woody tone, lyrical classical phrasing, chamber music',
        volume: 0.65,
      },
    ],
    generationDefaults: {
      globalCaption: 'classical chamber music, expressive piano, lyrical violin melody, warm cello, clarinet woodwind, intimate and refined performance',
    },
  },

  // ── R&B / Neo Soul ─────────────────────────────────────────────────────
  {
    id: 'template-rnb',
    name: 'R&B / Neo Soul',
    genre: 'R&B',
    description: 'Smooth keys, warm bass, laid-back drums, and soulful vocals for R&B and neo-soul.',
    tracks: [
      {
        role: 'Neo Soul Keys',
        trackName: 'keyboard',
        trackType: 'pianoRoll',
        displayName: 'Soul Keys',
        color: '#8b5cf6',
        stemDescription: 'warm neo soul electric piano, rich jazzy chords, smooth R&B groove',
        instrumentKind: 'subtractive',
        presetId: 'factory-electric-piano',
        volume: 0.7,
      },
      {
        role: 'Bass',
        trackName: 'bass',
        trackType: 'pianoRoll',
        displayName: 'Smooth Bass',
        color: '#f97316',
        stemDescription: 'smooth warm bass, fingerstyle groove, R&B neo soul pocket',
        instrumentKind: 'subtractive',
        presetId: 'factory-sub-bass',
        volume: 0.75,
      },
      {
        role: 'Drums',
        trackName: 'drums',
        trackType: 'stems',
        displayName: 'Laid-back Drums',
        color: '#eab308',
        stemDescription: 'laid-back R&B drums, soft kick and snare, brushed hi-hats, neo soul groove',
        volume: 0.75,
      },
      {
        role: 'Vocals',
        trackName: 'vocals',
        trackType: 'stems',
        displayName: 'Soul Vocal',
        color: '#ec4899',
        stemDescription: 'smooth R&B vocal, soulful and expressive, warm tone, neo soul melisma',
        volume: 0.85,
      },
    ],
    generationDefaults: {
      globalCaption: 'smooth R&B neo soul track, warm electric piano chords, deep bass groove, laid-back drums, soulful expressive vocals, intimate and warm production',
    },
  },

  // ── Metal / Hard Rock ──────────────────────────────────────────────────
  {
    id: 'template-metal',
    name: 'Metal / Hard Rock',
    genre: 'Rock',
    description: 'Heavy distorted guitars, thundering bass, double-kick drums, and aggressive vocals.',
    tracks: [
      {
        role: 'Rhythm Guitar',
        trackName: 'guitar',
        trackType: 'stems',
        displayName: 'Rhythm Guitar',
        color: '#ef4444',
        stemDescription: 'heavy distorted rhythm guitar, palm muting, down-tuned metal riffs, aggressive',
        volume: 0.75,
      },
      {
        role: 'Lead Guitar',
        trackName: 'guitar',
        trackType: 'stems',
        displayName: 'Lead Guitar',
        color: '#ec4899',
        stemDescription: 'screaming lead guitar solo, high gain, melodic metal shredding',
        volume: 0.7,
      },
      {
        role: 'Bass',
        trackName: 'bass',
        trackType: 'stems',
        displayName: 'Metal Bass',
        color: '#f97316',
        stemDescription: 'heavy bass guitar, distorted and aggressive, following guitar riffs, metal',
        volume: 0.75,
      },
      {
        role: 'Drums',
        trackName: 'drums',
        trackType: 'stems',
        displayName: 'Metal Drums',
        color: '#eab308',
        stemDescription: 'aggressive metal drums, double kick blast beats, crashing cymbals, thundering',
        volume: 0.85,
      },
    ],
    generationDefaults: {
      globalCaption: 'heavy metal track, distorted down-tuned rhythm guitars, screaming lead guitar, aggressive bass, double kick blast beat drums, powerful and intense',
    },
  },
];

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function getTemplateById(id: string): SoundDesignTemplate | undefined {
  return SOUND_DESIGN_TEMPLATES.find((t) => t.id === id);
}

export function getTemplatesByGenre(genre: string): SoundDesignTemplate[] {
  return SOUND_DESIGN_TEMPLATES.filter((t) => t.genre === genre);
}

export function getAllTemplateGenres(): string[] {
  return [...new Set(SOUND_DESIGN_TEMPLATES.map((t) => t.genre))];
}

/**
 * Convert a SoundDesignTemplate to a ProjectTemplate that can be used with
 * the store's `createProjectFromTemplate()` method.
 */
export function toProjectTemplate(
  template: SoundDesignTemplate,
  options?: { bpm?: number; keyScale?: string; timeSignature?: number },
): ProjectTemplate {
  const tracks: ProjectTemplateTrack[] = template.tracks.map((tt) => {
    const preset = tt.presetId ? getPresetById(tt.presetId) : undefined;
    return {
      trackName: tt.trackName,
      trackType: tt.trackType,
      displayName: tt.displayName,
      color: tt.color,
      volume: tt.volume ?? 0.8,
      pan: tt.pan,
      instrument: preset ? structuredClone(preset.instrument) : undefined,
      localCaption: tt.stemDescription,
    };
  });

  return {
    id: template.id,
    name: template.name,
    description: template.description,
    createdAt: Date.now(),
    bpm: options?.bpm ?? 120,
    keyScale: options?.keyScale ?? 'C major',
    timeSignature: options?.timeSignature ?? 4,
    measures: DEFAULT_MEASURES,
    tracks,
    generationDefaults: { ...DEFAULT_GENERATION },
  };
}
