---
name: music-theory-engine
version: 3.1.0
description: |
  Process guide for researching and applying music theory in composition tasks.
  Teaches the research flow and key analytical techniques.
  Load when composing, arranging, or analyzing music.
---

# Music Theory Engine

> Research what you need for each task. Don't guess — search for genre conventions,
> reference analyses, and specific theory you're unsure about.

## The Composition Research Process

```
RESEARCH → ANALYZE → EXTRACT PRINCIPLES → COMPOSE → EVALUATE
```

### Phase 1: RESEARCH

For any composition task, start by researching the target genre/style:

- Search for the genre's **chord progressions**, **scales**, **rhythm patterns**, **song structures**
- If the user named a reference song or artist, search for its specific analysis — this is the highest-value input
- Search for Strudel or TidalCycles examples in that style
- Read `src/constants/generationPresets.ts` for built-in genre defaults
- Look for Hooktheory, Chordify, music theory blog analyses

### Phase 2: ANALYZE

From references found, apply these analytical techniques:

#### Chord Progression Analysis

1. **Identify the key** — what note feels like "home"?
2. **Convert to Roman numerals** — reveals the pattern independent of key
   - Major: I, ii, iii, IV, V, vi, vii°
   - Minor (natural): i, ii°, III, iv, v, VI, VII
   - In practice, minor keys often use major V (from harmonic minor) for strong dominant pull
3. **Identify functional roles**:
   - Tonic (I/i, vi/VI): home, stability
   - Subdominant (IV/iv, ii): departure, movement
   - Dominant (V, vii°): tension that resolves to tonic
4. **Note the voicing complexity** — simple triads? 7ths? Extensions (9, 11, 13)?

#### Melody Analysis

1. **What scale degrees are used?** — pentatonic (safe, catchy) vs full diatonic vs chromatic
2. **What's the contour?** — arch (up then down), wave, ascending, descending
3. **What's the motif?** — the 2-4 note idea that repeats and develops
4. **Chord-tone alignment** — strong beats should land on chord tones; passing tones between

#### Rhythm Analysis

1. **Kick pattern** — defines the groove (four-on-floor, boom-bap, syncopated)
2. **Snare/clap placement** — typically beats 2 & 4 (backbeat) but varies by genre
3. **Hi-hat subdivision** — 8ths, 16ths, triplets? This defines the energy level
4. **Swing vs straight** — critical distinction between genres
5. **Ghost notes** — soft hits that add texture between main beats

### Phase 3: EXTRACT PRINCIPLES

Distill research into **2-4 composition principles** (default 3):
- One for **harmonic character** (what chords, what voicing style)
- One for **rhythmic character** (what drum pattern, what feel, what tempo)
- One for **textural character** (what instruments, what density, what space)

More than 4 = overconstrained output. Fewer than 2 = too vague.

Write a **Composition Brief** before any code:

```
Genre: [genre]
Key: [key + scale]
BPM: [tempo]
Feel: [mood/energy description]
Principles:
  1. [harmonic] — e.g., "jazz extensions (7th/9th chords), Dorian color, smooth voice leading"
  2. [rhythmic] — e.g., "boom-bap pattern, lazy ghost snares, 80 BPM"
  3. [textural] — e.g., "sparse pentatonic melody, Rhodes keys, sub bass, space and reverb"
Reference: [songs/artists that informed the principles]
Structure: [section layout with bar counts]
```

### Phase 4: COMPOSE

Build layer by layer, each informed by your principles:
1. **Chord progression** — from analyzed harmonic patterns
2. **Drum pattern** — from genre rhythm research
3. **Bass line** — follows chord roots, uses genre-appropriate movement style
4. **Melody** — uses the scale, favors chord tones on strong beats, develops a motif
5. **Texture** — pads, effects, atmosphere from reference analysis

**Voice leading between chords**: move each voice by the smallest interval. Keep common tones.
Resolve the leading tone (7th scale degree) upward. Avoid all voices leaping in the same direction.

**Melody construction**: start with a short motif (2-4 notes), then develop it — repeat, sequence (same rhythm at different pitch), invert, augment/diminish. Leave rests. Verse melody should be simpler/lower, chorus should be catchier/higher.

### Phase 5: EVALUATE

1. Does it match the genre feel from your research?
2. Are all pitched parts in the same key?
3. Do chords follow the progression you planned?
4. Does the rhythm groove? Is the kick-snare relationship right?
5. Is there dynamic variation (not flat velocity)?
6. Is there space (rests, not every beat filled)?
7. Does the code actually run? If evaluation fails, read the error and fix it.

## When You Don't Know Something

Search the web for the specific thing you need:
- Genre conventions: `"{genre}" chord progressions` / `"{genre}" drum patterns`
- Reference songs: `"{song}" chords key BPM analysis`
- Strudel syntax: search the Strudel docs at `strudel.cc`
- Music theory: `"{concept}" music theory explanation`

The one fact to keep in mind: Middle C = `c4` = MIDI 60. Strudel sharps use `s` suffix (`cs4`), flats use `b` suffix (`eb4`).

## Related Skills

- **strudel-maestro** — How to research and write Strudel patterns
- **compose** — Full composition workflow orchestrating both skills
