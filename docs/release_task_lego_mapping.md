# DAW → ACE-Step `/release_task` (task_type `lego`)

This documents what **ACE-Step-DAW** sends for stem/lego generation so it is not a black box. The HTTP schema is defined by the ACE-Step server; the DAW builds the body in `generateClipInternal` (`src/services/generationPipeline.ts`) using `computeLegoTimingParams` (`src/services/legoApiTiming.ts`).

## Timing fields

| Scenario | `repainting_start` | `repainting_end` | `audio_duration` |
|----------|-------------------|------------------|------------------|
| **From silence** (`forceSilence: true`) | `0` | `-1` | **Clip length in seconds** = select-window length (same as `clip.duration` after the clip is placed on the timeline). |
| **From context / cumulative** | Clip start (or `repaintRange.start`) | Clip end (or `repaintRange.end`) | **Project timeline duration** = `getAudioDuration()` (max clip end, floored at the project minimum). |

## Chunk vs full instruction

The DiT prompt uses either “Generate a segment…” or “Generate the … track…” based on whether the clip is a **segment** of the timeline:

- **From silence:** compare clip `[startTime, startTime + duration]` to the full project length.
- **With context:** compare the repainting interval to the project length.

## Placeholder silence WAV

`generateSilenceWav` uploads a **short** (0.1s) silence file to save bandwidth. Target output length is **not** inferred from that file; the server must use the **`audio_duration`** parameter (and its own rules) for generation length and Metas.

## Related API types

TypeScript shapes: `LegoTaskParams` in `src/types/api.ts`.
