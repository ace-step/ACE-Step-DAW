# Suno 5.5 Competitive Research

**Date**: 2026-03-27 (second deep research pass -- covers, remix, Studio 1.2, generation params, pricing, vocal transformation)
**Source**: Suno official blog, help center, industry coverage, user guides, API documentation
**Context**: Suno acquired WavTool (browser-based AI DAW) in June 2025; raised $250M Series C at $2.45B valuation in Nov 2025; hit $300M ARR in Feb 2026 (404% YoY growth). Warner Music Group partnership signed Nov 2025. Suno v5.5 launched same day as Google Lyria 3 Pro (March 26, 2026).

## Executive Summary

Suno v5.5 launched March 26, 2026 with three headline features: **Voices** (voice cloning), **Custom Models** (self-training/fine-tuning), and **My Taste** (preference learning). This represents a significant shift from generic AI music generation toward **personalized, identity-aware music creation**. ACE-Step-DAW currently has none of these capabilities.

The bigger strategic shift is workflow: Suno is moving from "generate and accept" to "generate, inspect, replace, refine, export" — an iterative production workflow that makes them more DAW-like. Their WavTool acquisition brought real DAW engineers onto their team.

---

## 1. Voices (Voice Cloning)

### How It Works
- Pro/Premier users ($10+/month) can **record or upload singing samples** (min 30 seconds, longer is better)
- Three input methods: browser microphone recording, audio file upload, or pull from Suno library
- **Verification step**: Suno matches singing voice against a spoken phrase to confirm identity (anti-abuse)
- User classifies singing level: beginner/intermediate/advanced/professional (affects model processing)
- If uploaded track is a full mix, Suno runs **automatic stem separation** to isolate vocals

### Voice Controls
- **Audio Influence slider**: Controls blend between Suno's model output and raw recording. At 0% = pure Suno voice. At 100% = raw recording through model (quality degrades). Sweet spot is ~40% — preserves vocal character while benefiting from Suno's production quality.
- **Weirdness slider**: Should stay at or near 0% for consistent results. At ~50% = "normal" Suno style. Higher = more experimental/unpredictable.
- **Style Influence slider**: How much the style prompt affects the output
- Voices are **private by default** — only creator can use them
- Voice sharing planned but not yet live

### Recording Tips (from user guides)
- Clean home recording works fine, even phone mic. Key: at least 30 seconds of consistent material.
- Suno runs stem separation automatically on mixed audio uploads — no need to extract vocals first.
- Singing level self-classification (beginner-professional) affects model processing; misclassifying creates calibration problems.
- Verification phrase must match delivery style of original upload (if you sang, sing the phrase — do not speak it flat).

### Key Insight
Voices replaces the older "Personas" feature (Dec 2025). Personas captured song essence (style, mood); Voices captures **vocal identity** specifically. Voice + Custom Model together = full creative identity capture: "how you sound" + "how your music sounds" enables coherent album-level consistency.

---

## 2. Custom Models (Self-Training)

### How It Works
- Upload tracks from your **original music catalog**
- Suno builds a **personalized v5.5 variant** that "knows your style"
- Up to **3 custom models per user** (Pro/Premier only)
- Designed to work with Voices: Voice = how you sound, Custom Model = how your music sounds

### Use Cases
- Artists can generate demos that sound like their catalog
- Producers can create style-consistent tracks
- Combined with Voices: full creative identity capture

### Technical Notes
- Upload **6+ original tracks** to train a model; training takes **2-5 minutes**
- No public details on training methodology (likely LoRA or similar fine-tuning)
- System learns arrangement choices, tonal qualities, and structural patterns from reference tracks
- No ability to weight individual reference tracks differently
- No incremental training (cannot add more tracks to an existing model)
- No API exposure for custom model training (UI-only)
- Models are private; sharing options may come later

---

## 3. My Taste (Preference Learning)

- Available to **all users** (including free tier)
- Learns preferences from usage: genres, moods, styles
- Personalizes generation suggestions over time
- Free users get My Taste + older v4.5 model

---

## 4. Core Generation Capabilities (v5 baseline)

### Audio Quality
- 44.1kHz stereo output
- Virtually eliminated background noise (major improvement over v3/v4)
- ELO benchmark score of 1,293 (highest in AI music)

### Generation Modes
- **Text-to-music**: Full song from text description + lyrics
- **Remix**: Upload audio, choose intensity (subtle → complete reimagination)
- **Covers**: Apply different voice/style to existing songs
- **Vocal replacement**: Upload instrumental → generate vocals with lyrics
- **Accompaniment generation**: Upload vocals → generate matching instrumentals
- **Hum-to-song**: Hum melody → full arrangement
- **Negative prompting**: Exclude unwanted elements ("no autotune, no falsetto")

### Studio Mode (Premier tier, powered by WavTool acquisition)
- **Multi-track timeline**: Visual interface for arranging, layering, editing compositions
- **Section editing on waveform**: Remake, Rewrite, Extend, Reorder, Delete sections
- **Quick Replace**: Fast section regeneration with simplified workflow
- **Section add/split/crop**: Granular arrangement editing
- **Fade controls**: Fade in/out on sections
- **Tempo visibility**: BPM display and control
- **Generative stems**: Generate NEW instrumental/vocal stems that are contextually aware of existing audio (e.g., bassline follows chord progression of synth pads) — this is generation, not just separation
- **Stem separation**: Up to 12 stems (vocals: lead/background/harmonies, drums, bass, other: guitars/keys/synths/strings). Export as MP3 or WAV.
- **Warp Markers** (Feb 2026): Micro-adjust timing with quantize
- **Remove FX** (Feb 2026): Strip AI-applied reverb and delay for dry stems
- **Alternates** (Feb 2026): Generate alternative sections inline
- **Time Signature support** (Feb 2026): Expanded beyond 4/4

### Parameters
- Song length up to 8 minutes (first generation)
- Style/genre control via text prompts
- BPM, key, mood control
- Variation control for fine-tuning existing tracks
- Weirdness slider (~50% = normal, higher = experimental)
- Style Influence slider
- Audio Influence slider (appears when upload present)
- Custom Model selection
- Voice selection (v5.5)

### Recommended Workflow (v5.5 era)
Old: Prompt -> Generate -> Retry -> Accept/Abandon
New: Prompt -> Generate -> Open Editor -> Replace/Refine -> Export
Rule: "Troubleshoot in place; do not re-roll the whole song."

### Remix Capabilities
- **Remix intensity slider** with four levels:
  - Subtle (10-30%): Minor variations
  - Moderate (40-60%): Noticeable changes
  - Heavy (70-90%): Significant rearrangement
  - Full (100%): Complete transformation
- Preserves core lyrics while changing arrangements/energy
- Can upload own audio and apply style transformation

---

## 5. API

### Official Status
Suno does NOT offer a widely available public API like OpenAI. API access is in limited beta, rolled out to select partners only. Exclusive to Pro and Premier subscribers.

### Known Endpoints (from unofficial/partner documentation)
| Endpoint | Description |
|----------|-------------|
| `/api/generate` | Standard music generation |
| `/api/custom_generate` | Custom mode (lyrics, style, title, model selection) |
| `/api/generate_lyrics` | AI lyrics generation |
| `/api/extend_audio` | Extend audio length |
| `/api/generate_stems` | Stem separation |
| `/api/get_aligned_lyrics` | Word-level timestamps for lyrics |
| `/api/concat` | Concatenate extensions into whole songs |

### API Characteristics
- Watermark-free output (suitable for commercial use)
- Streaming output support for real-time applications
- Multi-format downloads
- Supports v5, v4.5+, v4.5, v4 model selection
- Average latency: 22.4 seconds for a 2-minute clip
- Prompt adherence: 88%
- Lyric hallucination rate: <5%
- Handles 50+ simultaneous requests

### Unofficial Wrappers
- GitHub: gcui-art/suno-api (relies on session token scraping, ToS-violating)
- Third-party providers: PiAPI, CometAPI, kie.ai (unofficial proxies)
- MIDI export (Audio-to-MIDI) in Premier tier (experimental, Q1 2026)

### Relevance to ACE-Step DAW
The lack of a public API is a constraint. Integration would require: (a) waiting for official API expansion, (b) unofficial wrappers (fragile), or (c) direct partnership with Suno.

---

## 6. Pricing (Summary)

| Feature | Free | Pro ($10/mo) | Premier ($30/mo) |
|---------|------|-------------|-------------------|
| My Taste | Yes | Yes | Yes |
| v5.5 Model | No (v4.5) | Yes | Yes |
| Voices | No | Yes | Yes |
| Custom Models | No | Yes (3 slots) | Yes (3 slots) |
| Stem Export | No | Yes | Yes |
| MIDI Export | No | No | Yes (experimental) |

(See Section 13 for detailed pricing breakdown including credits, annual pricing, and commercial rights.)

---

## 7. Competitive Landscape (March 2026)

### Suno's Strengths
| Advantage | Detail |
|-----------|--------|
| **Best vocals in AI music** | V5/5.5 vocals have natural vibrato, breath, phrasing — dramatic jump from v4 |
| **Voice cloning** | Only major AI music platform with integrated voice cloning + verification |
| **Custom model training** | Style fine-tuning from user catalog — unique among consumer tools |
| **Beginner-friendliness** | Type prompt -> get song in under a minute. Lowest barrier to entry |
| **Studio editing** | WavTool acquisition (June 2025) brought real browser DAW capabilities |
| **Generative stems** | AI-generated complementary parts (not just separation) |
| **Legal positioning** | Warner Music Group partnership; licensed training data |
| **Scale** | $300M ARR, $2.45B valuation, 404% YoY growth |

### Suno's Weaknesses
| Weakness | Detail |
|----------|--------|
| **Instrumental quality** | Udio produces better separation; Suno instruments can bleed |
| **Granular control** | Udio's inpainting offers more precise section-level control |
| **Not a real DAW** | Studio is generation-first, not full DAW-grade precision |
| **No public API** | Limited partner access only |
| **Paid wall** | All v5.5 features require $10+/month |
| **Opacity** | No technical transparency about model architecture |

### AI Music Generator Landscape
| Platform | Best For | Key Differentiator |
|----------|----------|-------------------|
| **Suno** | Vocals, beginner-friendly, voice cloning | Voice identity + custom models |
| **Udio** | Instrumental quality, granular editing | Inpainting, 48kHz, better separation |
| **ElevenLabs (Eleven Music)** | Voice-first music (Aug 2025) | Best voice tech heritage |
| **AIVA** | Cinematic/orchestral | Full copyright ownership on Pro |
| **Beatoven.ai** | Ethical background music | Fairly Trained certification |
| **Meta MusicGen** | Open-source, self-hosted | Full model weights, no limits, free |
| **Google Lyria 3 Pro** | Detailed instrumentals (Mar 2026) | DeepMind backing |

---

## 8. Covers & Remix (Deep Dive)

### Covers Feature
Covers let users reimagine songs by keeping the melody and adapting the track to a different style. This is a **full re-performance**, not an edit of the original recording.

**How Covers work under the hood:**
1. Suno analyzes input audio to identify melodic contours, phrasing, and structure -- extracting a "musical blueprint"
2. User provides a style prompt describing the new direction
3. Suno regenerates a new performance using the style instructions, preserving the original melody and structure
4. Output is a completely new audio file, not a filter applied to the original

**Covers capabilities:**
- Works with uploaded audio (demos, voice memos, loops) -- not just Suno-generated tracks
- Can add vocals to instrumental tracks (vocal generation on covers)
- Can transform genre entirely (e.g., pop -> jazz, acoustic -> trap)
- Maintains melody fidelity while changing everything else

### Remix System
"Remix" is the umbrella feature that includes: Cover, Extend, Reuse Prompt, and Adjust Speed.

**Access:** More Actions (...) menu on any song. For remixing others' songs, the original creator must have remixes enabled.

**Control sliders:**
- **Weirdness**: Controls unpredictability (0% = conservative, higher = experimental)
- **Style Influence**: How strongly the new style prompt is followed vs. original style
- **Audio Influence**: Appears in audio upload workflows; balances fidelity to upload vs. freer interpretation

**Remix intensity levels:**
- Subtle (10-30%): Minor variations
- Moderate (40-60%): Noticeable changes
- Heavy (70-90%): Significant rearrangement
- Full (100%): Complete transformation

### Attribution & Commercial Use
- Every remix links back to the original -- visual chain of attribution
- **Remixes are NOT eligible for commercial use** even if you have a Pro/Premier plan
- Original creator retains attribution rights regardless of remix depth
- Default: songs created before May 21, 2025 have Remix disabled; new songs have it enabled but set to link-only visibility

---

## 9. Generation Parameters (Deep Dive)

### Prompt Architecture
Suno has **two separate prompt fields** with different character limits:
- **Style prompt**: ~200 characters -- holds sonic intent and style descriptors
- **Lyrics field**: 3,000 characters -- holds lyrics and structure tags

**Recommended prompt formula:** `Mood + Genre/Era + Key Instruments + Vocal Type + Production/Mix Tone + Tempo/Energy`

Primary genre should appear **first** in the prompt -- Suno weights early words more heavily than later descriptors.

### BPM & Key Control
BPM and key can be specified directly in the style prompt:
- Example: `"Contemporary R&B song at 92 BPM in F minor"`
- Bracket syntax also works: `"[BPM: 110] [Key: A Minor] [Mood: Nostalgic]"`
- Tempo changes mid-song are possible via lyrics field structure tags

### Song Structure Tags (in lyrics field)
Suno interprets section tags to guide song form:
- `[Intro]`, `[Verse]`, `[Pre-Chorus]`, `[Chorus]`, `[Bridge]`, `[Outro]`
- **Bar counts**: `[Intro 4] [Verse 16] [Pre 8] [Chorus 16] [Bridge 8] [Outro 8]`
- **Instrumental breaks**: `[Instrumental]`, `[Solo]`
- **Dynamic markers**: `[Build]`, `[Drop]`, `[Breakdown]`

### Vocal Control Tags
- Gender/type: `"deep male baritone"`, `"airy female soprano"`, `"children's choir"`
- Delivery: `"whispered"`, `"belted"`, `"spoken word"`, `"rap flow"`
- Negative prompting: `"no autotune"`, `"no falsetto"`, `"avoid vibrato"`
- Layering: `"stacked vocals"`, `"harmonized chorus"`, `"call and response"`

### Instrumentation Control
- Specific: `"electric guitar, synth pad, live drums, upright bass"`
- Exclusion: `"no crowd chants"`, `"no sound effects"`, `"dry vocal"`
- Production: `"lo-fi production"`, `"stadium mix"`, `"bedroom recording quality"`

### Key Prompting Tips
- Write descriptions, not commands ("a warm jazz ballad" not "create a jazz song")
- Short specific lines beat long prose
- Structure: genre, references, instrumentation, structure -- in that order
- Be explicit about sub-genre: not "rock" but "1980s synth-pop"

---

## 10. Vocal Transformation (Deep Dive)

### Voice Tags for Pitch & Range
- Pitch/range modifications via prompt: `"high-pitched"`, `"deep bass voice"`, `"falsetto register"`
- These affect the generated vocal, not post-processing

### Vocal Swap (v4.5+/v5)
- From any owned track, users can **swap in a new voice** while keeping lyrics and melody intact
- Under the hood: applies a new Voice/Persona via the Cover tool
- Can change tone, style, gender of the vocal performance
- Preserves lyrical content and melodic structure

### Voice-as-Input (v5+)
- Users can record **beatbox** as drum direction
- **Humming** becomes melody direction
- **Rhythmic speech** shapes cadence and flow
- The recording is a blueprint/control signal, not the final mix

### Changing Voice Style Without Restarting
- Combine positive and negative prompting: `"low female alto vocal, warm chest voice, smooth midrange tone, avoid high soprano, restrained delivery"`
- Small production and genre shifts widen the vocal pool Suno draws from
- Using Covers feature to re-perform with different vocal characteristics

### External Vocal Transformation Workflow
- Many users use Kits.ai or similar tools for voice conversion on Suno output
- Workflow: Suno generates track -> export stems -> apply voice model in Kits.ai -> re-import
- Kits.ai provides: pitch shifting, voice blending, custom voice model training

### v5.5 Voice Cloning as Transformation
- With Voices feature, users can now apply their own voice to any generated song
- Combined with Covers: take any song, apply your voice, change genre -- full transformation chain
- Audio Influence slider controls blend between AI voice and cloned voice

---

## 11. Stems & Separation (Deep Dive)

### Built-in Stem Extraction
Suno offers stem extraction that splits tracks into up to **12 clean stems**:

**2-stem mode:** Vocals + Instrumental (basic, available on all plans)

**12-stem mode (Pro/Premier):**
1. Lead Vocals
2. Backing Vocals
3. Harmonies
4. Kick
5. Bass
6. Drums (full kit)
7. Guitar
8. Keyboard/Piano
9. Strings
10. Brass
11. Synth
12. FX/Other

**Access:** More Actions (...) > Get Stems > choose 2-track or 12-track option. Also available in Song Editor via the Get Stems icon (top right).

### Suno Studio Export Options
- **Full Song**: Complete mix of all tracks and processing
- **Selected Time Range**: Export only a specific section or loop
- **Multitrack**: Export all tracks as individual stems within the Studio mix context
- **MIDI Export**: Available from any melodic stem (piano, guitar, keys) -- useful for importing chord progressions into external DAWs

### Export Formats
- WAV (lossless, Pro/Premier only)
- MP3 (all plans for basic downloads)
- All stems are time-aligned for seamless DAW import
- Free plan users cannot download WAV or extract stems

### Quality Assessment
User reports indicate Suno's vocal stem isolation is "surprisingly clean for AI-generated audio" and "often usable directly in professional mixes." The 12-stem separation is notably better than typical source separation tools because Suno has access to the generation model's internal representation.

---

## 12. Suno Studio 1.2 Features (February 2026, Deep Dive)

### Warp Markers
- Click directly on clip waveform to add markers at specific points
- Drag markers to move audio points in time -- corrects timing without affecting pitch
- Similar to Ableton Live's Warp or Logic's Flex Time
- **Quantize function**: Auto-set markers on transients, snap to grid
- Best for subtle timing corrections; extreme stretching degrades quality
- Can intentionally build swing and "imperfect" groove by moving markers off-grid

### Remove FX
- Select clip > context menu > "Remove FX"
- Suno generates a **dry version** of the clip (strips reverb, delay, etc.)
- Places the dry version on the timeline alongside the original
- Designed for export workflows: get dry stems, apply your own effects in external DAW
- Works on both vocal and instrumental clips

### Alternates (Improved Take Lane)
- Generate multiple alternate versions of a section
- Preview takes quickly in the take lane UI
- Choose favorite, commit to timeline
- Workflow shifts from "re-roll and hope" to "compare multiple options and choose"
- Closer to traditional DAW comping workflow

### Time Signature Support
- Set numerator (beats per bar, 1-99) and denominator (beat duration)
- Grid and metronome update immediately
- Supports: 3/4, 5/4, 6/8, 7/8, 11/4, and any custom signature
- Enables waltz, jazz, progressive rock, and world music meters

### Workflow Integration
These tools work together: Time Signature sets the canvas, Warp Markers perfect timing, Remove FX cleans up sounds, Alternates choose the best performances. Studio 1.2 moves Suno from "generate-and-use" toward a DAW-like environment.

---

## 13. Pricing (Deep Dive)

### Tier Details

| | Free | Pro ($10/mo) | Premier ($30/mo) | Enterprise |
|---|------|-------------|-------------------|------------|
| **Credits** | 50/day (~10 songs) | 2,500/month (~500 songs) | 10,000/month (~2,000 songs) | Custom |
| **Model Access** | v4.5-All only | v5 + v5.5 | v5 + v5.5 | Custom |
| **Voices** | No | Yes | Yes | Yes |
| **Custom Models** | No | Yes (3 slots) | Yes (3 slots) | Custom |
| **Suno Studio** | No | No | Yes | Yes |
| **Stem Export (WAV)** | No | Yes (2-stem) | Yes (12-stem) | Yes |
| **MIDI Export** | No | No | Yes | Yes |
| **Audio Upload** | 1 min max | 8 min per project | 8 min per project | Custom |
| **Commercial Rights** | No | Yes (while subscribed) | Yes (while subscribed) | Yes |
| **My Taste** | Yes | Yes | Yes | Yes |

### Annual Pricing
- Pro: $8/month billed annually (20% savings)
- Premier: $24/month billed annually (20% savings)

### Credit Policies
- **No rollover**: Monthly credits do not carry over
- **Fallback credits**: Pro/Premier users get up to 50 credits/day after monthly allotment is used
- **Top-ups**: $8 for 2,500 credits or $24 for 10,000 credits (purchased credits do not expire but require active subscription)
- **Cost per song**: ~$0.012/song on Premier annual plan

### Commercial Rights Details
- Free plan: Suno retains ownership. Upgrading later does NOT grant retroactive commercial rights.
- Pro/Premier: Full commercial use license while subscribed
- Remixes of others' songs: NOT eligible for commercial use regardless of plan

---

## 14. Gap Analysis: ACE-Step-DAW vs Suno 5.5 (Updated)

### Currently Missing in ACE-Step-DAW

| Capability | Suno 5.5 | ACE-Step-DAW | Priority |
|-----------|----------|--------------|----------|
| **Voice cloning** | Full (record/upload/verify) | None | P0 |
| **Reference voice generation** | Via Voices + Audio Influence | None | P0 |
| **Custom model training** | Upload catalog → fine-tune | None (backend has SFT variant but no UI) | P0 |
| **Voice verification** | Identity verification | None | P1 |
| **Preference learning** | My Taste auto-learns | None | P2 |
| **Vocal replacement** | Upload instrumental → add vocals | None | P1 |
| **Hum-to-song** | Melody → full arrangement | None | P2 |
| **Negative prompting** | Exclude elements | None | P1 |
| **Audio Influence controls** | Style + Audio sliders | None | P1 |
| **Stem export to WAV** | Built-in | Partial (stem separation exists) | P2 |
| **Song section editing** | In-app | Repaint exists (partial) | P2 |
| **MIDI export from audio** | Experimental | None | P2 |
| **Covers / style transfer** | Upload audio + style prompt -> full re-performance | Repaint (partial) | P1 |
| **Warp markers / time stretch** | Click-and-drag timing correction | None | P2 |
| **Remove FX / dry stems** | AI-powered effect stripping | None | P2 |
| **Alternates / comping** | Take lane with multiple generated variants | None | P2 |
| **Generative stems** | AI generates NEW complementary parts in context | None | P1 |
| **12-stem separation** | 12 individual stems from generated audio | 2/4/6 stem modes | P2 |
| **Remix attribution chain** | Visual chain back to original creator | None | P3 |
| **Vocal swap** | Re-sing with different voice keeping melody/lyrics | None | P1 |
| **Credit/usage metering** | Transparent per-song credit costs | No usage tracking | P3 |

### What ACE-Step-DAW Already Has (Advantages)

- **LEGO-style multi-track generation** — Suno generates full mixes, ACE-Step generates per-track with context
- **Full DAW environment** — Timeline, mixer, effects, automation, MIDI editing
- **Local/self-hosted** — No cloud dependency, data stays private
- **Open architecture** — Multiple model backends, not locked to one provider
- **Stem separation** — 2/4/6 stem modes with multiple engines
- **Cover/Repaint** — Style transfer and selective regeneration
- **Vocal2BGM** — Generate accompaniment from vocals (similar to Suno's accompaniment gen)

---

## 15. Recommended Issues for ACE-Step-DAW

### P0 — Critical (match Suno 5.5 core features)
1. **Voice Cloning / Reference Voice Generation** — Upload/record reference vocals, use as generation conditioning
2. **Custom Model Fine-Tuning UI** — Upload tracks to create personalized model variants (LoRA/SFT)
3. **Voice Library Management** — Create, manage, preview saved voice profiles

### P1 — Important (competitive parity)
4. **Vocal Replacement / Voice-to-Song** — Upload instrumental, generate matching vocals
5. **Negative Prompting** — Exclude unwanted elements from generation
6. **Audio Influence Controls** — Style/Audio influence sliders for voice-conditioned generation
7. **Voice Identity Verification** — Ensure voice cloning consent/ownership

### P2 — Nice-to-Have (differentiation)
8. **Hum-to-Song Generation** — Record melody input, generate full arrangement
9. **Preference Learning / My Taste** — Learn user style preferences over time
10. **Audio-to-MIDI Transcription** — Convert generated/imported audio to MIDI

---

## 16. ACE-Step DAW Competitive Positioning

ACE-Step DAW can differentiate from Suno by:
- Being a **real DAW** (MIDI editing, sequencer, mixer, effects, automation) where Suno Studio is generation-first
- Supporting **open-source models** (no vendor lock-in, ACE-Step model is open)
- Offering **full DAW-grade precision** that Suno explicitly does not provide
- Being **free/open** where Suno gates features behind $10-30/month
- Providing **API transparency** and extensibility
- Supporting **LEGO-style multi-track generation** (per-track with context) vs Suno's full-mix generation
- **Local/self-hosted** option — no cloud dependency, data stays private

The key risk: Suno is rapidly converging toward DAW functionality through the WavTool acquisition. Their Studio already has multi-track timeline, section editing, generative stems, warp markers, and time signature support. ACE-Step DAW must move fast on its generation workflow UX to maintain differentiation.

---

Sources:
- [Suno v5.5: More Expressive. More You. (Official Blog)](https://suno.com/blog/v5-5)
- [Suno Studio 1.2: What's New (Official Blog)](https://suno.com/blog/studio1_2)
- [Introducing Covers (Official Blog)](https://suno.com/blog/covers)
- [Suno Launches v5.5 With Voices -- Digital Music News](https://www.digitalmusicnews.com/2026/03/26/suno-launches-version-5-5/)
- [Suno Adds Voices With Label-Enabled Future -- Music Ally](https://musically.com/2026/03/27/suno-adds-voices-with-label-enabled-future-models-in-mind/)
- [Suno 5.5 Voice Cloning: How It Works -- UCStrategies](https://ucstrategies.com/news/suno-5-5-is-out-you-can-now-clone-your-own-voice-heres-how-it-actually-works/)
- [Suno v5.5 Features Explained -- Jack Righteous](https://jackrighteous.com/en-us/blogs/guides-using-suno-ai-music-creation/suno-v5-5-features-explained-workflow-changes-studio-editing-creator-guide)
- [Suno AI Personas Update Dec 2025 -- Jack Righteous](https://jackrighteous.com/en-us/blogs/guides-using-suno-ai-music-creation/suno-ai-personas-update-dec-2025-what-changed-how-to-use-it)
- [Suno v4.5+ Vocal Swap, Flip, Spark -- Jack Righteous](https://jackrighteous.com/en-us/blogs/guides-using-suno-ai-music-creation/suno-v45-plus-features-guide)
- [Suno AI Covers Guide 2026 -- Jack Righteous](https://jackrighteous.com/en-us/blogs/guides-using-suno-ai-music-creation/suno-ai-covers-guide-v4-transform-your-songs-by-style)
- [Suno Studio 1.2 Workflow Upgrade -- Jack Righteous](https://jackrighteous.com/en-us/blogs/guides-using-suno-ai-music-creation/suno-studio-1-2-master-guide)
- [Suno Studio Tutorial -- HookGenius](https://hookgenius.app/learn/suno-studio-tutorial/)
- [Suno v5 Complete Guide -- HookGenius](https://hookgenius.app/learn/suno-v5-complete-guide/)
- [Suno 5.5 New Features -- SoundsSpace](https://soundsspace.com/blog/index.php/component/k2/item/274-suno-5-5-new-features-ai-music-generator)
- [Suno v5.5 Voice Cloning -- Metaverse Post](https://mpost.io/suno-unveils-v5-5-with-voice-cloning-and-personalized-ai-music-creation-tools/)
- [Suno v5.5 Voices Launch -- Aihola](https://aihola.com/article/suno-v5-5-voices-launch)
- [Suno Unveils v5.5 -- Music In Africa](https://www.musicinafrica.net/magazine/suno-unveils-v55-music-model-voice-personalisation-tools)
- [Studio 1.2 Four Powerful Features -- GenX Notes](https://blog.genxnotes.com/en/suno-studio-1-2-update/)
- [Suno Pricing 2026 -- CostBench](https://costbench.com/software/ai-music-generators/suno/)
- [Suno Pricing 2026 -- Marga Bagus](https://margabagus.com/suno-pricing/)
- [Suno Help Center: Remix FAQ](https://help.suno.com/en/articles/5663873)
- [Suno Help Center: Stem Extraction](https://help.suno.com/en/articles/6141441)
- [Suno Help Center: Exporting from Studio](https://help.suno.com/en/articles/8128193)
- [Suno Help Center: Studio 1.2](https://help.suno.com/en/articles/10625089)
- [Suno Help Center: Model Timeline](https://help.suno.com/en/articles/5782721)
- [Suno API Documentation (Unofficial)](https://docs.sunoapi.org/)
- [The Suno API Reality -- AIML API Blog](https://aimlapi.com/blog/the-suno-api-reality)
- [Warner Music Strikes AI Deal with Suno -- TechBuzz](https://www.techbuzz.ai/articles/warner-music-strikes-ai-deal-with-suno-for-artist-voice-cloning)
- [Suno Previews 2026 Changes Under Warner Deal -- Digital Music News](https://www.digitalmusicnews.com/2025/12/22/suno-warner-music-deal-changes/)
- [Suno Acquires WavTool -- TechCrunch](https://techcrunch.com/2025/06/26/suno-snaps-up-wavtool-for-its-ai-music-editing-tools-amid-ongoing-dispute-with-music-labels/)
- [How to Prompt Suno AI -- HowToPromptSuno.com](https://howtopromptsuno.com/making-music)
- [Suno AI Prompt Guide 2026 -- MusicSmith](https://musicsmith.ai/blog/ai-music-generation-prompts-best-practices)
- [Suno v5 and Studio Complete Guide -- Medium](https://medium.com/@creativeaininja/suno-v5-and-studio-the-complete-guide-to-professional-ai-music-production-d55c0747a48e)
- [Suno v5 vs v4.5 Upgrade Guide -- Jack Righteous](https://jackrighteous.com/en-us/blogs/guides-using-suno-ai-music-creation/suno-v5-vs-v4-5-upgrade-guide)
