---
name: compose
version: 3.1.0
description: |
  Full-song composition workflow for ACE-Step-DAW. Research-first process:
  understand intent → research genre → extract principles → compose → iterate.
  Invoke with /compose followed by a description.
---

# Compose

> `/compose <description>`
> Example: `/compose a chill lo-fi beat inspired by Nujabes`

## The Composition Workflow

### Step 1: Understand Intent

Extract from the user's description:
- **Genre/style** — the most important signal
- **Reference artists/songs** — if mentioned, research these heavily
- **Mood/energy** — calm, energetic, dark, uplifting, nostalgic
- **Key, BPM, duration** — if specified; otherwise research genre defaults
- **Constraints** — "no drums", "piano only", "with strings"

**If the description is vague, ask the user to clarify.** Don't assume.

### Step 2: Research (Mandatory)

Use the music-theory-engine research process:
- Search for the genre's conventions (chords, rhythm, structure, instrumentation)
- If user named a reference, search for its specific chord/key/BPM/structure analysis
- Search for Strudel/TidalCycles examples in the genre (via strudel-maestro)
- Check `src/constants/generationPresets.ts` for built-in genre defaults

### Step 3: Extract Principles & Write Brief

Apply music-theory-engine's analysis process to research results.
Distill into 2-4 composition principles.

Present a **Composition Brief** for user approval:

```
Genre: [genre]
Reference: [what was researched]
Key: [key + scale]
BPM: [tempo]
Principles:
  1. [harmonic character]
  2. [rhythmic character]
  3. [textural character]
Structure: [sections with bar counts]
Tracks: [instruments/roles planned]
```

**Wait for user approval before composing.** The brief is cheap to change.

### Step 4: Compose

Follow the strudel-maestro process:
- Build one layer at a time: drums → bass → chords → melody
- Each layer informed by your composition principles
- Output as Strudel `stack()` (primary) or MIDI note arrays (if user prefers piano roll)

**Apply music-theory-engine composition techniques**:
- Voice leading: smooth chord connections
- Melody: motif development, chord-tone alignment, contour
- Bass: follows chord roots with genre-appropriate movement
- Drums: genre-appropriate pattern from research

### Step 5: Present & Iterate

Present the composition with:
- The Strudel code
- Brief explanation of key musical choices
- 2-3 suggested modifications the user might want

**Iteration is the norm.** When the user asks for changes:
- Modify only the requested layer/aspect
- Keep everything else consistent
- Re-verify key/harmony consistency

### Handling Specific Requests

**"Make it sound like [X]"** — Research that reference heavily. Search for its chord analysis,
production style, key characteristics. Extract what makes it distinctive. Apply those characteristics
to create something new (not a cover).

**"I don't know what I want"** — Guide with questions: mood? tempo? instruments?
Use their answers to drive research.

**"Change key/BPM/genre"** — Key change = transpose all parts. BPM change = may need
to adjust note density. Genre change = restart the research process.

**"Add [instrument]"** — Research how that instrument functions in the genre.
Write one new layer that fits with existing parts.

**"It sounds [wrong/robotic/boring]"** — Check: velocity variation? Space/rests?
Dynamic contrast between sections? Motif development? Search for what makes
the genre feel alive and apply those techniques.

## Related Skills

- **music-theory-engine** — Genre research, theory analysis, composition principles
- **strudel-maestro** — Strudel pattern research, prototyping, and refinement
