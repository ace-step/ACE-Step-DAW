# Structured DAW Action Errors

The agent-facing action layer lives in `src/services/actionApi.ts` and is exposed in the browser as `window.__actionApi`.

## Result Contract

All action API calls return the same discriminated union:

```ts
type DawActionResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      error: {
        code: DawActionErrorCode;
        message: string;
        context: Record<string, unknown>;
        suggestions: Array<{
          action: string;
          label: string;
          params?: Record<string, unknown>;
        }>;
      };
    };
```

Example:

```ts
const result = window.__actionApi.exportMidiClip({ clipId });

if (!result.ok) {
  console.log(result.error.code);
  console.log(result.error.context);
  console.log(result.error.suggestions);
}
```

## Common Error Codes

| Code | Meaning | Typical recovery |
| --- | --- | --- |
| `PROJECT_REQUIRED` | No active project is loaded. | Create a project or load one into the store. |
| `TRACK_NOT_FOUND` | The requested `trackId` does not exist. | Inspect `project.tracks` and retry with a valid ID. |
| `TRACK_PRESET_NOT_FOUND` | The requested preset is missing. | List available presets before applying one. |
| `CLIP_NOT_FOUND` | The requested `clipId` does not exist in the expected scope. | List clips on the target track or in the project. |
| `CLIP_SELECTION_REQUIRED` | An action that needs clip selection was invoked with no clips. | Select one or more clips first. |
| `PRESET_NAME_REQUIRED` | A track preset save request used an empty name. | Provide a non-empty preset name. |
| `MIDI_CLIP_REQUIRED` | The action needs a MIDI clip but received an audio clip or missing MIDI data. | Create or convert to a MIDI clip first. |
| `MIDI_NOTES_REQUIRED` | The MIDI clip is valid but empty. | Add at least one MIDI note before retrying. |
| `AUDIO_CLIP_REQUIRED` | The action needs rendered audio data. | Bounce, render, or select an audio clip. |
| `AUDIO_SOURCE_MISSING` | The clip metadata exists but its audio blob cannot be loaded. | Re-render the clip audio or restore the missing blob. |
| `SEQUENCER_PATTERN_REQUIRED` | The track has no sequencer pattern. | Initialize a sequencer pattern first. |
| `SEQUENCER_ROW_NOT_FOUND` | The row ID is invalid for the selected sequencer track. | Enumerate track rows and retry with a valid row ID. |
| `STEP_INDEX_OUT_OF_RANGE` | The requested step index is outside the row length. | Inspect row length and clamp the index. |
| `ACTION_FAILED` | The action failed for a non-classified reason. | Inspect `message` and `context`, then retry or adjust state. |

## Actions Covered

The structured contract currently covers:

- `addClip`
- `toggleSequencerStep`
- `addMidiNote`
- `saveTrackPreset`
- `applyTrackPreset`
- `consolidateClips`
- `separateStems`
- `bounceInPlace`
- `exportMidiClip`

UI code can import `projectActionApi` directly, and automation can call `window.__actionApi` for the same payload shape.
