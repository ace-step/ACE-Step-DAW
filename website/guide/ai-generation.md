# AI Music Generation

ACE-Step DAW integrates a powerful AI engine for generating, transforming, and analyzing music. The system supports four generation modes and automatic audio analysis.

## LEGO Pipeline

The core generation mode. Tracks are generated sequentially, with each new track receiving the cumulative mix of all previously generated tracks as musical context.

### How It Works

1. Tracks are generated in a fixed order: Drums → Bass → Guitar → Keyboard → Percussion → Strings → Synth → FX → Brass → Woodwinds → Backing Vocals → Vocals
2. Each generation receives the cumulative audio from prior tracks
3. The AI uses this context to produce parts that harmonically and rhythmically fit the existing mix

<!-- ![Demo](/images/placeholder.svg) -->

### Generation Parameters

| Parameter | Description |
|---|---|
| **Prompt** | Describe the style and character of the track |
| **Global Caption** | Overall song description shared across all tracks |
| **Lyrics** | Lyrics text (for vocal tracks) |
| **Instruction** | Additional generation guidance |
| **BPM** | Tempo (auto-detected or manual) |
| **Key** | Musical key (auto-detected or manual) |
| **Seed** | Random seed for reproducibility |
| **Batch Size** | Number of variations to generate |
| **Inference Steps** | Quality/speed tradeoff |
| **Guidance Scale** | How closely to follow the prompt |

### Using LEGO Generation

1. Add a stems track and select an instrument
2. Press `Cmd/Ctrl + G` to generate from silence, or `Cmd/Ctrl + Shift + G` to generate with context
3. Configure parameters in the generation dialog
4. Wait for the generation to complete (status tracked in real time)
5. Preview the result — regenerate if needed

::: tip
Generate drums first. They provide the rhythmic foundation that all subsequent tracks build on.
:::

## Cover Mode

Transform existing audio into a new style while preserving the original structure and timing.

| Parameter | Description |
|---|---|
| **Caption** | Describe the target style |
| **Lyrics** | Updated lyrics (optional) |
| **Cover Strength** | 0.0 (identical) to 1.0 (fully transformed) |

**Use cases:** Convert a rock track to jazz, change the vocal style, reimagine a section in a different genre.

## Repaint Mode

Regenerate a specific time range within an existing clip while preserving the surrounding audio.

| Parameter | Description |
|---|---|
| **Prompt** | Describe what the new section should sound like |
| **Repainting Start** | Start time in seconds |
| **Repainting End** | End time in seconds |

**Use cases:** Fix a section that does not fit, try a different melodic idea in the chorus, replace a drum fill.

## Vocal2BGM

Generate an instrumental accompaniment track from a vocal recording.

| Parameter | Description |
|---|---|
| **Source** | Vocal track audio |
| **Caption** | Style description for the accompaniment |

The AI analyzes the vocal and generates fitting instrumental parts.

## Generation Presets

16 built-in presets with suggested BPM, key, and lyrics templates:

| Genre | Presets |
|---|---|
| **Pop** | Upbeat Pop, Pop Ballad |
| **Rock** | Classic Rock, Indie Rock |
| **Jazz** | Smooth Jazz, Bebop |
| **Electronic** | House, Synthwave |
| **Hip-Hop** | Boom Bap, Trap |
| **Classical** | Orchestral, Piano Sonata |
| **Lo-Fi** | Lo-Fi Chill, Lo-Fi Jazz |
| **Ambient** | Space Ambient, Nature Ambient |

## Audio Analysis

The AI engine can analyze any audio clip to detect:

- **BPM** — Tempo detection
- **Key** — Musical key and scale
- **Genre** — Style classification
- **Time Signature** — Meter detection

Analysis results are stored as clip metadata and used to inform subsequent generations.

## Generation Status

Each generation task progresses through these states:

| Status | Meaning |
|---|---|
| `empty` | No generation started |
| `queued` | Waiting in the generation queue |
| `generating` | AI model is generating audio |
| `processing` | Post-processing the result |
| `ready` | Generation complete — audio available |
| `error` | Generation failed |
| `stale` | Context has changed — may need regeneration |

## Model Configuration

The generation engine supports:

- **DiT model** selection (Diffusion Transformer)
- **LM model** selection (Language Model)
- **LoRA** support for fine-tuned models
- Model initialization via the backend API

::: warning Known Limitation
AI generation requires a running backend server. Core DAW features (editing, mixing, playback) work offline, but generation needs the AI inference service.
:::
