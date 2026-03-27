# openDAW by Andre Michelle -- Architecture Research

Date: 2026-03-27
Topic: openDAW audio architecture, design decisions, and competitive analysis
Researcher: Competitive Research Agent

---

## 1. Andre Michelle -- Background

Andre Michelle is a Cologne-based developer with 25+ years in web audio. Career arc:

- **1990s**: Techno DJ
- **2005**: Pioneered an audio hack for audio stream generation in Flash ahead of browser support
- **2007**: Emulated the Roland TR-909 in Flash -- this became the foundation of Audiotool
- **2008-2023**: Co-founded and served as CTO of Audiotool (audiotool.com), a browser-based DAW that grew to 500,000+ users and 200,000+ tracks. Originally Flash, migrated to HTML5/Web Audio API in 2015.
- **2023**: Left Audiotool due to "difference in vision" for the platform's future
- **2023-present**: Building openDAW from scratch, open-source under AGPL-3

He spoke at Reasons.to (Brighton, 2010) and Smashing Conf Meets Music (October 2025). He has participated in W3C public-audio mailing list discussions about AudioWorklet architecture.

---

## 2. Audio Architecture -- Deep Technical Details

### 2.1 Worker + SharedArrayBuffer + AudioWorklet Pattern

From Andre's 2020 W3C mailing list post (while still at Audiotool):

- **DSP runs in a dedicated Worker thread** (not the main thread, not directly in AudioWorklet)
- **SharedArrayBuffer** is used to pass audio data from the Worker to the AudioWorklet via a **ring buffer**
- The AudioWorklet acts as a thin playback layer -- it reads from the ring buffer and outputs to speakers
- This architecture was a **workaround** because AudioWorklet had main-thread dependencies causing glitches during CSS/canvas updates

**Why this matters**: This is the same fundamental challenge ACE-Step DAW faces with Tone.js. Tone.js runs on the main thread and is susceptible to UI-induced audio glitches.

### 2.2 Key Technical Requirements (from Andre)

1. **Thread isolation**: DSP code must run on a prioritized thread without dependencies on garbage collection, event loops, or graphics updates
2. **Glitch elimination**: No audible pops/clicks caused by main thread interference
3. **Configurable buffer size**: Wants an adjustable audio ring buffer (relaxing the 128-frame AudioWorklet block size) to handle short performance peaks
4. **Performance note**: Andre stated that Audiotool's Web Audio performance "seems to be worse than in Flash" -- partly due to Chromebook constraints

### 2.3 openDAW's Current Architecture

- **TypeScript-first**: 95.8% TypeScript, minimal external dependencies
- **No framework**: Deliberately avoids React, Vue, etc. Custom DOM management
- **Web Audio API**: Direct usage, not through Tone.js or similar abstraction layers
- **WASM for specific tasks**:
  - `@ffmpeg/ffmpeg` (ffmpeg.wasm) for audio decoding/encoding
  - TONE3000 integration uses WebAssembly runtime for NAM (Neural Amp Modeling) captures
  - Architecture allows porting VST algorithms to WebAssembly
- **JS/TS plugin format**: Plugins are TypeScript/JavaScript, not WASM by default. But WASM is supported where needed.
- **AudioWorklet**: Used for real-time audio processing, isolated from main thread
- **Monorepo structure**: Uses Lerna + Turbo, with packages for studio app, headless SDK, and device plugins
- **Minimal deps**: Only jszip (project bundles), ffmpeg.wasm (audio codecs), zod (validation), soundfont2 (soundfont loading), markdown-it (docs), d3-force (debug viz)
- **24-bit/96kHz support**: Oversampling for anti-aliasing, sample-accurate scheduling, low-latency monitoring

### 2.4 Stock Audio Devices (17 total)

- **Vaporisateur**: Subtractive synthesizer with classical waveforms
- **Playfield**: Sample-based drum computer with individual effect chains per pad
- **Nano**: Single-file sampler for quick audio manipulation
- **Tape**: Advanced audio region and clip playback engine
- **TONE3000 integration**: 275,000+ NAM captures via WebAssembly runtime
- Plus additional effects, EQ, delay, reverb, compressor, etc.

### 2.5 Modular System

Similar to Bitwig's The Grid or Logic's Environment:
- Users can build custom processing chains or sequencing engines
- "Discoverable toys" -- non-classical interfaces for creating sequences and modulations
- Modular routing for signal flow

---

## 3. Project Format and Storage

- **`.odaw` format**: ZIP bundles containing audio files + JSON metadata
- **Open spec**: Anyone can build tools to read/manipulate projects
- **DAWproject import/export**: App-agnostic pipeline for interoperability
- **Cloud sync**: Google Drive and Dropbox via OAuth (credentials never touch openDAW servers)
- **No server-side storage**: Everything stays in user's own cloud or local disk

---

## 4. Headless SDK

`opendaw-headless` is a separate package that provides the audio engine without UI:
- Build custom audio applications
- CI/CD pipelines for audio processing
- Server-side audio rendering
- Same engine as the full DAW

This is architecturally significant: it means the audio engine is fully decoupled from the UI layer.

---

## 5. Privacy and Licensing

- AGPL-3 (or later) for open source
- Commercial license available for closed-source integrations
- Eight privacy principles: No SignUp, No Tracking, No Cookies, No Profiling, No T&C, No Ads, No Paywalls, No Data Mining
- Runs on $200 Chromebooks -- designed for school computer labs

---

## 6. Comparison: openDAW vs ACE-Step DAW Architecture

| Aspect | openDAW | ACE-Step DAW |
|--------|---------|--------------|
| Audio engine | Custom Web Audio API, Worker+AudioWorklet | Tone.js (main thread) |
| Framework | None (custom DOM) | React 19 + Zustand |
| Language | TypeScript (95.8%) | TypeScript |
| WASM usage | ffmpeg.wasm for codecs, NAM captures, VST porting | None currently |
| Plugin format | TypeScript/JS interfaces | N/A (no plugin system) |
| Modular routing | Yes (custom chains, Bitwig Grid-like) | No |
| Audio quality | 24-bit/96kHz, oversampling | Standard Web Audio (Tone.js defaults) |
| Project format | .odaw (open ZIP spec) | JSON in localStorage/IndexedDB |
| Headless mode | Yes (separate SDK) | No |
| Dependencies | Minimal (6 core deps) | Tone.js + many React ecosystem deps |
| Thread isolation | Worker + SharedArrayBuffer + AudioWorklet | Main thread via Tone.js |

---

## 7. Key Lessons for ACE-Step DAW

### 7.1 Audio Thread Isolation (P1 -- Critical Long-term)
Andre's architecture proves that serious browser DAWs need DSP off the main thread. Tone.js runs on the main thread and will hit performance ceilings. Consider:
- Moving to custom AudioWorklet-based engine for core DSP
- Using Worker + SharedArrayBuffer pattern for heavy processing
- At minimum, ensuring UI operations cannot block audio

### 7.2 Minimal Dependency Philosophy (P2 -- Important)
openDAW proves a browser DAW can run with ~6 dependencies. ACE-Step DAW relies on Tone.js as a large abstraction. Trade-off: Tone.js provides faster development but less control.

### 7.3 Headless/Engine Decoupling (P2 -- Important)
openDAW's headless SDK shows the value of separating audio engine from UI. ACE-Step DAW's engine is tightly coupled to Tone.js and React. A clean engine interface would enable:
- Server-side rendering
- CLI tools
- Automated testing of audio output

### 7.4 Open Project Format (P2 -- Important)
The `.odaw` ZIP format with open spec is a competitive advantage. DAWproject import/export adds interoperability. ACE-Step DAW currently uses opaque JSON.

### 7.5 WASM for Codec/DSP (P3 -- Nice to Have)
Using ffmpeg.wasm for format support is practical. The architecture allowing VST-to-WASM porting opens a huge plugin ecosystem long-term.

### 7.6 Modular System (P3 -- Nice to Have for Now)
The modular routing/patching system is a differentiator but complex to build. Bitwig Grid-like functionality is aspirational.

---

## 8. Roadmap Items from openDAW (for awareness)

- Offline desktop build via Tauri or standalone PWA
- Cloud-agnostic project storage
- Live remote collaboration
- AI manual assistant
- AI-powered stem splitting
- 1.0 launch planned for 2026

---

## Sources

- https://github.com/andremichelle/openDAW
- https://opendaw.org/
- https://lists.w3.org/Archives/Public/public-audio/2020AprJun/0011.html
- https://converter.brightcoding.dev/blog/opendaw-the-revolutionary-browser-daw-every-musician-needs
- https://www.tomrayswebsite.com/2025/07/andre-michelle-opendaw.html
- https://www.gearnews.com/opendaw-studio/
- https://create.routenote.com/blog/opendaw-a-free-open-source-daw-prototype/
- https://www.tone3000.com/blog/opendaw-now-supports-tone3000
- https://grokipedia.com/page/Audiotool
- https://en.wikipedia.org/wiki/Audiotool
- https://github.com/andremichelle/opendaw-headless
- https://www.musicradar.com/music-tech/theres-a-new-free-daw-in-town-opendaw-promises-to-open-the-door-to-music-production-for-beginners-students-and-budget-beatmakers
