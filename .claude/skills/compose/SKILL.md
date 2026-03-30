---
name: compose
version: 2.0.0
description: |
  Process-oriented full-song composition workflow for ACE-Step-DAW.
  Guides Claude through a principled research-first composition process:
  research genre → analyze references → extract principles → compose → evaluate.
  Invoke with /compose followed by a description of the desired song.
---

# Compose — Research-First Composition Workflow

> `/compose <description>`
> Example: `/compose a chill lo-fi beat inspired by Nujabes`

---

## Core Principle

**Compose like a musician, not a template engine.**

A musician doesn't have all chord progressions memorized. They:
1. Listen to references in the target style
2. Analyze what makes those references work
3. Extract a few key principles
4. Create something new guided by those principles
5. Iterate until it feels right

This skill follows the same process.

---

## The Composition Process

### Step 0: Parse the User's Intent

Extract from their description:
- **Genre/Style** — the most important signal
- **Reference artists/songs** — if mentioned, these are gold
- **Mood/Energy** — calm, energetic, dark, uplifting, nostalgic
- **Key** — if specified; otherwise, research what's common
- **BPM** — if specified; otherwise, research genre defaults
- **Special constraints** — "no drums", "piano only", "with strings"
- **Duration** — how many bars or minutes

**If the description is vague**, ask the user to clarify before proceeding.
Don't assume — a wrong assumption wastes a full generation cycle.

### Step 1: RESEARCH the Genre/Style

**This step is mandatory. Do not skip it.**

Use music-theory-engine's Phase 1 research process:

1. **Search for genre analysis**:
   - Search the web: `"{genre}" music theory analysis chord progressions`
   - Search the web: `"{genre}" song structure typical arrangement`
   - Search the web: `"{genre}" production techniques rhythm patterns`

2. **If user named a reference song/artist**:
   - Search the web: `"{song/artist}" chord progression key BPM`
   - Search the web: `"{song/artist}" song analysis music theory`
   - This is the highest-value research — the user is telling you exactly what they want

3. **Search for Strudel/TidalCycles examples in the genre**:
   - Search the web: `strudel "{genre}" pattern example`
   - Search the web: `TidalCycles "{genre}" live coding`
   - Finding a working pattern in the target style saves significant effort

4. **Check the DAW's built-in presets** for defaults:
   - Read `src/constants/generationPresets.ts` for genre BPM/key suggestions

### Step 2: ANALYZE and Extract Principles

From your research, distill **2-4 principles** (default: 3; see music-theory-engine Phase 3):

```
Principle 1: [Harmonic character] — what chords, what voicing style
Principle 2: [Rhythmic character] — what drum pattern, what feel
Principle 3: [Textural character] — what instruments, what space/density
```

### Step 3: Write a Composition Brief

Before writing any code, present the plan to the user:

```
## Composition Brief

Genre: Lo-Fi Hip-Hop
Reference: Nujabes "Feather"
Key: D Dorian
BPM: 78

Principle 1: Jazz-rooted harmony — Dm9, Gm7, Em7b5, A7b9 (i-iv-iiø-V7 in D minor); 7th+ voicings
Principle 2: Boom-bap foundation — lazy kick, ghost snares, soft hi-hats
Principle 3: Warm sparse texture — Rhodes keys, sub bass, pentatonic lead with delay

Song Structure:
  Intro:  4 bars (ambient, filtered)
  Loop A: 8 bars (main groove)
  Loop B: 8 bars (variation — add melody)
  Loop A: 8 bars (return)
  Outro:  4 bars (strip down)

Tracks:
  1. Drums (TR-808)
  2. Bass (sub synth)
  3. Keys (piano/rhodes)
  4. Melody (triangle wave + delay)
```

**Wait for user approval** before composing. The brief is cheap to change;
a full composition is expensive to redo.

### Step 4: COMPOSE — Build Layer by Layer

Follow strudel-maestro's Phase 3-4 process:

1. **Drums first** — get the groove right
2. **Bass second** — lock with kick pattern, follow chord roots
3. **Chords third** — establish harmony, lower velocity than melody
4. **Melody last** — sits on top, most expressive

For each layer:
- Reference your 3 principles
- Use the minimum Strudel syntax needed (see strudel-maestro Phase 1)
- If you need syntax you're unsure about, search the docs first

Output format — Strudel `stack()`:

```javascript
stack(
  // Drums
  stack(
    s("...").bank("..."),   // kick
    s("...").bank("..."),   // snare
    s("...").bank("...")    // hi-hat
  ),
  // Bass
  note("...").s("...").lpf(...),
  // Chords
  note("...").s("...").velocity(...),
  // Melody
  note("...").s("...").velocity(...)
)
```

### Step 5: EVALUATE Against Principles

After composing, verify:

1. **Principle 1 check** — do the chords match the harmonic character I identified?
2. **Principle 2 check** — does the rhythm feel right for the genre?
3. **Principle 3 check** — is the texture/density what was intended?
4. **Key consistency** — are ALL pitched parts in the same key?
5. **Velocity variation** — no flat velocity anywhere?
6. **Musical space** — are there enough rests?
7. **Syntax validity** — sharps use `s` (not `#`), all `.s()` specified?

If anything fails, fix it before presenting to the user.

### Step 6: Present and Iterate

Present the composition with:
1. The Strudel code
2. A brief explanation of musical choices ("used Dm9→Gm7 for the jazzy feel you wanted")
3. Suggested modifications ("I could make the bass busier, add a counter-melody, change the drums to a half-time feel...")

**Iteration is the norm, not the exception.**
Users will ask for changes. When they do:
- Modify only the requested layer
- Keep everything else consistent
- Re-verify key/harmony consistency after changes

---

## Handling Specific Requests

### "Make it sound like [artist/song]"

This is the highest-value input. Research heavily:
1. Search the web: `"{song}" chord progression analysis`
2. Search the web: `"{artist}" music production style analysis`
3. Extract the defining characteristics
4. Apply them — but create something new, not a cover

### "I don't know what I want"

Guide the user with questions:
- "What mood? (happy/sad/energetic/chill/dark/dreamy)"
- "Any genre preference? Or should I suggest based on mood?"
- "Fast or slow?"
- "Instrument preferences?"

Then use their answers to run the research process.

### "Change the key / BPM / genre"

- **Key change**: Transpose all note names by the interval
- **BPM change**: May need to adjust note density (faster BPM = simpler patterns)
- **Genre change**: Start the research process over — genre defines everything

### "Add [specific instrument/part]"

1. Research how that instrument typically functions in the genre
2. Write the new layer respecting existing key/rhythm
3. Add to the stack without modifying other layers

---

## What This Skill Does NOT Include

- **Pre-built genre templates** — research the genre each time instead
- **Complete chord progression databases** — search for the right one each time
- **All Strudel API docs** — look up what you need when you need it
- **Music theory encyclopedia** — extract only the 3 principles you need

This is intentional. The process is more valuable than the data.
The process adapts to any genre, any style, any reference.
A template only works for the exact case it was written for.
