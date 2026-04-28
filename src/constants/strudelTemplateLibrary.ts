/**
 * Strudel Template Library — agent-optimized pattern templates.
 *
 * Each template provides:
 * - Ready-to-evaluate Strudel code
 * - Genre metadata (BPM range, complexity, instruments)
 * - Agent instructions for customization
 *
 * Used by AI agents via window.__strudelApi.listTemplates()
 * and as starting points for pattern generation workflows.
 */

export type TemplateComplexity = 'simple' | 'moderate' | 'complex';

export interface StrudelTemplate {
  id: string;
  genre: string;
  description: string;
  code: string;
  complexity: TemplateComplexity;
  bpmRange: { min: number; max: number };
  instruments: string[];
  agentInstructions: string;
}

export const STRUDEL_TEMPLATES: StrudelTemplate[] = [
  {
    id: 'techno-minimal',
    genre: 'techno',
    description: 'Minimal 4-on-the-floor techno with hi-hat groove',
    code: `stack(
  s("bd bd bd bd"),
  s("~ hh ~ hh").gain(0.6),
  s("~ ~ cp ~").gain(0.5)
)`,
    complexity: 'simple',
    bpmRange: { min: 125, max: 140 },
    instruments: ['bd', 'hh', 'cp'],
    agentInstructions: 'Modify by adding syncopated kicks (bd [~ bd]), varying hi-hat patterns, or layering with ride cymbal. Keep the 4/4 pulse.',
  },
  {
    id: 'house-deep',
    genre: 'house',
    description: 'Deep house groove with offbeat hi-hats and chord stabs',
    code: `stack(
  s("bd [~ hh] bd [~ hh]"),
  s("~ ~ cp ~").gain(0.5),
  note("[c4,e4,g4] ~ ~ [c4,e4,g4]").sound("piano").gain(0.4)
)`,
    complexity: 'moderate',
    bpmRange: { min: 118, max: 128 },
    instruments: ['bd', 'hh', 'cp', 'piano'],
    agentInstructions: 'Add bass with note("c2 ~ c2 ~").sound("sawtooth"). Vary chords with 7th extensions. Keep offbeat hi-hat feel.',
  },
  {
    id: 'lofi-hiphop',
    genre: 'lo-fi hip-hop',
    description: 'Laid-back lo-fi hip-hop with jazzy chords',
    code: `stack(
  s("bd [~ bd] sd [hh hh]"),
  note("[c4,eb4,g4] ~ [f4,ab4,c5] ~").sound("piano").gain(0.4),
  note("c2 ~ eb2 ~ f2 ~ ab2 ~").sound("sawtooth").gain(0.5)
)`,
    complexity: 'moderate',
    bpmRange: { min: 70, max: 90 },
    instruments: ['bd', 'sd', 'hh', 'piano', 'sawtooth'],
    agentInstructions: 'Use minor 7th and 9th chords. Add swing with .late(0.02). Try vinyl crackle texture with noise sample. Keep BPM low (75-85).',
  },
  {
    id: 'dnb-basic',
    genre: 'drum-and-bass',
    description: 'Classic drum & bass break with rolling bass',
    code: `stack(
  s("bd ~ [~ bd] ~ sd ~ [~ bd] ~"),
  s("hh*8").gain(0.4),
  note("c2 ~ c2 c2 ~ c2 ~ c2").sound("sawtooth").gain(0.6)
)`,
    complexity: 'moderate',
    bpmRange: { min: 160, max: 180 },
    instruments: ['bd', 'sd', 'hh', 'sawtooth'],
    agentInstructions: 'The Amen break pattern is key. Vary snare ghost notes with gain variations. Use fast bass patterns (16th notes). Try reese bass with detuned oscillators.',
  },
  {
    id: 'ambient-pad',
    genre: 'ambient',
    description: 'Atmospheric ambient pad with slow evolution',
    code: `stack(
  note("[c4,e4,g4] ~ ~ ~ [a3,c4,e4] ~ ~ ~").sound("piano").gain(0.3),
  note("c2 ~ ~ ~ ~ ~ ~ ~").sound("sawtooth").gain(0.2),
  note("~ ~ g5 ~ ~ ~ e5 ~").sound("triangle").gain(0.2)
)`,
    complexity: 'simple',
    bpmRange: { min: 60, max: 100 },
    instruments: ['piano', 'sawtooth', 'triangle'],
    agentInstructions: 'Use long sustain patterns with sparse notes. Add reverb-like depth by stacking octaves. Keep rhythmic density very low. Try whole-note or half-note chords.',
  },
  {
    id: 'jazz-swing',
    genre: 'jazz',
    description: 'Jazz swing with walking bass and ride cymbal',
    code: `stack(
  s("[hh hh] [hh hh] [hh hh] [hh hh]"),
  s("~ ~ ~ cp").gain(0.3),
  note("c2 e2 g2 a2").sound("sawtooth").gain(0.5),
  note("[c4,e4,g4,bb4] ~ [f4,a4,c5,e5] ~").sound("piano").gain(0.4)
)`,
    complexity: 'complex',
    bpmRange: { min: 100, max: 160 },
    instruments: ['hh', 'cp', 'sawtooth', 'piano'],
    agentInstructions: 'Use 7th, 9th, and 13th chord voicings. Walking bass should outline chord tones then approach notes. Add swing with .late(0.03). Try ii-V-I progressions.',
  },
  {
    id: 'trap-808',
    genre: 'trap',
    description: 'Trap beat with 808 bass and rolling hi-hats',
    code: `stack(
  s("bd ~ ~ bd ~ ~ sd ~"),
  s("hh*4 hh*8 hh*4 hh*8").gain(0.5),
  note("c2 ~ ~ ~ c2 ~ ~ ~").sound("sawtooth").gain(0.7)
)`,
    complexity: 'moderate',
    bpmRange: { min: 130, max: 160 },
    instruments: ['bd', 'sd', 'hh', 'sawtooth'],
    agentInstructions: 'Key feature: hi-hat rolls (hh*16, hh*32 for fills). 808 bass slides: note("c2 [c2 eb2]"). Add sparse melody on triangle or bell sound.',
  },
  {
    id: 'funk-groove',
    genre: 'funk',
    description: 'Funky groove with syncopated bass and guitar stabs',
    code: `stack(
  s("bd [~ hh] sd [hh ~ hh]"),
  s("~ ~ ~ cp").gain(0.3),
  note("c2 ~ c2 [~ c2] eb2 ~ c2 ~").sound("sawtooth").gain(0.6),
  note("~ [c4,eb4,g4] ~ [c4,eb4,g4]").sound("square").gain(0.3)
)`,
    complexity: 'complex',
    bpmRange: { min: 95, max: 120 },
    instruments: ['bd', 'hh', 'sd', 'cp', 'sawtooth', 'square'],
    agentInstructions: 'Syncopation is everything. Shift bass notes off the beat. Add wah-like filter sweeps. Ghost notes on snare (gain 0.1-0.3). Try chromatic approach notes in bass.',
  },
  {
    id: 'classical-minimal',
    genre: 'classical',
    description: 'Simple classical progression with arpeggiated chords',
    code: `stack(
  note("c2 g2 e2 g2").sound("sawtooth").gain(0.4),
  note("[c4,e4,g4] [e4,g4,c5] [f4,a4,c5] [g4,b4,d5]").sound("piano").gain(0.5),
  note("c5 d5 e5 f5 g5 f5 e5 d5").sound("triangle").gain(0.3)
)`,
    complexity: 'simple',
    bpmRange: { min: 70, max: 120 },
    instruments: ['sawtooth', 'piano', 'triangle'],
    agentInstructions: 'Use diatonic progressions (I-IV-V-vi). Add counterpoint with independent melody lines. Try arpeggiating chords: note("c4 e4 g4 c5") instead of block chords.',
  },
  {
    id: 'reggae-dub',
    genre: 'reggae',
    description: 'One-drop reggae with offbeat skank',
    code: `stack(
  s("bd ~ sd ~"),
  s("~ hh ~ hh").gain(0.5),
  note("~ [c4,e4,g4] ~ [c4,e4,g4]").sound("square").gain(0.3),
  note("c2 ~ c2 c2 ~ ~ c2 ~").sound("sawtooth").gain(0.5)
)`,
    complexity: 'simple',
    bpmRange: { min: 65, max: 85 },
    instruments: ['bd', 'sd', 'hh', 'square', 'sawtooth'],
    agentInstructions: 'The "one drop" puts kick and snare on beat 3 only (bd ~ sd ~). Offbeat chords are essential. Bass should be heavy and bouncy. Dub style: add delay/echo effects.',
  },
];

// ─── Query Functions ────────────────────────────────────────

export function getTemplateByGenre(genre: string): StrudelTemplate | undefined {
  return STRUDEL_TEMPLATES.find((t) => t.genre.toLowerCase() === genre.toLowerCase());
}

export function getTemplatesByComplexity(complexity: TemplateComplexity): StrudelTemplate[] {
  return STRUDEL_TEMPLATES.filter((t) => t.complexity === complexity);
}

export function getTemplatesByBpmRange(minBpm: number, maxBpm: number): StrudelTemplate[] {
  return STRUDEL_TEMPLATES.filter(
    (t) => t.bpmRange.min <= maxBpm && t.bpmRange.max >= minBpm,
  );
}
