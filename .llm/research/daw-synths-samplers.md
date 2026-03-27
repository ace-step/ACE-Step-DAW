# DAW Synthesizer & Sampler Competitive Research

> Date: 2026-03-26
> Scope: Mainstream DAW built-in instruments vs ACE-Step DAW current state

---

## 1. Ableton Live Built-in Instruments

### Synthesizers

| Instrument | Type | Key Features | ACE-Step Status |
|---|---|---|---|
| **Wavetable** | Wavetable synth | 2 oscillators with wavetable morphing, sub-osc, FM/AM modulation, 2 filters with routing matrix, 3 LFOs, 3 envelopes, unison up to 8 voices | **Missing** |
| **Operator** | FM synth | 4 oscillators, 11 FM algorithms, per-osc filter/pitch envelope, additive harmonics editor | **Missing** (FMSynth exists in LoopLibrary but not exposed as track instrument) |
| **Analog** | Virtual analog | 2 oscillators (saw/square/sine/noise), sub-osc, PWM, sync, 2 multimode filters, 2 LFOs, 2 envelopes, unison | **Partial** — basic presets only, no parameter editing UI |
| **Drift** | Modern analog | 2 oscillators with shape/fold, noise, multimode filter, drift modulation, mod matrix | **Missing** |
| **Meld** | MPE synth | 2 engines (oscillator types), MPE per-note expression, mod matrix, advanced modulation | **Missing** |
| **Collision** | Physical modeling | Mallet + noise exciter, membrane/beam/plate/string resonator, LFO, MIDI velocity mapping | **Missing** |
| **Tension** | String physical modeling | Exciter (bow/hammer/pluck), string model with damping/termination, body resonance, filter | **Missing** |
| **Electric** | Electric piano modeling | Mallet/tine fork/tone bar models, pickup simulation, global effects | **Missing** |

### Samplers

| Instrument | Type | Key Features | ACE-Step Status |
|---|---|---|---|
| **Simpler** | Quick sampler | Warp modes, filter, LFO, envelope, slice mode, 1-shot mode | **Partial** — SamplerEngine has basic playback modes but no warp/slice |
| **Sampler** | Advanced sampler | Multi-sample zones, velocity layers, round-robin, key/velocity crossfading, modulation matrix, 3 LFOs, 6 envelopes | **Missing** — current sampler is single-sample only |
| **Drum Rack** | Drum instrument | 128 pad slots, per-pad chain (instrument+effects), choke groups, macro knobs, return chains | **Partial** — DrumEngine has 16 synth sounds, no sample loading or per-pad effects |

### Audio Effects (instrument-relevant)

| Effect | ACE-Step Status |
|---|---|
| Auto Filter with envelope follower | **Partial** — filter exists but no envelope follower |
| Corpus (resonator) | **Missing** |
| Resonator | **Missing** |
| Spectral Resonator | **Missing** |
| Spectral Time | **Missing** |
| Granulator II (Max for Live) | **Missing** |

---

## 2. Logic Pro Built-in Instruments

| Instrument | Type | Key Features | ACE-Step Status |
|---|---|---|---|
| **Alchemy** | Hybrid synth | Additive, spectral, granular, wavetable, VA, sample-based — all in one. 4 sources, advanced modulation, morphing | **Missing** — most ambitious synth in any DAW |
| **ES2** | Virtual analog | 3 oscillators, FM, ring mod, sync, 2 filters, mod matrix, vector pad | **Missing** |
| **Retro Synth** | Multi-engine | Analog, sync, wavetable, FM modes in one UI | **Missing** |
| **Drum Machine Designer** | Drum kit | Sample-based pads, per-pad quick sampler, smart controls | **Partial** |
| **Quick Sampler** | Quick sampler | Drag-and-drop, auto-slice, optimized recording, warp modes | **Partial** — SamplerEngine covers basics |
| **Sculpture** | Physical modeling | Component modeling (string+exciter+body), morph pad, record automation | **Missing** |
| **EXS24/Sampler** | Multi-sampler | Key/velocity mapping, round-robin, modulation routing, zone editor | **Missing** |

---

## 3. FL Studio Built-in Instruments

| Instrument | Type | Key Features | ACE-Step Status |
|---|---|---|---|
| **Sytrus** | FM/subtractive/RM | 6 operators, ring mod matrix, filter per operator, unison, waveshaping | **Missing** |
| **Harmor** | Additive/resynthesis | Additive engine, image resynthesis, prism, blur, pluck, subtractive post-filter | **Missing** |
| **Flex** | Preset-based multi-engine | Simple UI, many sound packs, internal multi-engine | **Similar approach** to ACE-Step presets |
| **3xOsc** | Basic subtractive | 3 oscillators, detuning, phase, basic but effective | **Partial** — similar level to current SynthEngine |
| **FLEX** | Wavetable/multi | Modern presets, macro knobs | **Missing** |
| **DirectWave** | Multi-sampler | SFZ/SF2 import, zone editor, ADSR, filters | **Missing** |
| **Slicex** | Beat slicer | Auto-slice audio, rearrange via piano roll, stretch modes | **Missing** |
| **Fruity Granulizer** | Granular | Grain size, spacing, randomize, attack shape | **Missing** |

---

## 4. Popular 3rd-Party Instruments (Cross-DAW)

| Plugin | Type | Why It Matters | Web Audio Feasibility |
|---|---|---|---|
| **Serum** (Xfer) | Wavetable | Industry standard for EDM/pop. Visual wavetable editor, drag-and-drop modulation | **High** — wavetable playback is straightforward in Web Audio |
| **Vital** (Matt Tytel) | Wavetable | Free/open-source Serum alternative. Same feature set, spectral warping | **High** — open source, could reference implementation |
| **Surge XT** | Hybrid | Open-source, 3 oscillators (classic/modern/FM/wavetable/string), dual filter, mod matrix | **Medium** — complex but core concepts are portable |
| **Diva** (u-he) | Virtual analog | CPU-heavy analog modeling, zero-delay feedback filters | **Low** — too CPU intensive for Web Audio |
| **Kontakt** (NI) | Multi-sampler | Industry standard sampler, scripting, massive library ecosystem | **Low** — library system not applicable to web |
| **Omnisphere** (Spectrasonics) | Hybrid | Granular, wavetable, sample, most versatile synth | **Low** — too complex |

---

## 5. Web Audio DAW Competitors

| Platform | Instruments Available |
|---|---|
| **BandLab** | 100+ virtual instruments (MIDI), basic synth presets, drum machine, sample library |
| **Soundtrap** (Spotify) | Built-in synths with presets, pattern beat maker, loops library |
| **Amped Studio** | Subtractive synth, FM synth, drum machine, sampler, SF2 support |
| **Splice** | Sample-based only (drag-and-drop), no built-in synthesis |
| **AudioTool** | Multiple synths (Heisenberg FM, Machiniste subtractive, Pulverisateur granular), most complete web synths |

**Key takeaway**: AudioTool is the gold standard for web-based synthesis. BandLab and Soundtrap focus on presets over deep editing. ACE-Step can differentiate with AI-integrated synthesis.

---

## 6. Synthesis Types — Priority for ACE-Step DAW

| Synthesis Type | Description | Web Audio Feasibility | Priority | Justification |
|---|---|---|---|---|
| **Subtractive** (enhanced) | Oscillators → Filter → Amp. Add proper filter ADSR, LFO routing, unison, detune | **Very High** — Tone.js native | **P0** | Current SynthEngine is too basic. Every DAW has this. |
| **FM Synthesis** | Operators modulating each other's frequency | **Very High** — Tone.FMSynth exists | **P1** | Already in Tone.js. Operator-style FM is a staple. |
| **Wavetable** | Cycle through wavetable frames for evolving timbres | **High** — PeriodicWave API + custom buffers | **P1** | Most popular modern synth type (Serum, Vital, Wavetable) |
| **Sample-based (multi)** | Key/velocity-mapped zones, round-robin | **High** — buffer playback with zone logic | **P1** | Required for realistic instruments (piano, strings, drums) |
| **Granular** | Tiny grains from audio buffer, randomized playback | **High** — AudioBufferSourceNode with scheduling | **P2** | Unique textures, ambient/experimental. Feasible in Web Audio |
| **Physical Modeling** | Waveguide/Karplus-Strong string models | **Medium** — needs AudioWorklet for efficiency | **P2** | Unique sounds, CPU moderate in AudioWorklet |
| **Additive** | Sum of sine partials with individual control | **Medium** — many oscillators needed | **P3** | Niche use, CPU heavy with many partials |
| **Spectral** | FFT-based sound manipulation | **Medium** — AnalyserNode + IFFT in AudioWorklet | **P3** | Advanced, unique to few DAWs |

---

## 7. Gap Analysis — ACE-Step DAW vs Mainstream

### Critical Gaps (P0 — blocks basic music production)

1. **No synth parameter editing UI** — Users can only pick presets, can't tweak filter cutoff, ADSR, oscillator shape. Every DAW exposes these.
2. **No filter envelope on synth** — Only amplitude ADSR exists. Filter ADSR is fundamental to subtractive synthesis.
3. **No LFO on synth oscillators/filter** — Only global filter effect has LFO. Per-voice LFO is standard.
4. **No unison/detune** — Can't stack voices for thick sounds. Basic feature in all synths.
5. **Effects chain not connected to live audio** — S1-03 blocker: effects are UI-only, not wired to playback.

### High Priority Gaps (P1 — expected in any serious DAW)

6. **No FM synthesis on tracks** — Tone.FMSynth exists but not exposed as a track instrument type.
7. **No wavetable synthesis** — Most popular modern synth type, feasible via Web Audio PeriodicWave.
8. **No multi-sample instrument** — Current sampler loads one sample. Can't build realistic piano/strings/drums.
9. **No drum sample loading** — DrumEngine is synthesis-only. Users can't drop their own samples on pads.
10. **No per-pad effects/tuning on drum machine** — Fixed sound parameters per kit.
11. **No velocity layers/crossfading** — No dynamic sample switching based on velocity.
12. **No sample slicing** — Can't auto-slice loops and trigger slices via MIDI.

### Medium Priority Gaps (P2 — differentiators)

13. **No granular synthesis engine** — Unique textures for ambient/experimental music.
14. **No physical modeling** — Karplus-Strong / waveguide would add unique pluck/string sounds.
15. **No modulation matrix** — Can't route LFOs/envelopes to arbitrary parameters.
16. **No convolution reverb** — Only algorithmic reverb. Convolver is built into Web Audio API.
17. **No audio warp/time-stretch** — Sampler uses playbackRate which changes pitch with tempo.
18. **No sidechain routing UI** — CompressorParams has `sidechainSourceTrackId` but no UI.

### Lower Priority Gaps (P3 — advanced/niche)

19. **No additive synthesis** — Partial-level control for specialized sound design.
20. **No spectral processing** — FFT-based editing/morphing.
21. **No MPE support** — Per-note expression for modern controllers.
22. **No preset browser/manager** — No way to save/load/share synth presets.
23. **No freeze/bounce** — Can't render instrument tracks to audio for CPU savings.

---

## 8. Recommended Implementation Roadmap

### Phase 1: Enhanced Subtractive Synth (P0)
- Expose synth parameters in UI (oscillator type, filter cutoff/resonance, ADSR for amp+filter)
- Add per-voice filter with ADSR envelope
- Add LFO with routeable destinations (pitch, filter, amp)
- Add unison/detune controls
- Wire effects chain to live audio (S1-03)

### Phase 2: New Synthesis Engines (P1)
- FM Synth track type (expose Tone.FMSynth with operator controls)
- Wavetable synth (custom wavetable loading + morphing)
- Multi-sample instrument (zone editor, velocity layers)
- Enhanced drum rack (sample loading per pad, per-pad tuning/effects)

### Phase 3: Advanced Features (P2)
- Granular synthesis engine (AudioWorklet-based)
- Physical modeling (Karplus-Strong in AudioWorklet)
- Modulation matrix (visual routing)
- Convolution reverb (IR loading)
- Audio warp/time-stretch

### Phase 4: Polish (P3)
- Preset browser and manager
- MPE support
- Freeze/bounce to audio
- Additive/spectral engines
