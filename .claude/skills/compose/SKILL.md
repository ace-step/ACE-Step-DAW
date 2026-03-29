---
name: compose
version: 1.0.0
description: |
  Structured full-song composition workflow for ACE-Step-DAW.
  Guides Claude through multi-track song creation: structure, chords, drums, bass, melody.
  Outputs Strudel patterns or MIDI note arrays to DAW tracks.
  Invoke with /compose followed by a description of the desired song.
  References music-theory-engine and strudel-maestro skills automatically.
---

# Compose — Full Song Composition Skill

> User-facing skill: `/compose <description>`
> Example: `/compose a chill lo-fi beat in C minor at 85 BPM`

---

## Workflow Overview

When the user invokes `/compose`, follow this structured process:

### Step 0: Parse Intent

Extract from the user's description:
- **Genre/Style** (required) — map to genre conventions
- **Key** (optional, default: genre-appropriate, see music-theory-engine §8)
- **BPM** (optional, default: genre-appropriate)
- **Duration** (optional, default: 32 bars / ~2 min)
- **Special requests** ("no drums", "solo piano", "add strings", "dark mood")
- **Mood/Energy** — calm, energetic, melancholic, aggressive, dreamy

If key or BPM is not specified, select genre-appropriate defaults and tell the user.

### Step 1: Song Structure

Design the section layout based on genre (see music-theory-engine §7):

```
Example (Pop, 64 bars):
  Intro:      4 bars  — sparse, establish key
  Verse 1:    8 bars  — melody, moderate energy
  Pre-Chorus: 4 bars  — build tension
  Chorus:     8 bars  — full energy, hook
  Verse 2:    8 bars  — variation
  Pre-Chorus: 4 bars  — build
  Chorus:     8 bars  — full energy
  Bridge:     8 bars  — contrast
  Chorus:     8 bars  — final, biggest
  Outro:      4 bars  — wind down
```

Present the structure to the user for approval before proceeding.

### Step 2: Chord Progression

For each section, select a chord progression:
- Use genre-appropriate progressions (see music-theory-engine §4)
- Verse and chorus should have DIFFERENT progressions
- Bridge should contrast (different root, mode, or rhythm)
- Use proper voice leading between chords (see music-theory-engine §5)

Present chord chart:
```
Verse:    | Dm7    | G7     | Cmaj7  | Am7    |
Chorus:   | C      | G      | Am     | F      |
Bridge:   | Fm     | Cm     | Bb     | Eb     |
```

### Step 3: Drum Pattern

Create a genre-appropriate drum pattern:
- Main pattern for verse (lighter)
- Enhanced pattern for chorus (fuller, louder)
- Fill patterns at section boundaries (every 4 or 8 bars)
- Use music-theory-engine §6 for genre drum patterns

Output as Strudel using strudel-maestro templates.

### Step 4: Bass Line

Create bass following the chord progression:
- Root note on beat 1 (minimum)
- Genre-appropriate movement (walking, root-fifth, syncopated, etc.)
- Bass register: octave 1-2 typically
- Velocity slightly louder on beat 1

### Step 5: Melody / Lead

Create a melodic part:
- Use the key's scale, favoring chord tones on strong beats
- Develop a motif (2-4 note idea) and vary it
- Melodic contour: arch shape, wave, ascending, or descending
- Leave space — rests are musical
- Verse melody simpler, chorus melody catchier/higher

### Step 6: Output to DAW

For each track, output Strudel patterns using the DAW MCP tools:
1. Create tracks via `daw_add_track` (one per instrument role)
2. Assign Strudel code to each track
3. Report the full arrangement to the user

Alternatively, output MIDI note arrays if the user prefers piano roll editing.

---

## Output Format

### Option A: Strudel (Default — for live iteration)

```javascript
// Track 1: Drums
stack(
  s("bd ~ bd ~").bank("RolandTR808"),
  s("~ sd ~ sd").bank("RolandTR808").velocity(0.8),
  s("hh hh hh hh").bank("RolandTR808").velocity("0.5 0.3 0.6 0.3")
)

// Track 2: Bass
note("c2 c2 f2 f2 g2 g2 c2 c2")
  .s("sawtooth").lpf(400).velocity(0.7)

// Track 3: Chords
note("[c3,e3,g3]@2 [f3,a3,c4]@2 [g3,b3,d4]@2 [c3,e3,g3]@2")
  .s("piano").velocity(0.5)

// Track 4: Melody
note("e4 g4 a4 g4 f4 e4 d4 c4")
  .s("triangle").velocity("0.7 0.6 0.8 0.6 0.7 0.6 0.8 0.7")
```

### Option B: MIDI Note Array (for piano roll)

```json
{
  "tracks": {
    "Bass": [
      {"pitch": 36, "startBeat": 0, "durationBeats": 2, "velocity": 0.7},
      {"pitch": 36, "startBeat": 2, "durationBeats": 2, "velocity": 0.65},
      {"pitch": 41, "startBeat": 4, "durationBeats": 2, "velocity": 0.7},
      {"pitch": 41, "startBeat": 6, "durationBeats": 2, "velocity": 0.65}
    ],
    "Melody": [
      {"pitch": 64, "startBeat": 0, "durationBeats": 1, "velocity": 0.7},
      {"pitch": 67, "startBeat": 1, "durationBeats": 1, "velocity": 0.6}
    ]
  }
}
```

---

## Composition Examples by Genre

### Example 1: Pop Song in G Major, 120 BPM

**Structure**: Intro(4) → Verse(8) → Chorus(8) → Verse(8) → Chorus(8) → Bridge(8) → Chorus(8) → Outro(4)

**Chords**:
- Verse: `| G | D | Em | C |` (I-V-vi-IV)
- Chorus: `| C | G | Am | D |` (IV-I-ii-V)
- Bridge: `| Em | C | G | D/F# |` (vi-IV-I-V)

**Strudel**:
```javascript
stack(
  // Drums
  stack(
    s("bd ~ bd ~").bank("RolandTR808").velocity(0.8),
    s("~ sd ~ sd").bank("RolandTR808").velocity(0.75),
    s("hh hh hh hh").bank("RolandTR808").velocity("0.4 0.3 0.5 0.3")
  ),
  // Bass
  note("g1 g1 d2 d2 e2 e2 c2 c2")
    .s("sawtooth").lpf(400).velocity(0.7),
  // Chords
  note("[g2,b2,d3]@2 [d3,fs3,a3]@2 [e3,g3,b3]@2 [c3,e3,g3]@2")
    .s("piano").velocity(0.5).room(0.2),
  // Melody
  note("b4 a4 g4 fs4 e4 d4 e4 g4")
    .s("triangle").velocity("0.7 0.65 0.75 0.6 0.7 0.6 0.8 0.7")
)
```

### Example 2: Neo-Soul in Eb, 92 BPM

**Chords**: `| Ebmaj9 | Cm9 | Fm9 | Bb13 |`

```javascript
stack(
  // Drums (relaxed groove)
  stack(
    s("bd ~ [~ bd] ~").bank("RolandTR808").velocity(0.65),
    s("~ sd ~ [~ sd]").bank("RolandTR808").velocity(0.55),
    s("hh [hh hh] hh [hh hh]").bank("RolandTR808").velocity("0.35 0.2 0.25 0.35 0.2 0.25")
  ),
  // Bass (smooth, chromatic approach)
  note("eb2 ~ d2 c2  c2 ~ bb1 ab1  f2 ~ eb2 d2  bb1 ~ a1 bb1")
    .s("sawtooth").lpf(350).velocity(0.6),
  // Keys (extended voicings)
  note("[eb3,g3,bb3,d4,f4]@2 [c3,eb3,g3,bb3,d4]@2 [f3,ab3,c4,eb4,g4]@2 [bb2,d3,f3,ab3,g3]@2")
    .s("piano").velocity(0.4).room(0.3),
  // Melody (pentatonic, behind the beat)
  note("~ bb4 ~ g4  eb4 ~ f4 ~  ab4 ~ g4 f4  ~ eb4 ~ ~")
    .s("triangle").velocity("~ 0.5 ~ 0.55 0.45 ~ 0.5 ~ 0.6 ~ 0.5 0.45 ~ 0.4 ~ ~")
    .delay(0.15)
)
```

### Example 3: Ambient/Cinematic in D Lydian, 68 BPM

**Chords**: `| Dmaj7 | E/D | F#m | Gmaj7 |` (Lydian ambiguity)

```javascript
stack(
  // Pad (slow evolving)
  note("[d2,a2,cs3,fs3]@4 [e2,b2,d3,gs3]@4 [fs2,cs3,e3,a3]@4 [g2,b2,d3,fs3]@4")
    .s("sawtooth").lpf("400 600 800 600")
    .attack(2).release(3).velocity(0.3).room(0.7).size(0.9),
  // High texture (sparse)
  note("~ ~ fs5 ~ ~ a5 ~ ~  ~ ~ gs5 ~ ~ ~ ~ ~  ~ cs5 ~ ~ e5 ~ ~ ~  ~ ~ d5 ~ ~ b4 ~ ~")
    .s("triangle").velocity("~ ~ 0.2 ~ ~ 0.25 ~ ~  ~ ~ 0.2 ~ ~ ~ ~ ~  ~ 0.2 ~ ~ 0.25 ~ ~ ~  ~ ~ 0.2 ~ ~ 0.15 ~ ~")
    .room(0.8).delay(0.3).delaytime(0.375),
  // Sub bass (root pedal)
  note("d1@8 d1@8")
    .s("sine").velocity(0.5)
)
```

---

## Iteration Guidance

After initial generation, the user will want to iterate. Common requests and how to handle them:

| User Request | Action |
|-------------|--------|
| "Make it more energetic" | Add more drum hits, louder velocity, higher octave melody |
| "Make it more chill" | Remove drum fills, lower velocity, add delay/reverb |
| "Change the chords" | Swap progression, keep same voicing style |
| "Make the bass busier" | Add passing tones, syncopation, or walking patterns |
| "Add a melody" | Generate melodic line over existing chords |
| "It sounds too robotic" | Add velocity variation, slight timing offsets, ghost notes |
| "Change the key" | Transpose all parts by the interval difference |
| "Make it swing" | Change to triplet subdivision `[note ~ note]` pattern |
| "Add fills at bar 8" | Insert drum fill pattern before section change |
| "Simplify it" | Remove layers, reduce note density, use longer note values |

When iterating:
1. Read current pattern state
2. Modify only the requested part (don't regenerate everything)
3. Ensure consistency with other parts (key, timing)
4. Present the change and let the user approve

---

## Quality Checklist

Before presenting any composition to the user, verify:

- [ ] All melodic parts are in the declared key/scale
- [ ] Chord voicings follow voice leading principles
- [ ] Bass notes match chord roots on strong beats
- [ ] Drum pattern matches genre conventions
- [ ] Velocity varies naturally (not flat)
- [ ] Rests/space exists in the arrangement
- [ ] BPM is genre-appropriate
- [ ] No syntax errors in Strudel patterns
- [ ] Strudel uses `s` for sharps (not `#`)
- [ ] Sound sources are specified (.s() or .bank())
