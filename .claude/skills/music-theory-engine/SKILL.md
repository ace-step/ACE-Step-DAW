---
name: music-theory-engine
version: 2.0.0
description: |
  Process-oriented music theory skill for AI-assisted composition in ACE-Step-DAW.
  Instead of dumping all theory upfront, this skill teaches Claude HOW to research,
  analyze, and apply music theory for a specific composition task.
  Invoke when composing, arranging, or analyzing music.
---

# Music Theory Engine — Process-Oriented

> This skill is a **process guide**, not a knowledge dump.
> It teaches you how to research the right theory for each task,
> not memorize everything upfront.

---

## Core Principle

**Real composers don't memorize all theory — they research what they need for each piece.**

Your workflow for any composition task:

```
1. RESEARCH   → What does this genre/style actually sound like?
2. ANALYZE    → What patterns, chords, rhythms define it?
3. EXTRACT    → What are the 2-3 key principles I need?
4. COMPOSE    → Apply those principles to create something new
5. EVALUATE   → Does it sound right? Does it match the reference?
```

---

## Phase 1: RESEARCH — Finding the Right Reference

### How to Research a Genre or Style

When asked to compose in a genre you need to understand better:

1. **Search for theory analysis** of that genre:
   - Search the web: `"{genre}" chord progressions analysis`
   - Search the web: `"{genre}" song structure common patterns`
   - Search the web: `"{genre}" rhythm patterns drum programming`
   - Search the web: `"{genre}" bass line techniques`

2. **Find specific reference songs** the user mentions or that define the genre:
   - Search the web: `"{song name}" chord progression key BPM`
   - Search the web: `"{song name}" music analysis breakdown`
   - Look for sites like Hooktheory, Chordify, Ultimate Guitar for real analyses

3. **Find Strudel/TidalCycles examples** in that style:
   - Search the web: `site:strudel.cc "{genre}" OR "{style}"`
   - Search the web: `TidalCycles "{genre}" pattern example`
   - Search the web: `strudel music pattern "{genre}"`

4. **Read the DAW's existing presets** for genre hints:
   - Read `src/constants/generationPresets.ts` for genre-specific defaults

### What to Extract from Research

For each genre/style, identify these 5 elements:
- **Key/Scale**: What key and scale is most common? (e.g., minor pentatonic for blues)
- **Chord Language**: What chord types and progressions define it? (e.g., 7th chords for jazz)
- **Rhythmic Feel**: Straight 8ths? Swing? Syncopated? What's the drum backbone?
- **Texture**: Sparse or dense? What instruments? What register?
- **Form**: How long are sections? What's the energy curve?

---

## Phase 2: ANALYZE — Extracting Patterns from References

### Chord Progression Analysis Process

When you find a reference song's chords:

1. **Identify the key** — what note feels like "home"?
2. **Convert to Roman numerals** — this reveals the pattern independent of key
   - In C major: C=I, Dm=ii, Em=iii, F=IV, G=V, Am=vi, Bdim=vii°
   - In C minor (natural): Cm=i, Ddim=ii°, Eb=III, Fm=iv, Gm=v, Ab=VI, Bb=VII
   - **Important**: In practice, minor keys use V (major) from harmonic minor for dominant function. In C minor: G major (V), not Gm (v). The raised 7th (B natural) creates the leading tone → tonic resolution.
3. **Identify the function** of each chord:
   - **Tonic** (I/i, vi/VI, iii/III): stability, home
   - **Subdominant** (IV/iv, ii/ii°): movement, departure
   - **Dominant** (V, vii°): tension, wants to resolve to tonic
4. **Note the voicing** — are chords simple triads or extended (7ths, 9ths)?
5. **Note the rhythm** — how many beats per chord? Any syncopation?

### Melody Analysis Process

When analyzing a reference melody:

1. **Identify scale degrees used** — mostly pentatonic? Full diatonic? Chromatic passing tones?
2. **Map the contour** — does it arch up then down? Descend? Oscillate?
3. **Identify the motif** — what's the smallest repeating melodic idea (2-4 notes)?
4. **Note rhythmic patterns** — long notes on strong beats? Syncopation?
5. **Check chord-tone alignment** — are chord tones on strong beats?

### Rhythm Analysis Process

1. **Identify the pulse** — where do you tap your foot?
2. **Map the kick pattern** — where are the bass drum hits?
3. **Map the snare/clap** — typically beats 2 & 4 (backbeat) or elsewhere?
4. **Map the hi-hat/ride** — what subdivision? (8ths, 16ths, triplets?)
5. **Identify ghost notes** — soft hits between main beats
6. **Note swing amount** — straight, light swing, hard swing?

---

## Phase 3: EXTRACT — Distilling Principles

### The "2-4 Principles" Rule

For any composition task, distill your research into 2-4 key principles (default: 3).
More than 4 leads to overconstrained, mechanical output. Fewer than 2 is too vague.
Simple genres (punk, ambient) may need only 2. Complex genres (jazz, progressive) may need 4.

**Example: Lo-Fi Hip-Hop**
1. Jazz-influenced chords (7ths, 9ths) with Dorian color
2. Laid-back drums (slightly behind the beat, ghost notes, 70-90 BPM)
3. Sparse, pentatonic melody with lots of space and reverb/delay

**Example: EDM Drop**
1. Four-on-the-floor kick with off-beat hi-hats at 128 BPM
2. Minor key, simple progression (often just 2 chords), heavy bass
3. Energy contrast: stripped breakdown → full drop

**Example: Jazz Ballad**
1. Extended harmony (maj7, m9, 13) with smooth voice leading
2. Rubato/free timing feel, brushes on drums, walking or pedal bass
3. Melody uses chromatic approach tones, telling a story with dynamics

### Output: Composition Brief

After research and extraction, write a brief BEFORE composing:

```
Genre: Lo-Fi Hip-Hop
Key: C Dorian (C D Eb F G A Bb)
BPM: 82
Feel: Laid-back, nostalgic, warm

Principle 1: Chord voicings — Cm9, Fm9, Dm7b5, G7b9 (i-iv-iiø-V7 in C minor, jazz extensions)
Principle 2: Rhythm — Boom-bap kick pattern, ghost snares, lazy hi-hats at 0.2-0.4 velocity
Principle 3: Texture — Rhodes/piano chords, sparse pentatonic melody, sub bass, vinyl crackle feel

Reference: Nujabes "Feather", J Dilla "Donuts"
```

---

## Phase 4: COMPOSE — Applying Principles

### Construction Order

Build from the ground up, each layer informed by research:

1. **Harmonic foundation** — chord progression (from analyzed patterns)
2. **Rhythmic foundation** — drum pattern (from genre research)
3. **Bass** — follows chords, uses genre-appropriate movement
4. **Melody/lead** — uses extracted scale, respects contour principles
5. **Texture/atmosphere** — pads, effects, fills (from reference analysis)

### Key Constraints (Always Apply)

These are universal — not genre-specific:

- **All pitched parts must be in the same key** — verify scale compatibility
- **Bass notes land on chord roots at strong beats** — minimum harmonic anchor
- **Bass register**: octave 2-3 (MIDI 36-71). Octave 1 (MIDI 24-35) is too low for most speakers
- **Velocity must vary** — no flat velocity; use 0.3-0.9 range with natural variation
  - Drums: 0.3-0.9 (ghost notes low, accents high)
  - Pads/chords: 0.3-0.5 (sit back in the mix)
  - Melody: 0.5-0.8 (expressive, varied)
- **Leave space** — rests are musical; don't fill every beat
- **Sound sources**: every pitched `note()` needs `.s("instrument")`. For drums, use `s("bd sd hh").bank("KitName")`
- **Time signature matters**: default is 4/4 (4 beats per cycle). For 3/4 waltz, use 3-beat patterns. For 6/8, subdivide accordingly

### Strudel Syntax Essentials (Minimum Viable)

Only the syntax you need to know to output patterns:

```javascript
note("c4 e4 g4")           // named notes (sharps: cs4, flats: eb4)
s("bd sd hh").bank("RolandTR808")  // drum sounds
stack(part1, part2, part3)  // layer simultaneously
note("c4 [d4 e4] f4 g4")   // subdivide: d4+e4 share one beat
note("c4@2 e4 g4")          // c4 held for 2 beats
note("c4 ~ e4 ~")           // ~ = rest
note("[c3,e3,g3]")          // comma = chord (simultaneous notes)
.velocity("0.7 0.5 0.8")   // per-note dynamics
.lpf(800).room(0.3)         // filter, reverb
.fast(2) / .slow(2)         // speed transform
```

**Critical Strudel gotchas:**
- `<a b c>` = **alternation** (one per cycle, rotating) — NOT a chord!
- `[a,b,c]` = **chord** (simultaneous) — use commas
- `[a b c]` = **subdivision** (squeeze into one beat) — no commas
- Sharps: `cs4` `fs4` (NOT `c#4`) — Strudel uses `s` suffix
- Flats: `eb4` `bb4` (NOT `e-flat4`) — Strudel uses `b` suffix

For advanced Strudel syntax, **search the docs**:
- Search the web: `strudel.cc documentation {specific feature}`

### Key Transposition Process

When transposing to a different key:

1. Calculate the interval in semitones (e.g., C→Eb = +3)
2. Shift every note name by that interval
3. Be consistent with enharmonic spelling: in flat keys use flats (eb, bb), in sharp keys use sharps (cs, fs)
4. Verify: after transposition, check all notes still belong to the target scale

---

## Phase 5: EVALUATE — Quality Check

After composing, verify against your 2-4 principles:

1. **Does it match the genre feel?** — Compare against research/reference
2. **Are the chords voiced correctly?** — Check intervals, no wrong notes
3. **Does the rhythm groove?** — Imagine it playing; does the kick/snare pattern feel right?
4. **Is it musical?** — Space, dynamics, contour — not just "correct notes"
5. **Would the user recognize the genre?** — If asked for lo-fi, does it sound lo-fi?
6. **Does the code run?** — If Strudel evaluation fails, read the error, fix syntax, re-evaluate

If any check fails, go back to the relevant phase and refine.

---

## When You Don't Know Something

**Don't guess — research.**

| Situation | Action |
|-----------|--------|
| Don't know the genre's typical chords | Search the web: `"{genre}" common chord progressions` |
| Don't know the right scale | Search the web: `"{genre}" scales modes used` |
| Don't know the drum pattern | Search the web: `"{genre}" drum pattern programming` |
| Don't know the BPM range | Search the web: `"{genre}" typical BPM tempo` |
| User references a specific song | Search the web: `"{song}" chords key BPM analysis` |
| Don't know a Strudel feature | Search the web: `strudel.cc {feature name}` |
| Not sure about a voicing | Reason from intervals: root + intervals in semitones |

**The MIDI pitch table is the ONE thing worth memorizing:**
Middle C = `c4` = MIDI 60. Each octave = 12 semitones. Sharps use `s` (not `#`): `cs4`, `fs4`.

---

## Related Skills

- **strudel-maestro** — How to write Strudel patterns (syntax, prototyping, refinement)
- **compose** — Full song composition workflow that orchestrates this skill and strudel-maestro
