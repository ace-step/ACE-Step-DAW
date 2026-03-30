---
name: compose
version: 4.1.0
description: |
  Iterative composition workflow for ACE-Step-DAW. Mirrors the coding agent's
  TDD discipline: draft → external evaluation → refine → commit each layer.
  Never self-assess — always use a subagent. Spiral upward through iterations.
  Invoke with /compose followed by a description.
---

# Compose

> `/compose <description>`
>
> Compose like the coding agent writes code. Same discipline from CLAUDE.md applies:
> - **Never self-assess** — use a subagent evaluator (like `@tester`)
> - **Incremental commits** — present each layer to the user as you go (like committing code)
> - **Done criteria first** — write acceptance criteria before composing
> - **Research before coding** — deep genre research (like competitive research in AGENTS.md Step 1)

## Core Loop: Draft → Evaluate → Refine → Commit

```
Research → Done Criteria → Draft one layer → @evaluator → Refine → Present layer
                                                  ↑                      |
                                                  └──────────────────────┘
                                                   until evaluator passes
```

This is the musical equivalent of TDD's Red-Green-Refactor:
- **Draft** (Red) — write the simplest version of one layer
- **Evaluate** (Green) — use a subagent to assess: does it work musically?
- **Refine** (Refactor) — fix what the evaluation flagged
- **Commit** — only when the layer is solid, move to the next one

## The Workflow

### Step 1: Understand Intent

Extract from the user's description:
- **Genre/style** — the most important signal
- **Reference artists/songs** — if mentioned, research these heavily
- **Mood/energy** — calm, energetic, dark, uplifting, nostalgic
- **Key, BPM, duration** — if specified; otherwise research genre defaults
- **Constraints** — "no drums", "piano only", "with strings"

**If the description is vague, ask the user to clarify.** Don't assume.

### Step 2: Research (Mandatory — Do Not Skip)

Like AGENTS.md Step 1 "Competitive Deep Research", research at **detail level**, not surface level:

- **Bad**: "Lo-fi uses jazz chords"
- **Good**: "Lo-fi typically uses Dorian mode, Cm9→Fm9 i-iv progressions, Rhodes/EP with detuning, boom-bap drums 75-85 BPM, ghost snares at ~0.2 velocity, vinyl noise texture"

Use the music-theory-engine research process:
- Search for the genre's conventions — chords, rhythm, structure, instrumentation
- If user named a reference, search for its **specific** chord/key/BPM/structure analysis
- Search for Strudel/TidalCycles examples in the genre (via strudel-maestro)
- Check `src/constants/generationPresets.ts` for built-in genre defaults

### Step 3: Done Criteria + Composition Brief

**Write acceptance criteria first** (like `.llm/todo.md` in CLAUDE.md).
What does "done" look like for this composition?

```
Done when:
- [ ] Drums: [specific groove description]
- [ ] Bass: [movement style, register]
- [ ] Chords: [voicing style, progression]
- [ ] Melody: [character description]
- [ ] Overall: feels like [genre], matches [reference] character
```

Then distill research into 2-4 composition principles. Present the full brief for user approval:

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

**Wait for user approval.** The brief is cheap to change; rewriting a full composition is not.

### Step 4: Incremental Composition Loop

**Do NOT write all layers at once.** Build one layer at a time, evaluate each.

#### For each layer (drums → bass → chords → melody):

**4a. Draft the layer**
- Write the simplest version that captures the musical idea
- Follow strudel-maestro's process: research syntax as needed, prototype

**4b. External evaluation — NEVER self-assess**

Like CLAUDE.md says: "Never self-assess. Run @tester before every commit."
For composition: **never judge your own output. Launch an evaluator subagent.**

```
Subagent prompt:
"Evaluate this Strudel pattern for a [genre] composition in [key] at [BPM].
Composition principles: [your 2-4 principles].

Current pattern:
[paste current code]

Assess:
1. Does the [layer name] fulfill its musical role?
2. Is it in the correct key/scale?
3. Does the rhythm match the genre conventions?
4. Does it work with the existing layers? (harmonic/rhythmic conflict?)
5. What specifically should be improved?

Be concrete — say which notes, which beats, what to change."
```

**4c. Refine based on feedback**
- Address each specific issue the evaluator raised
- Don't ignore feedback — fix it or explain why it's intentional

**4d. Re-evaluate if changes were significant**
- If the fix was substantial, evaluate again
- If it was minor, proceed to next layer

**4e. Commit the layer**
- Present the layer to the user: "Here's the drum pattern. [brief explanation]"
- Get a quick thumbs-up before moving to the next layer
- This is like committing code — small, verified increments

### Step 5: Full Arrangement Evaluation

After all layers are combined, do a holistic evaluation:

```
Subagent prompt:
"Evaluate this complete [genre] arrangement in [key] at [BPM].
Principles: [your 2-4 principles].

Full pattern:
[paste full stack()]

Assess:
1. Overall: does this feel like [genre]? Would someone recognize it?
2. Harmony: are all parts in the same key? Chord-bass alignment?
3. Rhythm: do the layers interlock? Any rhythmic clashes?
4. Texture: is the density right? Too busy or too sparse?
5. Dynamics: is there velocity variation? Does it breathe?
6. What are the top 2-3 improvements that would make the biggest difference?"
```

Refine based on feedback. This may take 2-3 evaluation rounds.

**Track progress across rounds** — each round should show measurable improvement:
```
Round 1: Evaluator flagged: bass clashes with kick on beat 3, melody has no motif development
Round 2: Fixed bass timing. Evaluator: bass good, melody still needs work, add variation to chords
Round 3: Added melodic motif + chord rhythm variation. Evaluator: solid, minor velocity issue on hi-hats
Round 4: Fixed hi-hat dynamics. Evaluator: passes all criteria. → Present to user.
```

This spiral upward is the key. Each round gets closer to the done criteria.
If you're not making progress (same issues reappearing), stop and re-research
the problematic area more deeply.

### Step 6: Present to User & Continue Iterating

Present the composition with:
- The Strudel code
- What improved through the evaluation rounds (show the spiral)
- What the evaluator confirmed is strong
- 2-3 suggested next directions

**User feedback triggers the same loop**: modify one layer → evaluate → refine.
Don't rewrite everything — small, targeted changes like git commits.

## The Evaluation Loop in Detail

The self-evaluation subagent is the key differentiator. Use it like running tests:

| Coding Agent | Composing Agent |
|-------------|-----------------|
| Write code | Write a layer |
| Run tests | Launch evaluation subagent |
| Read test failures | Read musical critique |
| Fix the code | Refine the layer |
| Tests pass → commit | Evaluation positive → present to user |
| Run full test suite | Full arrangement evaluation |

### What the evaluator should check per layer:

| Layer | Key Evaluation Points |
|-------|----------------------|
| **Drums** | Does the pattern match the genre? Kick-snare relationship? Hi-hat energy level? |
| **Bass** | Following chord roots? Genre-appropriate movement? Right register? |
| **Chords** | Voice leading smooth? Right voicing complexity for genre? Rhythm of chord changes? |
| **Melody** | In scale? Motif development? Chord-tone alignment on strong beats? Has space/rests? |
| **Full mix** | All parts in same key? Layers interlock rhythmically? Density appropriate? Dynamic? |

### When to stop iterating

A piece is done when:
- The evaluation subagent has no major issues
- Each layer contributes something distinct
- Removing any layer would leave a noticeable gap
- It matches the composition brief's principles
- The user is satisfied

## Handling Common Requests

**"Make it sound like [X]"** — Research that reference heavily. Extract its defining
characteristics. Feed those into new composition principles.

**"I don't know what I want"** — Ask about mood, tempo, instruments.
Use answers to drive research.

**"Change key/BPM/genre"** — Key = transpose. BPM = adjust density. Genre = restart research.

**"Add [instrument]"** — Research its role in the genre. Draft → evaluate → refine → add.

**"It sounds robotic/boring"** — Likely missing: velocity variation, space, motif development,
dynamic contrast. Evaluate and fix one issue at a time.

## Related Skills

- **music-theory-engine** — Genre research, theory analysis, composition principles
- **strudel-maestro** — Strudel pattern research, prototyping, and refinement
