# LLM Symbolic Music Composition Skills — Deep Research

> Date: 2026-03-29
> Purpose: Research how to build Claude Code skills that enable high-quality symbolic music composition in ACE-Step-DAW

## Executive Summary

**Key Insight**: The original roadmap (#739, #740) planned dedicated MIDI Language Models (Anticipatory Music Transformer, MIDI-GPT, NotaGen, ChordSeqAI) for symbolic music generation. However, Claude Code — already integrated into the DAW — can handle symbolic music composition tasks directly with well-designed skills. This is a paradigm shift: instead of running specialized neural networks for each musical task, we leverage a general-purpose reasoning LLM with structured music knowledge.

**Why this matters**:
- **Zero additional infrastructure** — no GPU backend, no ONNX models, no WebGPU setup
- **Interactive & conversational** — users describe what they want in natural language
- **Explainable** — Claude can explain its musical choices
- **Flexible** — handles arbitrary musical tasks, not just infill/continue/arrange
- **Already integrated** — DAW has MCP tools, Strudel engine, store API, MIDI types

**The approach**: Build specialized Claude Code skills that encode music theory knowledge, composition patterns, and DAW-specific output formats. Claude generates music as Strudel patterns or MIDI note arrays via the store API.

---

## 1. Current DAW Capabilities (What We Already Have)

### 1.1 Strudel Integration (strudelEngine.ts)
- TidalCycles-compatible pattern language running in-browser
- Full API: `note()`, `s()`, `stack()`, `seq()`, `bank()`, mini-notation
- BPM-synced to DAW transport
- **Bidirectional conversion**: `midiToStrudelCode()` and `strudelEventsToMidiNotes()`
- Live evaluation with Superdough synthesis

### 1.2 Store API (window.__store)
- `addTrack()`, `addMidiNotes(trackId, notes[])`, `updateClip()`
- Full MIDI note representation: `{ id, pitch, startBeat, durationBeats, velocity }`
- Undo/redo support for all mutations

### 1.3 DAW MCP Tools
- `daw_get_project` — read full project state
- `daw_add_track` — create tracks
- `daw_set_transport` — control playback
- Generation pipeline for text-to-music (ACE-Step AI)

### 1.4 Existing AI Model Plans
- **#739**: MIDI AI (Anticipatory Music Transformer, MIDI-GPT, NotaGen) — infill, continue, arrange, variation
- **#740**: Chord AI (ChordSeqAI, musicautobot, AccoMontage2, REMI) — suggest, harmonize, continue, from_text
- **#741**: Unified model architecture
- **#752**: PR with all type definitions merged
- **#756**: Strudel Phase 3 — AI generation bridge

---

## 2. LLM-Based Symbolic Music Generation — State of the Art

### 2.1 Key Projects & Papers

| Project | Approach | Format | Key Insight |
|---------|----------|--------|-------------|
| **ChatMusician** (2024) | Fine-tuned LLaMA on ABC notation | ABC notation | LLMs can learn music structure from text; ABC notation is the most LLM-friendly format |
| **MuseCoco** (2023) | Text attributes → symbolic music | REMI tokens | Attribute-to-music pipeline; decompose generation into controllable attributes |
| **MusicAgent** (2023) | LLM as orchestrator of music tools | Multi-format | LLM doesn't generate music directly — it plans and delegates to specialized tools |
| **SongComposer** (2024) | LLM for full song composition | Custom symbolic | Tuples format (pitch, duration, rest) enables precise symbolic output |
| **GPT-4 Music Experiments** | Zero-shot/few-shot prompting | ABC, Lilypond | General LLMs can write valid ABC notation and chord progressions without fine-tuning |
| **Anticipatory Music Transformer** | Infilling-native architecture | MIDI tokens | Best for DAW integration: select region → fill; 128M params, Apache 2.0 |
| **NotaGen** (2025) | Pre-trained on 1.6M music pieces | ABC notation | SOTA in notation-quality generation; uses ABC as native format |

### 2.2 Music Representation Formats for LLMs

**Ranked by LLM suitability**:

1. **ABC Notation** ⭐⭐⭐⭐⭐
   - Compact, text-based, well-tokenized by LLMs
   - Standard: `X:1\nT:Title\nM:4/4\nK:C\n|: C D E F | G2 G2 :|`
   - LLMs trained on internet data already know ABC
   - Tools: `abc2midi`, `abcjs` (browser rendering)
   - **Best for Claude**: already in training data, easy to parse

2. **Strudel/TidalCycles Patterns** ⭐⭐⭐⭐⭐
   - Already integrated in our DAW!
   - `note("c4 e4 g4 c5").s("piano")` — readable, composable
   - Polyphonic: `stack(melody, bass, drums)`
   - **Best for our DAW**: zero conversion needed

3. **Chord Symbols + Rhythm** ⭐⭐⭐⭐
   - `Cmaj7 | Dm7 | G7 | Cmaj7` — universally understood
   - Pair with rhythm notation: `C:4 D:8 E:8 F:4 G:2`
   - Claude already understands chord theory deeply

4. **MIDI Note Arrays (JSON)** ⭐⭐⭐⭐
   - `[{pitch: 60, start: 0, duration: 1, velocity: 0.8}]`
   - Direct mapping to our `MidiNote` type
   - Verbose but unambiguous

5. **Lilypond** ⭐⭐⭐
   - `\relative c' { c4 d e f | g2 g | }`
   - More complex syntax, but very precise
   - Good for classical/notation-heavy output

6. **MusicXML** ⭐⭐
   - Too verbose for LLM generation (XML overhead)
   - Better as an interchange format

7. **Humdrum **kern** ⭐⭐
   - Academic standard, not well-known to LLMs
   - `*M4/4\n4c\t4e\t4g\n4d\t4f\t4a`

### 2.3 What Claude Already Knows (Zero-Shot Capabilities)

Claude (without any special skills) can already:
- Write valid ABC notation for simple melodies
- Generate chord progressions in any key/style
- Explain voice leading and counterpoint rules
- Write Strudel/TidalCycles patterns (it knows the syntax)
- Generate MIDI note arrays as JSON
- Understand song structure (verse/chorus/bridge)
- Apply genre conventions (jazz voicings, EDM drops, etc.)

**The gap**: Claude lacks structured output format guidance, DAW-specific constraints (BPM, bar alignment, velocity curves), and iterative refinement workflows.

---

## 3. Skill Design Strategy

### 3.1 Architecture: Three-Layer Skill Stack

```
┌─────────────────────────────────────────────┐
│  Layer 3: WORKFLOW SKILLS                    │
│  /jam, /compose, /arrange, /generate        │
│  (User-facing, orchestrate lower layers)    │
└──────────────────┬──────────────────────────┘
                   │ uses
┌──────────────────▼──────────────────────────┐
│  Layer 2: COMPOSITION SKILLS                 │
│  /compose-melody, /compose-chords,          │
│  /compose-bass, /compose-drums              │
│  (Task-specific, output Strudel/MIDI)       │
└──────────────────┬──────────────────────────┘
                   │ references
┌──────────────────▼──────────────────────────┐
│  Layer 1: KNOWLEDGE SKILLS                   │
│  music-theory-engine, genre-patterns,       │
│  strudel-reference, arrangement-templates   │
│  (Reference data, loaded on-demand)         │
└─────────────────────────────────────────────┘
```

### 3.2 Layer 1: Knowledge Skills (Non-Interactive References)

#### music-theory-engine
- Scales & modes (all 12 keys × major/minor/modal/pentatonic/blues/etc.)
- Chord construction rules (triads, 7ths, extensions, alterations)
- Common progressions by genre (I-V-vi-IV pop, ii-V-I jazz, etc.)
- Voice leading rules (avoid parallel 5ths, smooth motion, etc.)
- Tension/resolution patterns
- Rhythm patterns by genre and time signature
- Velocity curves and dynamics

#### genre-patterns
- Pop: 4-chord progressions, verse/pre-chorus/chorus, 120 BPM range
- Jazz: ii-V-I, tritone substitution, walking bass, swing 8ths
- EDM: build/drop structure, sidechain patterns, 128 BPM
- Hip-Hop: boom-bap patterns, trap hi-hats, 808 bass
- Classical: sonata form, counterpoint, orchestration
- Lo-Fi: jazz chords + detuned keys + vinyl crackle patterns
- Rock: power chords, blues scale, 4/4 backbeat
- R&B: neo-soul voicings, syncopation, chromatic movement

#### strudel-reference
- Complete Strudel API for Claude (note(), s(), stack(), seq(), etc.)
- Pattern combinators (.rev(), .fast(), .slow(), .jux(), etc.)
- Sound banks and instruments available
- Drum pattern notation
- Best practices for readable Strudel code
- Common patterns and idioms

### 3.3 Layer 2: Composition Skills (Task-Specific)

#### compose-melody
- Input: key, scale, BPM, style, bar count, reference melody (optional)
- Process: Apply melodic contour theory, motif development, rhythm variation
- Output: Strudel pattern or MIDI note array
- Constraints: Stay in key (with passing tones), respect bar boundaries, vary rhythm

#### compose-chords
- Input: key, genre, bar count, melody (optional for harmonization)
- Process: Select progression template → voice the chords → add rhythm
- Output: Chord symbols + Strudel voicing pattern
- Modes: suggest, harmonize, continue, from-description

#### compose-bass
- Input: chord progression, genre, BPM
- Process: Genre-appropriate bass patterns (walking, root-fifth, synth bass)
- Output: Strudel pattern or MIDI notes

#### compose-drums
- Input: genre, BPM, time signature, energy level
- Process: Genre-appropriate drum patterns with fills
- Output: Strudel drum pattern or sequencer data

### 3.4 Layer 3: Workflow Skills (User-Facing)

#### /jam (enhanced)
- Interactive back-and-forth composition
- "Give me a chill lo-fi beat" → generates drums + bass + keys
- Iterative: "make the hi-hats busier", "add a walking bass"
- Uses Layer 2 skills internally

#### /compose (new)
- Full song composition workflow
- Step 1: Song structure (sections, bars per section)
- Step 2: Chord progression per section
- Step 3: Melody/lead per section
- Step 4: Bass line
- Step 5: Drums
- Step 6: Fills and transitions
- Each step outputs to a track

#### /arrange (enhanced)
- Analyze existing tracks → suggest improvements
- Add complementary parts
- Suggest dynamics and energy curve

---

## 4. Output Format Strategy

### 4.1 Primary: Strudel Patterns (for live/iterative work)

```javascript
// Claude generates this:
stack(
  // Melody
  note("c5 e5 g5 c6").s("piano").velocity("0.8 0.7 0.9 1.0"),
  // Chords
  note("<c3 e3 g3> <d3 f3 a3> <g2 b2 d3> <c3 e3 g3>")
    .s("piano").velocity(0.5),
  // Bass
  note("c2 c2 d2 d2 g1 g1 c2 c2").s("sawtooth")
    .lpf(400).velocity(0.7),
  // Drums
  s("bd sd bd sd").bank("RolandTR808")
)
```

**Advantages**: Immediate playback, live editing, pattern is the code.

### 4.2 Secondary: MIDI Note Arrays (for piano roll editing)

```json
[
  {"pitch": 60, "startBeat": 0, "durationBeats": 1, "velocity": 0.8},
  {"pitch": 64, "startBeat": 1, "durationBeats": 1, "velocity": 0.7},
  {"pitch": 67, "startBeat": 2, "durationBeats": 1, "velocity": 0.9},
  {"pitch": 72, "startBeat": 3, "durationBeats": 1, "velocity": 1.0}
]
```

**Advantages**: Precise control, editable in piano roll, quantized.

### 4.3 Intermediate: ABC Notation (for complex compositions)

```abc
X:1
T:Generated Melody
M:4/4
L:1/8
K:C
|: C2 DE FG AB | c4 B2 AG | F2 ED C2 E2 | D6 z2 :|
```

**Use case**: Generate complex notation → convert to MIDI → import to DAW.
Requires abc2midi conversion (can be done client-side with abcjs library).

---

## 5. Key Technical Decisions

### 5.1 Strudel as Primary Symbolic Interface
- Already integrated (#754, #755, #756)
- Text-based = perfect for LLM I/O
- Live evaluation = instant feedback
- Bidirectional conversion to MIDI exists
- **Decision**: Strudel is the primary output format for Claude composition skills

### 5.2 Music Theory as Prompt Engineering (Not Fine-Tuning)
- Claude already has strong music theory knowledge
- Skills provide: structured constraints, output format templates, genre-specific rules
- No need to fine-tune — prompt engineering + structured skills is sufficient
- **Decision**: Skills are prompt templates + reference data, not model weights

### 5.3 Iterative Refinement via Conversation
- MIDI LMs generate in one shot — hard to control
- Claude can iterate: "make the bass more syncopated", "transpose chorus up a 4th"
- Each iteration reads current state via MCP, modifies via store API
- **Decision**: Leverage conversational iteration as a core differentiator

### 5.4 Hybrid Approach: Claude + MIDI LMs
- Claude for high-level composition, structure, chord progressions, arrangement
- MIDI LMs (#739) for low-level note generation, infilling, variation
- Claude orchestrates MIDI LM calls when needed
- **Decision**: Skills should support both direct generation and MIDI LM delegation

---

## 6. Competitive Analysis

### 6.1 Existing AI-Assisted DAW Tools

| Tool | Approach | Symbolic? | Interactive? | Limitation |
|------|----------|-----------|-------------|------------|
| **AIVA** | Neural net composition | Yes (MIDI) | Limited (style selection) | Black box, no iteration |
| **Amper/Shutterstock** | Template + ML | No (audio) | Style knobs | No symbolic control |
| **Soundraw** | AI composition | No (audio) | Genre/mood selection | No MIDI export |
| **Suno** | End-to-end audio | No | Text prompt | No symbolic layer |
| **Udio** | End-to-end audio | No | Text prompt | No symbolic layer |
| **BandLab SongStarter** | ML suggestions | Partial | Limited | Basic patterns only |
| **Ableton Max4Live ChatGPT** | LLM → M4L code | Yes | Conversational | Requires Max, slow |
| **ACE-Step + Claude (ours)** | LLM + skills + Strudel | **Yes** | **Full conversation** | Needs good skills |

### 6.2 Our Differentiator
- **Only DAW with a conversational AI that understands music theory AND controls the DAW**
- AIVA/Suno generate audio — we generate symbolic music that's fully editable
- Claude can explain, iterate, teach, and collaborate — not just generate

---

## 7. Implementation Priority

### Phase 1: Foundation Skills (This PR)
1. `music-theory-engine` — knowledge base skill
2. `strudel-maestro` — Strudel pattern generation skill
3. `compose` — structured composition workflow skill
4. Update `/jam` and `/generate` to use new skills

### Phase 2: Genre & Arrangement
5. `genre-patterns` — genre-specific knowledge
6. Enhanced `/arrange` with AI suggestions
7. Template library for common patterns

### Phase 3: Hybrid Claude + MIDI LM
8. Claude orchestrates MIDI LM calls (#739)
9. Claude provides musical constraints to MIDI LMs
10. Best-of-both-worlds: Claude for structure, MIDI LM for texture

---

## 8. References

### Papers
- ChatMusician: Making LLMs Understand and Generate Music (2024)
- MuseCoco: Generating Symbolic Music from Text (2023)
- MusicAgent: An AI Agent for Music Understanding and Generation (2023)
- SongComposer: A Large Language Model for Song Composition (2024)
- Anticipatory Music Transformer (2023) — infilling architecture
- NotaGen: Advancing Music Generation with Large-Scale Pre-Training (2025)

### Tools & Libraries
- Strudel (TidalCycles for the browser) — github.com/tidalcycles/strudel
- tonal.js — Music theory library for JavaScript — github.com/tonaljs/tonal
- abcjs — ABC notation rendering in browser — github.com/paulrosen/abcjs
- MidiTok — MIDI tokenization for ML — github.com/Natooz/MidiTok
- music21 — Python music theory toolkit — web.mit.edu/music21

### Existing ACE-Step DAW Issues
- #739 — MIDI AI generation (Anticipatory Music Transformer)
- #740 — Chord AI (ChordSeqAI, musicautobot)
- #741 — Unified AI model architecture
- #752 — API type definitions (merged)
- #754, #755, #756 — Strudel integration phases 1-3
