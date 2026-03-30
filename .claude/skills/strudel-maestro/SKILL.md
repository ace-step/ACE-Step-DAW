---
name: strudel-maestro
version: 3.1.0
description: |
  Process guide for researching and generating Strudel patterns in ACE-Step-DAW.
  Teaches how to find the right syntax and patterns, then build up compositions.
---

# Strudel Maestro

> Research Strudel syntax and patterns from docs and community examples.
> Build one layer at a time. Don't write full arrangements from memory.

## What is Strudel in This DAW

- Browser-based music pattern language (TidalCycles port to JS)
- Each track has a Strudel code editor; code runs live via `evaluateStrudelCode(trackId, code)`
- Audio synthesis via Superdough (built-in synths + sample banks)
- BPM synced to DAW transport
- Convert to MIDI: `strudelEventsToMidiNotes()` / from MIDI: `midiToStrudelCode()`
- Pattern analysis: `getStrudelPatternInfo(trackId)` — note count, pitch range, density
- Source code: `src/engine/strudelEngine.ts`, `src/services/strudelConversion.ts`

## The Pattern Creation Process

```
RESEARCH SYNTAX → PROTOTYPE → LAYER → REFINE
```

### 1. RESEARCH SYNTAX

Before writing, find the right Strudel constructs:

- Search Strudel docs (`strudel.cc`) for the specific features you need
- Search for Strudel / TidalCycles community examples in the target genre
- Search GitHub for real Strudel compositions

**Key concepts to look up as needed**:
- Note entry and timing (named notes, subdivision, elongation, rests)
- Sound selection (synths, sample banks, instruments)
- Pattern combinators (stacking, sequencing, alternation)
- Transformations (speed, reverse, every-N-cycles variation)
- Effects (filter, reverb, delay, panning)
- Dynamics (velocity, gain, envelope)
- Chord and arpeggio patterns

**Critical syntax to verify** (common sources of errors):
- How does Strudel notate sharps and flats? → look it up
- How does Strudel notate chords (simultaneous notes)? → look it up
- What's the difference between `<>`, `[]`, and `[,]`? → look it up
- What sample banks are available? → look it up

### 2. PROTOTYPE

Start with one layer — the most important one for the genre (usually drums or chords).

For each layer, decide:
- What sound source? (look up available instruments/banks)
- What rhythmic grid? (informed by genre research from music-theory-engine)
- What notes/pitches? (from the key/scale in your composition brief)

Write the simplest version that captures the musical idea. Test it alone before adding more.

### 3. LAYER

Add parts one at a time. Standard order: **drums → bass → chords → melody**.

Use `stack()` to combine layers. Each layer should:
- Have a clear musical role (don't duplicate what another layer does)
- Be at an appropriate volume relative to others
- Be in the same key as all other pitched parts

Typical arrangement: 4-6 layers. More than 6 usually means something should be removed.

### 4. REFINE

Once all layers work together:

- **Add velocity variation** — different velocities per note for humanization
- **Add effects** — filter, reverb, delay as appropriate for the genre
- **Add variation** — use per-cycle transforms so it doesn't sound static
- **Check density** — remove notes/layers if it feels crowded; add rests for space
- **Verify it runs** — if `evaluateStrudelCode()` fails, read the error, fix, re-evaluate

A pattern is done when: each layer contributes something distinct, there's dynamic range,
and removing any element would leave a noticeable gap.

## Multi-Section Arrangements

For songs with different sections (verse, chorus, bridge):
- Look up how Strudel handles sequencing (`seq()`, `cat()`) in the docs
- Use `.slow(N)` to stretch patterns across multiple bars
- Vary energy between sections: sparser verse, fuller chorus

## Related Skills

- **music-theory-engine** — Genre research, theory analysis, composition principles
- **compose** — Full composition workflow orchestrating both skills
