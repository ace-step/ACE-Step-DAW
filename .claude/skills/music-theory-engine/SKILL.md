---
name: music-theory-engine
version: 1.0.0
description: |
  Comprehensive music theory reference for AI-assisted composition in ACE-Step-DAW.
  Provides scales, chords, progressions, voice leading rules, rhythm patterns, and
  genre conventions. Load this skill when composing, arranging, or analyzing music.
  Invoke with /music-theory-engine or reference automatically from compose/jam skills.
---

# Music Theory Engine

> Reference skill for Claude Code music composition. Use this data when generating
> melodies, chord progressions, bass lines, drum patterns, or full arrangements.

---

## 1. Pitch Reference

### MIDI Note Numbers (Octave 4 = Middle C region)

| Note | Oct 0 | Oct 1 | Oct 2 | Oct 3 | Oct 4 | Oct 5 | Oct 6 | Oct 7 |
|------|-------|-------|-------|-------|-------|-------|-------|-------|
| C    | 12    | 24    | 36    | 48    | **60**| 72    | 84    | 96    |
| C#/Db| 13    | 25    | 37    | 49    | 61    | 73    | 85    | 97    |
| D    | 14    | 26    | 38    | 50    | 62    | 74    | 86    | 98    |
| D#/Eb| 15    | 27    | 39    | 51    | 63    | 75    | 87    | 99    |
| E    | 16    | 28    | 40    | 52    | 64    | 76    | 88    | 100   |
| F    | 17    | 29    | 41    | 53    | 65    | 77    | 89    | 101   |
| F#/Gb| 18    | 30    | 42    | 54    | 66    | 78    | 90    | 102   |
| G    | 19    | 31    | 43    | 55    | 67    | 79    | 91    | 103   |
| G#/Ab| 20    | 32    | 44    | 56    | 68    | 80    | 92    | 104   |
| A    | 21    | 33    | 45    | 57    | 69    | 81    | 93    | 105   |
| A#/Bb| 22    | 34    | 46    | 58    | 70    | 82    | 94    | 106   |
| B    | 23    | 35    | 47    | 59    | 71    | 83    | 95    | 107   |

**Strudel notation**: `c4` = MIDI 60, `a3` = MIDI 57. Sharps: `cs4`, Flats: `db4`.

---

## 2. Scales & Modes

### Interval Formulas (semitones from root)

| Scale | Intervals | Example in C | Character |
|-------|-----------|-------------|-----------|
| **Major (Ionian)** | 0 2 4 5 7 9 11 | C D E F G A B | Bright, happy |
| **Natural Minor (Aeolian)** | 0 2 3 5 7 8 10 | C D Eb F G Ab Bb | Sad, dark |
| **Harmonic Minor** | 0 2 3 5 7 8 11 | C D Eb F G Ab B | Exotic, tense |
| **Melodic Minor (asc)** | 0 2 3 5 7 9 11 | C D Eb F G A B | Jazz minor |
| **Dorian** | 0 2 3 5 7 9 10 | C D Eb F G A Bb | Minor but warm |
| **Mixolydian** | 0 2 4 5 7 9 10 | C D E F G A Bb | Bluesy major |
| **Lydian** | 0 2 4 6 7 9 11 | C D E F# G A B | Dreamy, floaty |
| **Phrygian** | 0 1 3 5 7 8 10 | C Db Eb F G Ab Bb | Spanish, dark |
| **Locrian** | 0 1 3 5 6 8 10 | C Db Eb F Gb Ab Bb | Unstable, rare |
| **Pentatonic Major** | 0 2 4 7 9 | C D E G A | Folk, pop, safe |
| **Pentatonic Minor** | 0 3 5 7 10 | C Eb F G Bb | Blues, rock |
| **Blues** | 0 3 5 6 7 10 | C Eb F F# G Bb | Blues, rock |
| **Whole Tone** | 0 2 4 6 8 10 | C D E F# G# A# | Dreamy, Debussy |
| **Diminished HW** | 0 1 3 4 6 7 9 10 | C Db Eb E F# G A Bb | Jazz tension |
| **Diminished WH** | 0 2 3 5 6 8 9 11 | C D Eb F Gb Ab A B | Over dim chords |
| **Bebop Dominant** | 0 2 4 5 7 9 10 11 | C D E F G A Bb B | Jazz lines |
| **Chromatic** | 0 1 2 3 4 5 6 7 8 9 10 11 | All notes | Passing tones |

### Scale Selection by Genre

| Genre | Primary Scales | Characteristic |
|-------|---------------|----------------|
| Pop | Major, Minor, Pentatonic | Stick to diatonic, minimal chromaticism |
| Rock | Minor Pentatonic, Blues, Mixolydian | Blue notes (b3, b5, b7) |
| Jazz | Dorian, Mixolydian, Melodic Minor, Diminished | Chromatic approach tones |
| EDM | Minor, Phrygian, Harmonic Minor | Dark modes for tension |
| Hip-Hop | Minor Pentatonic, Blues, Dorian | Sparse, pentatonic melodies |
| R&B/Neo-Soul | Dorian, Mixolydian, Melodic Minor | Extensions, chromaticism |
| Classical | Major, Minor (all forms), Modes | Full diatonic vocabulary |
| Lo-Fi | Dorian, Major Pentatonic, Lydian | Warm, jazzy extensions |
| Latin | Phrygian, Harmonic Minor, Mixolydian | Flamenco = Phrygian dominant |
| Ambient | Lydian, Whole Tone, Pentatonic | Avoid strong resolutions |

---

## 3. Chord Construction

### Triads

| Quality | Formula | Example (C) | Strudel |
|---------|---------|-------------|---------|
| Major | 1 3 5 | C E G | `note("c3 e3 g3")` |
| Minor | 1 b3 5 | C Eb G | `note("c3 eb3 g3")` |
| Diminished | 1 b3 b5 | C Eb Gb | `note("c3 eb3 gb3")` |
| Augmented | 1 3 #5 | C E G# | `note("c3 e3 gs3")` |
| Sus2 | 1 2 5 | C D G | `note("c3 d3 g3")` |
| Sus4 | 1 4 5 | C F G | `note("c3 f3 g3")` |

### 7th Chords

| Quality | Formula | Example (C) | Symbol | Strudel |
|---------|---------|-------------|--------|---------|
| Major 7 | 1 3 5 7 | C E G B | Cmaj7 | `note("c3 e3 g3 b3")` |
| Minor 7 | 1 b3 5 b7 | C Eb G Bb | Cm7 | `note("c3 eb3 g3 bb3")` |
| Dominant 7 | 1 3 5 b7 | C E G Bb | C7 | `note("c3 e3 g3 bb3")` |
| Half-Dim 7 | 1 b3 b5 b7 | C Eb Gb Bb | Cm7b5 | `note("c3 eb3 gb3 bb3")` |
| Diminished 7 | 1 b3 b5 bb7 | C Eb Gb A | Cdim7 | `note("c3 eb3 gb3 a3")` |
| Min/Maj 7 | 1 b3 5 7 | C Eb G B | Cm(maj7) | `note("c3 eb3 g3 b3")` |

### Extensions (add to 7th chords)

| Extension | Interval | Adds | Common Usage |
|-----------|----------|------|-------------|
| 9 | 14 semitones (= 2 up octave) | D over C chord | Jazz, R&B, Neo-soul |
| b9 | 13 semitones | Db over C chord | Altered dominant |
| #9 | 15 semitones | D# over C chord | Hendrix chord, funk |
| 11 | 17 semitones (= 5 up octave) | F over C chord | Modal jazz, sus sound |
| #11 | 18 semitones | F# over C chord | Lydian sound, jazz |
| 13 | 21 semitones (= 6 up octave) | A over C chord | Smooth jazz |
| b13 | 20 semitones | Ab over C chord | Altered dominant |

### Voicing Strategies

**Close Position**: Notes within one octave. Dense, full sound.
```
Cmaj7 close: C3 E3 G3 B3
```

**Open/Drop-2**: Second voice from top dropped an octave. Piano/guitar standard.
```
Cmaj7 drop-2: G2 C3 E3 B3
```

**Shell Voicing**: Root + 3rd + 7th only. Clean, jazz comping.
```
Cmaj7 shell: C3 E3 B3
```

**Spread Voicing**: Wide intervals, orchestral. Root in bass, others spread.
```
Cmaj7 spread: C2 G3 B3 E4
```

**Rootless Voicing (jazz)**: Omit root (bass plays it). Upper extensions shine.
```
Cmaj9 rootless: E3 G3 B3 D4
```

---

## 4. Chord Progressions by Genre

### Pop & Rock

| Name | Numerals | In C Major | Usage |
|------|----------|-----------|-------|
| **The Four Chords** | I - V - vi - IV | C G Am F | 80% of pop songs |
| **Sensitive** | vi - IV - I - V | Am F C G | Emotional ballads |
| **50s** | I - vi - IV - V | C Am F G | Doo-wop, retro |
| **Andalusian** | i - VII - VI - V | Am G F E | Rock, flamenco |
| **Axis** | I - IV - vi - V | C F Am G | Modern pop |
| **Sad** | i - iv - VII - III | Am Dm G C | Minor pop |
| **Rock Power** | I - bVII - IV | C Bb F | Classic rock |

### Jazz

| Name | Numerals | In C Major | Usage |
|------|----------|-----------|-------|
| **ii-V-I Major** | Dm7 - G7 - Cmaj7 | ii-V-I | Foundation of jazz |
| **ii-V-I Minor** | Dm7b5 - G7b9 - Cm7 | iiø-V7-i | Minor jazz |
| **Turnaround** | Cmaj7 - Am7 - Dm7 - G7 | I-vi-ii-V | Loop/turnaround |
| **Rhythm Changes** | Bb - Gm - Cm - F7 | I-vi-ii-V (Bb) | Bebop standards |
| **Coltrane Changes** | Cmaj7 - Eb7 - Abmaj7 - B7 - Emaj7 - G7 | Giant steps pattern | Advanced |
| **Tritone Sub** | Dm7 - Db7 - Cmaj7 | ii - bII7 - I | Smooth resolution |
| **Modal Jazz** | Dm7 ×16 bars | One chord, one mode | So What, Maiden Voyage |
| **Blues** | C7 - F7 - C7 - G7 - F7 - C7 | I7-IV7-I7-V7-IV7-I7 | 12-bar blues |

### Electronic / EDM

| Name | Numerals | In A Minor | Usage |
|------|----------|-----------|-------|
| **EDM Anthem** | i - III - VII - VI | Am C G F | Progressive house |
| **Dark Trance** | i - VI - III - VII | Am F C G | Trance, dark EDM |
| **Minimal** | i - iv | Am Dm (loop) | Techno, minimal |
| **Euphoric** | I - V - vi - IV | (Major key) | Big room, euphoric |

### Hip-Hop & R&B

| Name | Numerals | In C Minor | Usage |
|------|----------|-----------|-------|
| **Trap Minor** | i - VI - VII | Cm Ab Bb | Trap, drill |
| **Boom Bap** | i - iv - VII - III | Cm Fm Bb Eb | 90s hip-hop |
| **Neo-Soul** | IVmaj7 - iii7 - vi7 - ii7 | Fmaj7 Em7 Am7 Dm7 | Erykah Badu style |
| **Lo-Fi** | ii7 - V7 - Imaj7 - vi7 | Dm7 G7 Cmaj7 Am7 | Lo-fi hip-hop |

---

## 5. Voice Leading Rules

### Core Principles

1. **Smooth Motion**: Move each voice by the smallest interval possible (step > skip > leap)
2. **Common Tones**: Keep shared notes between chords in the same voice
3. **Contrary Motion**: When bass moves up, upper voices move down (and vice versa)
4. **Resolve Tendency Tones**:
   - Leading tone (7th degree) → resolves up to tonic
   - 4th degree → resolves down to 3rd
   - b7 of dominant → resolves down by half step
5. **Avoid Parallel 5ths/Octaves**: Two voices moving in parallel perfect 5ths or octaves sounds hollow

### Practical Voice Leading Examples

**C → F (I → IV)**:
```
Bad:  C3 E3 G3 → F3 A3 C4  (all voices leap)
Good: C3 E3 G3 → C3 F3 A3  (C stays, E→F step, G→A step)
```

**Dm7 → G7 → Cmaj7 (ii-V-I)**:
```
Voice 1: D3  → D3  → C3   (common tone, then step down)
Voice 2: F3  → F3  → E3   (common tone, then step down)
Voice 3: A3  → G3  → G3   (step down, common tone)
Voice 4: C4  → B3  → B3   (step down, common tone)
```

### Bass Motion Patterns

| Pattern | Description | Genre |
|---------|-------------|-------|
| **Root Motion** | Play chord root on beat 1 | All genres |
| **Root-Fifth** | Root on 1, fifth on 3 | Rock, pop |
| **Walking Bass** | Stepwise through chord tones + approach | Jazz, blues |
| **Pedal Bass** | Stay on one note regardless of chord | EDM, ambient |
| **Octave Bounce** | Root low → root high | Disco, funk |
| **Syncopated** | Off-beat root hits | Funk, hip-hop |

---

## 6. Rhythm Patterns

### Drum Patterns by Genre

**Note**: In Strudel, use `s("bd sd hh oh")` with `.bank("RolandTR808")` or similar.

#### Pop/Rock (4/4, 100-130 BPM)
```
Kick:  x . . . | x . . . | x . . . | x . x .
Snare: . . x . | . . x . | . . x . | . . x .
HiHat: x x x x | x x x x | x x x x | x x x x
```

#### Hip-Hop / Boom Bap (4/4, 80-95 BPM)
```
Kick:  x . . x | . . x . | x . . x | . . . .
Snare: . . . . | x . . . | . . . . | x . . .
HiHat: x . x . | x . x . | x . x . | x . x .
```

#### Trap (4/4, 130-160 BPM, half-time feel)
```
Kick:  x . . . | . . . x | . x . . | . . . .
Snare: . . . . | x . . . | . . . . | x . . .
HiHat: xxxxxxxx|xxxxxxxx | xxxx.xxx | xxxxxxxx  (rapid 32nds with gaps)
```

#### House (4/4, 120-130 BPM)
```
Kick:  x . . . | x . . . | x . . . | x . . .  (four on the floor)
Clap:  . . . . | x . . . | . . . . | x . . .
HiHat: . . x . | . . x . | . . x . | . . x .  (off-beat)
```

#### Jazz Swing (4/4, 120-180 BPM, triplet feel)
```
Ride:   x . a . | x . a . | x . a . | x . a .  (swing pattern)
HiHat:  . . x . | . . x . | . . x . | . . x .  (beats 2 & 4, foot)
Kick:   (feathered, light on 1 and 3)
Snare:  (comping - irregular accents)
```

#### Lo-Fi (4/4, 70-90 BPM)
```
Kick:  x . . . | . . x . | x . . . | . . x .
Snare: . . x . | . . . . | . . x . | . . . x  (lazy, slightly behind)
HiHat: x . x . | x . x . | x . x . | x x x .  (gentle variation)
```

### Velocity Guidelines

| Dynamic | Velocity (0-1) | Usage |
|---------|---------------|-------|
| Ghost note | 0.15 - 0.30 | Subtle texture, hi-hat ghost |
| Soft (p) | 0.30 - 0.50 | Verse, quiet sections |
| Medium (mf) | 0.50 - 0.70 | Normal playing |
| Loud (f) | 0.70 - 0.85 | Chorus, emphasis |
| Accent (ff) | 0.85 - 1.00 | Hits, downbeats, sforzando |

**Humanization**: Vary velocity by ±0.05-0.10 from target. Snare ghost notes at 0.2, main hits at 0.75.

---

## 7. Song Structure Templates

### Pop Song (3-4 minutes)

```
Intro:     4 bars   (establish groove, sparse)
Verse 1:   8 bars   (melody + lyrics, low energy)
Pre-Chorus: 4 bars  (build tension, rising energy)
Chorus:    8 bars   (hook, full energy, memorable melody)
Verse 2:   8 bars   (same chords, new melody variation)
Pre-Chorus: 4 bars
Chorus:    8 bars
Bridge:    8 bars   (contrast — different chords, mood shift)
Chorus:    8 bars   (final, biggest energy)
Outro:     4 bars   (wind down)
Total:     ~64 bars ≈ 3:30 at 120 BPM
```

### EDM Track (5-6 minutes)

```
Intro:     16 bars  (ambient, filtered)
Build:     16 bars  (add elements, rising filter)
Drop 1:    16 bars  (full energy, main hook)
Breakdown: 16 bars  (strip back, atmospheric)
Build 2:   8 bars   (shorter, more intense)
Drop 2:    16 bars  (variation of drop 1, extra elements)
Outro:     16 bars  (strip away elements)
Total:     ~104 bars ≈ 6:30 at 128 BPM
```

### Hip-Hop Beat (2-3 minutes)

```
Intro:     4 bars   (sample or ambient)
Verse 1:   16 bars  (main beat, sparse melody)
Hook:      8 bars   (catchy, memorable)
Verse 2:   16 bars  (beat variation)
Hook:      8 bars
Bridge:    8 bars   (half-time or breakdown)
Hook:      8 bars
Outro:     4 bars
Total:     ~72 bars ≈ 3:00 at 90 BPM
```

### Jazz Standard (head-solo-head)

```
Head In:   32 bars  (melody statement, AABA or ABAC)
Solo 1:    32 bars  (over changes, instrument 1)
Solo 2:    32 bars  (over changes, instrument 2)
Trading:   32 bars  (4-bar or 8-bar trades)
Head Out:  32 bars  (melody restatement, ritardando ending)
```

---

## 8. Key + BPM Defaults by Genre

| Genre | Common Keys | BPM Range | Default |
|-------|-------------|-----------|---------|
| Pop | C, G, D, A (major) | 100-130 | 120 |
| Rock | E, A, D, G (major/minor) | 110-140 | 125 |
| Jazz | Bb, Eb, F, C | 120-180 (swing) | 140 |
| EDM / House | Am, Cm, Fm | 124-130 | 128 |
| Techno | Am, Dm, Em | 130-145 | 138 |
| Drum & Bass | Am, Dm | 170-180 | 174 |
| Hip-Hop | Cm, Am, Em (minor) | 80-100 | 90 |
| Trap | Am, Cm, Bm (minor) | 130-160 (half-time) | 140 |
| Lo-Fi | C, F, G (major or Dorian) | 70-90 | 80 |
| R&B | Eb, Ab, Db, Gb | 90-110 | 95 |
| Classical | C, G, D, F, Bb | 60-140 | Varies |
| Ambient | Any (Lydian, Pentatonic) | 60-90 | 70 |
| Reggae | G, C, D | 70-90 | 80 |
| Funk | E, A (Mixolydian) | 100-120 | 110 |
| Bossa Nova | C, F, G | 120-140 | 130 |

---

## 9. Interval Ear Training Reference

| Interval | Semitones | Sound | Example Song Start |
|----------|-----------|-------|-------------------|
| Minor 2nd | 1 | Tense, dissonant | Jaws theme |
| Major 2nd | 2 | Stepping, neutral | Happy Birthday |
| Minor 3rd | 3 | Sad, gentle | Greensleeves |
| Major 3rd | 4 | Happy, bright | Kumbaya |
| Perfect 4th | 5 | Open, strong | Here Comes the Bride |
| Tritone | 6 | Unsettled, devilish | The Simpsons |
| Perfect 5th | 7 | Pure, powerful | Star Wars |
| Minor 6th | 8 | Bittersweet | Love Story |
| Major 6th | 9 | Warm, nostalgic | My Bonnie |
| Minor 7th | 10 | Bluesy, expectant | Somewhere (West Side Story) |
| Major 7th | 11 | Dreamy, wide | Take On Me (chorus) |
| Octave | 12 | Same but higher | Somewhere Over the Rainbow |
