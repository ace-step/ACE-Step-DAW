/**
 * Genre-specific Strudel pattern presets for agents and users.
 * Each preset provides 4 roles: drums, bass, chords, melody.
 * Used by scaffoldStrudelArrangement (Phase 2) and as starter templates.
 */

export interface StrudelPreset {
  drums: string;
  bass: string;
  chords: string;
  melody: string;
}

export const STRUDEL_PRESETS: Record<string, StrudelPreset> = {
  'lo-fi-hip-hop': {
    drums: 'bd [~ bd] sd [hh hh]',
    bass: '[c2 ~ eb2 ~] [f2 ~ ab2 ~]',
    chords: '[c4,eb4,g4] ~ [f4,ab4,c5] ~',
    melody: '~ g4 ~ eb4 c4 ~ ~ ~',
  },
  'techno': {
    drums: 'bd bd bd bd',
    bass: 'c2 ~ c2 ~ c2 ~ c2 [~ c2]',
    chords: '~ [c4,e4,g4] ~ [c4,e4,g4]',
    melody: '~ ~ c5 ~ ~ ~ e5 ~',
  },
  'jazz': {
    drums: '[hh hh] [hh hh] [hh hh] [hh hh]',
    bass: 'c2 e2 g2 a2',
    chords: '[c4,e4,g4,bb4] ~ [f4,a4,c5,e5] ~',
    melody: 'c5 d5 e5 g5 a5 g5 e5 d5',
  },
  'ambient': {
    drums: '~ ~ ~ ~',
    bass: 'c2 ~ ~ ~ ~ ~ ~ ~',
    chords: '[c4,e4,g4] ~ ~ ~ [a3,c4,e4] ~ ~ ~',
    melody: '~ ~ g5 ~ ~ ~ e5 ~',
  },
  'drum-and-bass': {
    drums: 'bd ~ [~ bd] ~ sd ~ [~ bd] ~',
    bass: 'c2 ~ c2 c2 ~ c2 ~ c2',
    chords: '[c4,eb4,g4] ~ ~ ~ [ab3,c4,eb4] ~ ~ ~',
    melody: 'c5 ~ eb5 ~ g5 ~ eb5 ~',
  },
  'house': {
    drums: 'bd [~ hh] bd [~ hh]',
    bass: 'c2 ~ ~ c2 ~ ~ c2 ~',
    chords: '~ [c4,e4,g4] ~ [c4,e4,g4]',
    melody: 'g5 ~ e5 ~ c5 ~ e5 ~',
  },
  'trap': {
    drums: 'bd ~ ~ bd ~ ~ sd ~',
    bass: 'c2 ~ ~ ~ c2 ~ ~ ~',
    chords: '[c4,eb4,g4] ~ ~ ~ ~ ~ ~ ~',
    melody: 'c5 eb5 g5 ~ c6 ~ g5 eb5',
  },
  'classical': {
    drums: '~ ~ ~ ~',
    bass: 'c2 g2 e2 g2',
    chords: '[c4,e4,g4] [e4,g4,c5] [f4,a4,c5] [g4,b4,d5]',
    melody: 'c5 d5 e5 f5 g5 f5 e5 d5',
  },
  'reggae': {
    drums: 'bd ~ sd ~',
    bass: 'c2 ~ c2 c2 ~ ~ c2 ~',
    chords: '~ [c4,e4,g4] ~ [c4,e4,g4]',
    melody: 'g4 ~ c5 ~ e5 ~ c5 ~',
  },
  'funk': {
    drums: 'bd [~ hh] sd [hh ~ hh]',
    bass: 'c2 ~ c2 [~ c2] eb2 ~ c2 ~',
    chords: '~ [c4,eb4,g4] ~ [c4,eb4,g4]',
    melody: 'c5 ~ eb5 c5 g4 ~ eb5 ~',
  },
};

export const STRUDEL_GENRE_NAMES = Object.keys(STRUDEL_PRESETS);
