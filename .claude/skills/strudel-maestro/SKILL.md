---
name: strudel-maestro
version: 1.0.0
description: |
  LLM-optimized guide for generating Strudel/TidalCycles patterns in ACE-Step-DAW.
  Covers the Strudel API, pattern idioms, best practices, and templates for
  AI-assisted music composition. Use when generating Strudel code for the DAW.
---

# Strudel Maestro — Pattern Generation Guide

> This skill teaches Claude how to write effective Strudel patterns for ACE-Step-DAW.
> Strudel is a TidalCycles-compatible music pattern language running in-browser.

---

## 1. Core Concepts

### What is Strudel?
- JavaScript-based live coding language for music
- Patterns describe **cycles** — repeating musical structures
- Each cycle = 1 bar by default (adjustable)
- Patterns combine via `stack()` (simultaneous) and `seq()` (sequential)

### How It Works in ACE-Step-DAW
- Each track can have a Strudel code editor
- Code is evaluated live via `evaluateStrudelCode(trackId, code)`
- Audio synthesis via Superdough (built-in synths + samples)
- BPM synced to DAW transport
- Can be converted to MIDI: `strudelEventsToMidiNotes()`
- Can import MIDI: `midiToStrudelCode()`

---

## 2. API Reference

### Sound Selection

```javascript
// Play a sound sample
s("bd sd hh sd")           // bass drum, snare, hi-hat, snare

// Play a note with a synth
note("c4 e4 g4 c5")       // plays C major arpeggio with default synth

// Specify sound/instrument
note("c4 e4 g4").s("piano")          // piano sound
note("c4 e4 g4").s("sawtooth")       // synth sawtooth wave
s("bd sd hh oh").bank("RolandTR808") // use TR-808 drum kit
```

### Note Notation

```javascript
// Named notes with octave
note("c4 d4 e4 f4")       // C D E F in octave 4
note("cs4 eb4 fs4 bb4")   // sharps (s) and flats (b)

// MIDI numbers (less readable, but precise)
note("60 62 64 65")        // same as c4 d4 e4 f4

// Rest
note("c4 ~ e4 ~")          // ~ is silence/rest
```

### Timing & Rhythm

```javascript
// Equal subdivision (each note gets equal time in the cycle)
note("c4 d4 e4 f4")        // 4 quarter notes in one cycle

// Grouping (subdivide a beat)
note("c4 [d4 e4] f4 g4")   // d4 and e4 share one beat (eighth notes)
note("c4 [d4 e4 f4] g4 a4") // d4 e4 f4 share one beat (triplet)

// Elongation
note("c4@2 e4 g4")          // c4 gets 2 beats, e4 and g4 get 1 each

// Replication
note("c4*2 e4 g4")          // c4 plays twice in its slot (= subdivision)

// Rests and holds
note("c4 ~ ~ e4")           // rest on beats 2 and 3
note("c4@3 e4")              // c4 held for 3 beats
```

### Pattern Combinators

```javascript
// Stack — play simultaneously (layers)
stack(
  note("c4 e4 g4 c5").s("piano"),        // melody
  note("c2 g2 c2 g2").s("sawtooth"),     // bass
  s("bd sd bd sd").bank("RolandTR808")    // drums
)

// Sequence — play one after another
seq(
  note("c4 d4 e4 f4"),  // bar 1
  note("g4 a4 b4 c5")   // bar 2
)

// Alternation (cycle between patterns)
note("<c4 e4> <d4 f4> <e4 g4> <f4 a4>")  // different note each cycle

// Cat — same as seq but explicit
cat(
  note("c4 d4 e4 f4"),
  note("e4 f4 g4 a4")
)

// Fastcat — squeeze all into one cycle
fastcat(
  note("c4 d4 e4 f4"),
  note("e4 f4 g4 a4")
)
```

### Transformations

```javascript
// Speed
note("c4 e4 g4").fast(2)     // play pattern twice per cycle (double time)
note("c4 e4 g4").slow(2)     // pattern takes 2 cycles (half time)

// Reverse
note("c4 d4 e4 f4").rev()    // f4 e4 d4 c4

// Every N cycles, apply transform
note("c4 e4 g4 c5").every(4, x => x.rev())  // reverse every 4th bar

// Jux — play original left, transformed right
note("c4 e4 g4").jux(x => x.rev())  // stereo counterpoint

// Offset
note("c4 e4 g4").late(0.25)   // delay by quarter cycle
note("c4 e4 g4").early(0.125) // advance by eighth cycle
```

### Effects & Dynamics

```javascript
// Volume & velocity
note("c4 e4 g4").velocity(0.8)                    // fixed velocity
note("c4 e4 g4").velocity("0.5 0.7 1.0")          // per-note velocity
note("c4 e4 g4").gain(0.6)                         // output gain

// Filter
note("c4 e4 g4").lpf(800)                          // low-pass filter at 800Hz
note("c4 e4 g4").lpf("200 400 800 1600")           // filter sweep
note("c4 e4 g4").hpf(200)                          // high-pass filter

// Effects
note("c4 e4 g4").delay(0.3).delaytime(0.25)        // delay effect
note("c4 e4 g4").room(0.5).size(0.8)               // reverb
note("c4 e4 g4").pan("0 0.5 1")                    // panning L-C-R

// ADSR envelope
note("c4 e4 g4").attack(0.01).decay(0.1).sustain(0.5).release(0.3)
```

### Chord Patterns

```javascript
// Simultaneous notes (chord)
note("c3,e3,g3")                          // C major chord (single hit)
note("[c3,e3,g3] [d3,f3,a3]")            // C major then D minor

// Voicing with stack
stack(
  note("e4 f4 e4 d4"),                    // melody
  note("[c3,e3,g3] [f3,a3,c4] [g3,b3,d4] [c3,e3,g3]")  // chords
)

// Arpeggiation
note("c3 e3 g3 c4").s("piano")           // manual arpeggio
note("[c3,e3,g3,c4]").arp("up")           // auto arpeggio up
note("[c3,e3,g3,c4]").arp("down")         // auto arpeggio down
note("[c3,e3,g3,c4]").arp("updown")       // auto arpeggio up-down
```

---

## 3. Composition Templates

### Template: Pop Beat (120 BPM, C Major)

```javascript
stack(
  // Drums
  stack(
    s("bd ~ bd ~").bank("RolandTR808"),
    s("~ sd ~ sd").bank("RolandTR808").velocity(0.8),
    s("hh hh hh hh").bank("RolandTR808").velocity("0.5 0.3 0.6 0.3")
  ),
  // Bass
  note("c2 c2 f2 f2 g2 g2 c2 c2")
    .s("sawtooth").lpf(400).velocity(0.7),
  // Chords (pad)
  note("[c3,e3,g3]@2 [f3,a3,c4]@2 [g3,b3,d4]@2 [c3,e3,g3]@2")
    .s("piano").velocity(0.5),
  // Melody
  note("e4 g4 a4 g4 f4 e4 d4 c4")
    .s("triangle").velocity("0.7 0.6 0.8 0.6 0.7 0.6 0.8 0.7")
)
```

### Template: Lo-Fi Hip-Hop (80 BPM, C Dorian)

```javascript
stack(
  // Drums (laid-back)
  stack(
    s("bd ~ [~ bd] ~").bank("RolandTR808").velocity(0.7),
    s("~ sd ~ [~ sd]").bank("RolandTR808").velocity(0.6),
    s("hh hh [hh hh] hh").bank("RolandTR808").velocity("0.3 0.25 0.35 0.2 0.3")
  ),
  // Bass (Dorian)
  note("c2 ~ eb2 ~ f2 ~ g2 ~")
    .s("sawtooth").lpf(300).velocity(0.6),
  // Chords (jazz voicings)
  note("[c3,eb3,g3,bb3]@2 [f3,a3,c4,eb4]@2")
    .s("piano").velocity(0.4).room(0.3),
  // Melody (pentatonic, sparse)
  note("~ g4 ~ eb4 ~ c4 bb3 ~")
    .s("triangle").velocity("~ 0.5 ~ 0.6 ~ 0.4 0.5 ~")
    .room(0.4).delay(0.2)
)
```

### Template: EDM Drop (128 BPM, A Minor)

```javascript
stack(
  // Drums (four on the floor)
  stack(
    s("bd bd bd bd").bank("RolandTR909").velocity(0.9),
    s("~ cp ~ cp").bank("RolandTR909").velocity(0.8),
    s("~ oh ~ oh").bank("RolandTR909").velocity("~ 0.4 ~ 0.5"),
    s("hh*8").bank("RolandTR909").velocity("0.4 0.2 0.5 0.2 0.4 0.2 0.5 0.3")
  ),
  // Bass (side-chain feel via velocity)
  note("a1*4").s("sawtooth")
    .lpf(600).velocity("0.9 0.3 0.7 0.3"),
  // Lead (riff)
  note("a4 c5 e5 a5 e5 c5 a4 e4")
    .s("square").lpf(2000).velocity(0.7)
    .room(0.2).delay(0.15)
)
```

### Template: Jazz Swing (140 BPM, ii-V-I in C)

```javascript
stack(
  // Ride cymbal (swing pattern using triplet subdivision)
  s("[hh ~ hh] [hh ~ hh] [hh ~ hh] [hh ~ hh]")
    .bank("RolandTR808").velocity("0.6 ~ 0.3 0.6 ~ 0.3 0.6 ~ 0.3 0.6 ~ 0.3"),
  // Walking bass (Dm7 - G7 - Cmaj7 - Cmaj7)
  note("d2 f2 a2 c3  g2 b2 d3 f2  c2 e2 g2 b2  c2 g2 e2 c2")
    .s("sawtooth").lpf(500).velocity(0.6),
  // Chord comping (sparse, syncopated)
  note("~ [d3,f3,a3,c4] ~ ~  [g3,b3,d4,f4] ~ ~ ~  [c3,e3,g3,b3] ~ ~ ~  ~ [c3,e3,g3,b3] ~ ~")
    .s("piano").velocity("~ 0.4 ~ ~ 0.5 ~ ~ ~ 0.45 ~ ~ ~ ~ 0.4 ~ ~")
)
```

### Template: Trap Beat (140 BPM half-time, B Minor)

```javascript
stack(
  // Drums
  stack(
    s("bd ~ ~ ~ ~ ~ [~ bd] ~").bank("RolandTR808").velocity(0.9),
    s("~ ~ ~ ~ sd ~ ~ ~").bank("RolandTR808").velocity(0.85),
    s("hh*16").bank("RolandTR808")
      .velocity("0.4 0.2 0.3 0.2 0.5 0.2 0.3 0.2 0.4 0.2 0.3 0.2 0.5 0.2 0.4 0.3")
  ),
  // 808 bass
  note("b1@4 ~ ~ ~ fs1@2 ~ ~")
    .s("sawtooth").lpf(200).velocity(0.8),
  // Dark pad
  note("[b2,d3,fs3]@4 [g2,b2,d3]@4")
    .s("sawtooth").lpf(800).velocity(0.3)
    .attack(0.5).release(1)
)
```

---

## 4. Best Practices for LLM-Generated Patterns

### DO

1. **One instrument per line** — makes code readable and editable
2. **Use `stack()` for layering** — clear structure
3. **Use named notes** (c4, e4) not MIDI numbers — more readable
4. **Add velocity variation** — humanizes the output
5. **Comment each layer** — explain musical role
6. **Align to bar boundaries** — patterns should be complete bars
7. **Use genre-appropriate sounds** — TR-808 for hip-hop, TR-909 for house
8. **Keep patterns 1-4 bars** — the cycle repeats, so keep it tight
9. **Use rests (`~`)** — space is as important as notes
10. **Match the BPM** — faster BPM = fewer notes per cycle

### DON'T

1. **Don't overcrowd** — leave rhythmic space
2. **Don't use too many simultaneous layers** — 4-6 is a good max
3. **Don't ignore dynamics** — flat velocity sounds robotic
4. **Don't mix incompatible keys** — all melodic parts must share the key
5. **Don't make every beat busy** — contrast between sparse and dense
6. **Don't forget the bass register** — bass (octave 1-2) anchors the mix
7. **Don't write overly complex patterns** — simpler is usually better musically
8. **Don't use sharp/flat ambiguously** — `cs4` not `c#4` (Strudel uses 's' for sharp)

### Common Mistakes to Avoid

```javascript
// WRONG: Using # instead of s for sharps
note("c#4 f#4")        // ERROR
note("cs4 fs4")        // CORRECT

// WRONG: Chord notes not in the same key
note("[c3,e3,g3] [d3,fs3,a3]")  // F# not in C major!
note("[c3,e3,g3] [d3,f3,a3]")   // CORRECT for C major (Dm)

// WRONG: All notes same velocity
note("c4 d4 e4 f4").velocity(0.8)  // robotic
note("c4 d4 e4 f4").velocity("0.7 0.6 0.8 0.65")  // humanized

// WRONG: Pattern doesn't fill the bar
note("c4 e4 g4")         // 3 notes in 4/4 = triplet feel (maybe intentional)
note("c4 e4 g4 c5")      // 4 notes = quarter notes in 4/4 (clearer)
```

---

## 5. DAW Integration Workflow

### From Strudel to MIDI Clip

When the user wants to "freeze" a Strudel pattern into editable MIDI:

1. Pattern plays in Strudel track
2. Call `strudelEventsToMidiNotes()` to convert
3. Create MIDI clip on a new track with the extracted notes
4. User can edit in piano roll

### From MIDI to Strudel

When the user wants to "live code" from existing MIDI:

1. Read MIDI notes from clip
2. Call `midiToStrudelCode(notes, options)` to convert
3. Output Strudel code to track editor
4. Options: `notationType` (absolute/relative), `quantize`, `soundMapping`

### Pattern Analysis

Use `getStrudelPatternInfo(trackId)` to read:
- Note count
- Pitch range (low, high)
- Instruments used
- Melodic density (notes per beat)

This helps when analyzing existing patterns to suggest improvements.

---

## 6. Multi-Section Arrangement in Strudel

For songs with multiple sections, use `seq()` to chain patterns:

```javascript
// Verse (8 bars) then Chorus (8 bars)
seq(
  // Verse — sparse, lower energy
  stack(
    s("bd ~ bd ~").bank("RolandTR808"),
    s("~ sd ~ sd").bank("RolandTR808").velocity(0.6),
    note("c2 ~ g1 ~").s("sawtooth").lpf(300)
  ).slow(8),  // stretch to 8 bars

  // Chorus — full energy
  stack(
    s("bd sd bd sd").bank("RolandTR808"),
    s("hh*8").bank("RolandTR808").velocity(0.4),
    note("c2 e2 f2 g2").s("sawtooth").lpf(500),
    note("[c3,e3,g3] [f3,a3,c4] [g3,b3,d4] [c3,e3,g3]").s("piano").velocity(0.6)
  ).slow(8)   // stretch to 8 bars
)
```

**Tip**: Use `.slow(N)` to stretch a 1-bar pattern to N bars. The pattern subdivisions still work correctly.
