# Competitive Gap Report: ACE-Step DAW vs Ableton / Logic / FL Studio

Date: 2026-03-18
Scope: Features missing from ACE-Step that all three major competitors offer
Excludes: Gaps already documented in `mixer-ux-gaps.md` and `recording-ux-gaps.md`

---

## Gap 1: Audio Warping / Time-Stretching

**Competitors:** Ableton Warp, Logic Flex Time, FL Studio time-stretching. All allow imported audio clips to be tempo-matched to the project BPM, with multiple algorithms (complex, texture, beats, tonal). Warp markers let users correct timing at specific points.

**ACE-Step:** Imported audio plays at its original tempo. No time-stretching, no warp markers. Users cannot align a 120 BPM loop to a 140 BPM project without re-rendering externally.

**Impact:** HIGH — this is a foundational workflow feature. Without it, imported samples and recorded audio cannot be musically integrated with AI-generated stems at different tempos.

**Implementation path:** Use Web Audio `playbackRate` for basic stretching; for quality, integrate a WASM-compiled pitch-preserving library (e.g., Rubber Band, SoundTouch). Add warp markers to Clip type and a stretch mode selector.

---

## Gap 2: MIDI Effects (Arpeggiator, Chord, Scale)

**Competitors:** Ableton has 8 MIDI effects (Arpeggiator, Chord, Note Length, Pitch, Random, Scale, Velocity). Logic has MIDI FX (Arpeggiator, Chord Trigger, Modifier, Scripter). FL Studio has Articulator and MIDI scripting.

**ACE-Step:** Piano Roll supports manual note editing. No real-time MIDI transformation — no arpeggiator, no chord generator, no scale lock.

**Impact:** MEDIUM-HIGH — arpeggiators and scale lock are creative essentials, especially for users sketching ideas quickly before AI generation. Scale lock alone prevents wrong notes for non-musicians.

**Implementation path:** Add a `midiEffects: MidiEffect[]` array to Track type. Process MIDI notes through the effect chain before sending to SynthEngine. Start with Scale Lock (simplest, highest value) and Arpeggiator.

---

## Gap 3: Sidechain Compression

**Competitors:** All three support sidechain routing — a compressor on one track can be triggered by another track's signal. The classic "pumping" effect (kick ducking the bass/pad) is a staple of electronic music production.

**ACE-Step:** Compressor effect exists in EffectChain but has no sidechain input. Effects are self-contained per track with no cross-track signal routing.

**Impact:** MEDIUM-HIGH — sidechain compression is one of the most-requested mixing techniques, especially given ACE-Step's AI generation presets lean heavily toward electronic, hip-hop, and pop genres.

**Implementation path:** Add a `sidechainSource: trackId | null` parameter to CompressorEffect. In EffectsEngine, route the source track's audio to the compressor's sidechain detector. Tone.js `Compressor` doesn't natively support sidechain, so use raw Web Audio `DynamicsCompressorNode` or a custom gain-envelope follower.

---

## Gap 4: Freeze / Flatten Tracks

**Competitors:** Ableton Freeze renders a track to audio in-place, freeing CPU. Flatten commits the freeze permanently. Logic has Freeze. FL Studio has "Render to audio" per mixer track. All three treat this as essential for managing CPU in complex projects.

**ACE-Step:** No freeze/flatten. Every synth track runs its full Tone.js synthesis chain in real time. Browser-based execution makes CPU management even more critical than in native DAWs.

**Impact:** MEDIUM — becomes critical as projects grow. A 16-track project with effects chains can easily saturate a browser's audio thread budget, causing glitches. Freeze is the standard escape valve.

**Implementation path:** "Freeze" = offline-render the track to a WAV blob via `OfflineAudioContext`, swap the track's playback to a simple `AudioBufferSourceNode`. Store the frozen buffer in IndexedDB. "Unfreeze" = restore original synth/effect chain. UI: snowflake icon on track header, grayed-out controls when frozen.

---

## Gap 5: Tempo Automation & Time Signature Changes

**Competitors:** Ableton supports tempo automation (draw tempo curves on the master track) and time signature changes at any bar. Logic supports both via the Tempo Track and signature list. FL Studio supports tempo automation and per-pattern time signatures.

**ACE-Step:** Fixed BPM set in project settings. Fixed time signature (4/4 implied). No tempo track, no tempo automation lane, no mid-song time signature changes.

**Impact:** MEDIUM — limits compositional range. Songs with intros at different tempos, ritardandos, accelerandos, or mixed-meter sections (common in jazz, progressive, and film scoring) are impossible.

**Implementation path:** Add a `tempoMap: TempoEvent[]` to project state (each event = `{ bar, bpm }` or `{ bar, timeSignature }`). Replace all `bpm` lookups with `getTempoAtBeat(beat)`. This is architecturally invasive — all beat↔time conversions must become tempo-map-aware. Recommend starting with discrete tempo changes per bar (no curves) as v1.

---

## Summary Matrix

| # | Gap | Competitors | User Impact | Effort | Recommended Priority |
|---|-----|------------|-------------|--------|---------------------|
| 1 | Audio Warping / Time-Stretching | All three | HIGH | L | **P1** |
| 2 | MIDI Effects (Arpeggiator, Scale Lock) | All three | MEDIUM-HIGH | M | **P1** |
| 3 | Sidechain Compression | All three | MEDIUM-HIGH | M | **P1** |
| 4 | Freeze / Flatten Tracks | All three | MEDIUM | M | **P1** |
| 5 | Tempo Automation & Time Sig Changes | All three | MEDIUM | XL | **P2** |

## Recommendation

Start with **Gap 2 (MIDI Effects — Scale Lock)** and **Gap 4 (Freeze/Flatten)** — both are medium effort with immediate user value. Gap 1 (Audio Warping) has the highest impact but requires a WASM dependency. Gap 5 (Tempo Automation) should wait as it requires deep architectural changes to beat↔time math throughout the codebase.
