/**
 * strudelArrangement — Genre-based Strudel arrangement scaffolding.
 *
 * Provides templates for common genres, each with 4 coordinated roles:
 * drums, bass, chords, melody. Creates 4 Strudel tracks at once.
 */

export interface StrudelArrangementTemplate {
  genre: string;
  drums: string;
  bass: string;
  chords: string;
  melody: string;
}

export const GENRE_TEMPLATES: StrudelArrangementTemplate[] = [
  {
    genre: 'house',
    drums: `s("bd*4, ~ cp ~ cp, [~ hh]*4").bank("RolandTR909")`,
    bass: `note("<c2 c2 f2 g2>").s("sawtooth").lpf(400).decay(.2).sustain(0)`,
    chords: `note("<[c4,e4,g4] [f4,a4,c5] [g4,b4,d5] [a4,c5,e5]>").s("sawtooth").lpf(1200).attack(.05).release(.3)`,
    melody: `note("c5 e5 g5 e5 f5 a5 g5 e5").s("triangle").lpf(2000).decay(.1).sustain(.3)`,
  },
  {
    genre: 'techno',
    drums: `s("bd*4, ~ cp ~ cp, hh*8").bank("RolandTR909").gain(1.2)`,
    bass: `note("<c2 c2 c2 [c2 d#2]>").s("sawtooth").lpf(300).decay(.1).sustain(0)`,
    chords: `note("<[c3,d#3,g3] [c3,d#3,g3] [f3,g#3,c4] [g3,a#3,d4]>").s("square").lpf(800).attack(.1).release(.5)`,
    melody: `note("c4 ~ d#4 ~ f4 ~ g4 ~").s("square").lpf(1500).decay(.05).sustain(.2)`,
  },
  {
    genre: 'hiphop',
    drums: `s("bd ~ ~ bd ~ ~ bd ~, ~ ~ ~ ~ cp ~ ~ ~, hh*8").bank("RolandTR808")`,
    bass: `note("<c2 ~ ~ c2 ~ f2 ~ g2>").s("sawtooth").lpf(250).decay(.3).sustain(.1)`,
    chords: `note("<[c4,e4,g4] ~ [f4,a4,c5] ~>").s("sawtooth").lpf(900).attack(.02).release(.4)`,
    melody: `note("c5 ~ e5 ~ g5 ~ e5 c5").s("triangle").lpf(3000).decay(.15).sustain(.2)`,
  },
  {
    genre: 'ambient',
    drums: `s("~ ~ ~ ~, ~ ~ hh ~").bank("RolandTR909").gain(.4)`,
    bass: `note("<c2 ~ ~ ~>").s("sine").lpf(200).attack(.5).release(2)`,
    chords: `note("<[c4,e4,g4,b4] [f4,a4,c5,e5] [g4,b4,d5,f#5] [a4,c5,e5,g5]>").s("sawtooth").lpf(600).attack(.3).release(1.5)`,
    melody: `note("c5 ~ ~ e5 ~ ~ g5 ~").s("sine").lpf(4000).attack(.2).release(1)`,
  },
  {
    genre: 'jazz',
    drums: `s("bd ~ ~ ~, ~ ~ cp ~, [hh hh hh ~]*2").bank("RolandTR909").gain(.6)`,
    bass: `note("<c2 e2 a2 g2>").s("sawtooth").lpf(350).decay(.2).sustain(.3)`,
    chords: `note("<[c4,e4,g4,b4] [a3,c4,e4,g4] [f4,a4,c5,e5] [g4,b4,d5,f5]>").s("sawtooth").lpf(1000).attack(.03).release(.5)`,
    melody: `note("c5 d5 e5 g5 a5 g5 e5 d5").s("triangle").lpf(2500).decay(.1).sustain(.4)`,
  },
  {
    genre: 'rock',
    drums: `s("bd ~ bd ~, ~ cp ~ cp, hh*8").bank("RolandTR909").gain(1)`,
    bass: `note("<c2 c2 f2 g2>").s("sawtooth").lpf(500).decay(.15).sustain(.2)`,
    chords: `note("<[c4,e4,g4] [c4,e4,g4] [f4,a4,c5] [g4,b4,d5]>").s("square").lpf(2000).attack(.01).release(.2)`,
    melody: `note("c5 d5 e5 g5 e5 d5 c5 ~").s("square").lpf(3000).decay(.08).sustain(.3)`,
  },
];

const DEFAULT_GENRE = 'house';

/**
 * Look up a genre template (case-insensitive). Falls back to house.
 */
export function getArrangementTemplate(genre: string): StrudelArrangementTemplate {
  const normalized = genre.toLowerCase().trim();
  return GENRE_TEMPLATES.find((t) => t.genre === normalized) ?? GENRE_TEMPLATES.find((t) => t.genre === DEFAULT_GENRE)!;
}
