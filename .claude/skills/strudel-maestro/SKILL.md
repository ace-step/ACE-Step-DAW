---
name: strudel-maestro
version: 2.0.0
description: |
  Process-oriented Strudel pattern generation skill for ACE-Step-DAW.
  Teaches Claude how to research Strudel techniques, find examples, and
  generate patterns through a principled workflow — not by memorizing templates.
---

# Strudel Maestro — Process-Oriented Pattern Generation

> This skill teaches you the **process** of creating Strudel patterns,
> not a library of templates. Learn to fish, don't memorize fish.

---

## Core Principle

**Don't generate patterns from memory — research, prototype, refine.**

```
1. UNDERSTAND  → What does Strudel need to express this music?
2. FIND        → Search for similar Strudel patterns or TidalCycles examples
3. PROTOTYPE   → Write minimal pattern, test one layer at a time
4. LAYER       → Build up: drums → bass → chords → melody
5. REFINE      → Add dynamics, effects, humanization
```

---

## Phase 1: UNDERSTAND — What Strudel Needs

### What is Strudel?

Strudel is a browser-based music pattern language (TidalCycles port to JavaScript).
- Patterns describe **cycles** (1 cycle = 1 bar by default)
- Everything is a pattern: notes, sounds, effects, timing
- Patterns compose via `stack()` (simultaneous) and `seq()` (sequential)

### How It Works in Our DAW

- Each track has a Strudel code editor
- `evaluateStrudelCode(trackId, code)` runs the pattern
- Audio via Superdough (built-in synths + sample banks)
- BPM synced to DAW transport
- Convertible to MIDI: `strudelEventsToMidiNotes()`
- MIDI importable: `midiToStrudelCode(notes, options)`

### Minimum Syntax to Start

```javascript
// Notes (sharps=s, flats=b): c4 cs4 db4 d4 eb4 e4 f4 fs4 g4 ab4 a4 bb4 b4
note("c4 e4 g4")                      // melody
s("bd sd hh").bank("RolandTR808")     // drums
stack(melody, bass, drums)             // layer parts
note("c4 [d4 e4] f4 g4")             // [x y] = subdivide one beat
note("c4@2 e4 g4")                    // @2 = hold 2 beats
note("c4 ~ e4 ~")                     // ~ = rest
note("[c3,e3,g3]")                    // comma = chord (simultaneous)
.velocity("0.7 0.5 0.8")             // dynamics
.s("piano")                           // sound source
.lpf(800).room(0.3)                   // effects
```

**That's enough to start.** Look up advanced features as needed.

---

## Phase 2: FIND — Researching Strudel Patterns

### How to Find Examples

When you need a pattern you haven't written before:

1. **Search the Strudel docs and examples**:
   - WebSearch: `site:strudel.cc {technique or genre}`
   - WebSearch: `strudel.cc workshop {topic}`
   - WebSearch: `strudel music pattern example {what you need}`

2. **Search TidalCycles community** (syntax is very similar):
   - WebSearch: `TidalCycles "{pattern type}" example`
   - WebSearch: `tidalcycles.org tutorial {technique}`
   - TidalCycles patterns translate to Strudel with minor syntax changes

3. **Search GitHub for real compositions**:
   - WebSearch: `github strudel composition "{genre}"`
   - WebSearch: `github tidalcycles live coding "{genre}"`

4. **Read the DAW's own Strudel integration** for what's available:
   - `src/engine/strudelEngine.ts` — available functions
   - `src/services/strudelConversion.ts` — MIDI ↔ Strudel conversion

### How to Adapt Found Examples

When you find a reference pattern:

1. **Identify the core technique** — what makes it sound good?
2. **Extract the pattern structure** — what's the rhythmic grid?
3. **Adapt to the target key/scale** — transpose note names
4. **Adjust to target BPM** — more/fewer subdivisions
5. **Modify to taste** — change notes, add variation

### When Syntax is Unclear

Don't guess syntax. Instead:
- WebSearch: `strudel.cc documentation {function name}`
- WebSearch: `strudel "{function}" example usage`
- Read: `src/engine/strudelEngine.ts` for what's actually available

---

## Phase 3: PROTOTYPE — Build Minimal First

### The One-Layer-at-a-Time Rule

**Never write a full multi-track pattern from scratch.** Instead:

1. **Start with drums** — get the groove right alone
2. **Add bass** — make sure it locks with the kick
3. **Add chords** — verify harmonic fit
4. **Add melody** — last, because it sits on top of everything

Each layer should sound decent on its own before combining.

### Prototyping Checklist

Before writing each layer, ask:
- [ ] What instrument/sound do I need? (set `.s()` or `.bank()`)
- [ ] What's the rhythmic grid? (4 quarter notes? 8 eighths? triplets?)
- [ ] What notes/pitches? (from the key/scale established in music-theory-engine)
- [ ] What velocity range? (drums: 0.3-0.9, pads: 0.3-0.5, melody: 0.5-0.8)

### Pattern Length Convention

- **1 cycle = 1 bar** (Strudel default)
- For a 4-bar loop: write 1 bar of pattern (it cycles)
- For variation across bars: use `seq()` or `cat()` for multi-bar phrases
- For slow chords: use `@` to extend notes across beats

---

## Phase 4: LAYER — Building Up

### Layering Structure

```javascript
stack(
  // Layer 1: Drums (rhythmic foundation)
  stack(
    s("...").bank("..."),  // kick
    s("...").bank("..."),  // snare
    s("...").bank("...")   // hi-hat
  ),
  // Layer 2: Bass (harmonic + rhythmic anchor)
  note("...").s("...").lpf(...),
  // Layer 3: Chords (harmonic body)
  note("...").s("...").velocity(...),
  // Layer 4: Melody (top voice)
  note("...").s("...").velocity(...)
)
```

### Layer-Specific Guidelines

**Drums**: Separate kick/snare/hh into individual lines for clarity.
**Bass**: Keep in octave 1-2. Always specify `.lpf()` (bass shouldn't have bright harmonics).
**Chords**: Use `[note,note,note]` for simultaneous voicings. Keep velocity lower than melody.
**Melody**: Highest register. Most velocity variation. Most rests (space = musicality).

---

## Phase 5: REFINE — Making It Musical

### Humanization Techniques

```javascript
// Velocity variation (most important)
.velocity("0.7 0.55 0.8 0.6")  // NOT .velocity(0.7) everywhere

// Subtle timing feel (ghost notes for drums)
s("hh [~ hh] hh [~ hh]").velocity("0.4 0.15 0.45 0.15")

// Filter movement (adds life to synths)
.lpf("400 600 800 600")  // filter sweep across beats

// Reverb/delay for space
.room(0.3).delay(0.15)   // subtle, not too wet
```

### Common Refinements

| Problem | Fix |
|---------|-----|
| Sounds robotic | Add velocity variation per note |
| Too busy | Remove notes, add rests (~) |
| Too thin | Add octave doubling or chord extensions |
| Boring | Add `.every(4, x => x.rev())` or similar transformation |
| Harsh | Add `.lpf()` to tame high frequencies |
| No groove | Check kick/bass alignment; add ghost notes |
| Too static | Use filter sweeps or `seq()` for multi-bar variation |

### When to Stop

A pattern is done when:
1. Each layer contributes something distinct
2. There's rhythmic interplay (not everything on the same beats)
3. There's dynamic range (soft and loud moments)
4. Removing any element would leave a gap
5. It serves the user's described intent

---

## Anti-Patterns (What NOT to Do)

1. **Don't dump 8 genre templates** — research the specific genre needed
2. **Don't write 50+ lines of Strudel** — keep patterns concise (10-25 lines typical)
3. **Don't use syntax you haven't verified** — search docs first
4. **Don't use `#` for sharps** — Strudel uses `s`: `cs4` not `c#4`
5. **Don't make all layers equally loud** — drums and melody louder, pads quieter
6. **Don't skip rests** — space is what makes music breathe
7. **Don't generate all layers at once** — build iteratively, one layer at a time
