import type { GrooveTemplate } from '../types/project';

/**
 * Factory groove presets that ship with the DAW.
 * Each groove defines timing offsets and velocity patterns
 * for common rhythmic feels (swing, shuffle, funk, etc.).
 */

let counter = 0;
function makeId(): string {
  return `factory-groove-${++counter}`;
}

function makeFactoryGroove(
  name: string,
  timingOffsets: number[],
  velocityPattern: number[],
  gridBeats: number,
  lengthBeats: number,
): GrooveTemplate {
  return {
    id: makeId(),
    name,
    timingOffsets,
    velocityPattern,
    gridBeats,
    lengthBeats,
    createdAt: 0,
  };
}

// ── 8th-note swing grooves (gridBeats = 0.5, lengthBeats = 2) ──────────

/** Light swing — subtle delay on upbeats */
const lightSwing8th = makeFactoryGroove(
  'Light Swing 8th',
  [0, 0.04, 0, 0.04],
  [1.1, 0.9, 1.1, 0.9],
  0.5,
  2,
);

/** Medium swing — classic jazz feel */
const mediumSwing8th = makeFactoryGroove(
  'Medium Swing 8th',
  [0, 0.08, 0, 0.08],
  [1.15, 0.85, 1.15, 0.85],
  0.5,
  2,
);

/** Hard swing — heavy triplet feel */
const hardSwing8th = makeFactoryGroove(
  'Hard Swing 8th',
  [0, 0.12, 0, 0.12],
  [1.2, 0.8, 1.2, 0.8],
  0.5,
  2,
);

// ── 16th-note swing grooves (gridBeats = 0.25, lengthBeats = 1) ────────

/** Light swing 16th — subtle */
const lightSwing16th = makeFactoryGroove(
  'Light Swing 16th',
  [0, 0.03, 0, 0.03],
  [1.1, 0.9, 1.0, 0.95],
  0.25,
  1,
);

/** Medium swing 16th */
const mediumSwing16th = makeFactoryGroove(
  'Medium Swing 16th',
  [0, 0.06, 0, 0.06],
  [1.15, 0.85, 1.05, 0.9],
  0.25,
  1,
);

// ── Shuffle grooves ────────────────────────────────────────────────────

/** Shuffle — alternating strong/weak 8th notes */
const shuffle = makeFactoryGroove(
  'Shuffle',
  [0, 0.1, 0, 0.1],
  [1.3, 0.7, 1.2, 0.8],
  0.5,
  2,
);

// ── Funk grooves (16th-note, 1-bar pattern) ────────────────────────────

/** Funk 16th — syncopated ghost notes */
const funk16th = makeFactoryGroove(
  'Funk 16th',
  [0, -0.02, 0.01, 0.04, 0, -0.02, 0.01, 0.04,
   0, -0.02, 0.01, 0.04, 0, -0.02, 0.01, 0.04],
  [1.3, 0.6, 0.8, 0.65, 1.2, 0.55, 0.85, 0.7,
   1.25, 0.6, 0.8, 0.65, 1.15, 0.55, 0.85, 0.7],
  0.25,
  4,
);

// ── Hip-hop grooves ────────────────────────────────────────────────────

/** Hip-hop lazy — slightly behind the beat */
const hipHopLazy = makeFactoryGroove(
  'Hip-Hop Lazy',
  [0.02, 0.06, 0.02, 0.06],
  [1.2, 0.8, 1.1, 0.85],
  0.5,
  2,
);

/** Lo-fi — relaxed, imprecise feel */
const lofi = makeFactoryGroove(
  'Lo-Fi',
  [0.03, 0.05, 0.01, 0.07],
  [1.1, 0.75, 1.05, 0.8],
  0.5,
  2,
);

// ── Latin grooves ──────────────────────────────────────────────────────

/** Bossa Nova — syncopated Latin feel (16th grid, 2-bar) */
const bossaNova = makeFactoryGroove(
  'Bossa Nova',
  [0, 0, 0.02, 0, 0, 0, 0.02, 0,
   0, 0, 0.02, 0, 0, 0, 0.02, 0],
  [1.2, 0.7, 1.0, 0.8, 1.1, 0.7, 1.0, 0.8,
   1.15, 0.7, 1.0, 0.8, 1.1, 0.7, 1.0, 0.8],
  0.25,
  4,
);

// ── Human feel ─────────────────────────────────────────────────────────

/** Human — subtle random-like imperfections */
const humanFeel = makeFactoryGroove(
  'Human Feel',
  [0.01, -0.01, 0.02, -0.005, 0.005, -0.015, 0.01, -0.01],
  [1.05, 0.97, 1.02, 0.98, 1.03, 0.96, 1.01, 0.99],
  0.5,
  4,
);

// ── Export ──────────────────────────────────────────────────────────────

export const FACTORY_GROOVES: GrooveTemplate[] = [
  lightSwing8th,
  mediumSwing8th,
  hardSwing8th,
  lightSwing16th,
  mediumSwing16th,
  shuffle,
  funk16th,
  hipHopLazy,
  lofi,
  bossaNova,
  humanFeel,
];

export type GrooveCategory = 'Swing' | 'Shuffle' | 'Funk' | 'Hip-Hop' | 'Latin' | 'Feel';

export const GROOVE_CATEGORIES: Record<string, GrooveCategory> = {
  'Light Swing 8th': 'Swing',
  'Medium Swing 8th': 'Swing',
  'Hard Swing 8th': 'Swing',
  'Light Swing 16th': 'Swing',
  'Medium Swing 16th': 'Swing',
  'Shuffle': 'Shuffle',
  'Funk 16th': 'Funk',
  'Hip-Hop Lazy': 'Hip-Hop',
  'Lo-Fi': 'Hip-Hop',
  'Bossa Nova': 'Latin',
  'Human Feel': 'Feel',
};

/** Get the category for a groove template by name. */
export function getGrooveCategory(name: string): GrooveCategory | 'Custom' {
  return GROOVE_CATEGORIES[name] ?? 'Custom';
}
