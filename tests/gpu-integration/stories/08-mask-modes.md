# Suite 8: Mask Modes (Auto vs Explicit)

> Verdict type: human-checkpoint (audio behavior requires listening)
> Entry point: AddLayerModal or MultiTrackGenerateModal mask mode toggle
> Preconditions: Suite 0 passes; a project is open with Stems tracks; ideally some tracks have existing generated audio for context

The mask mode controls how the model handles the generation region within the context window:

- **Auto** (`chunk_mask_mode: 'auto'`): The model decides where each instrument starts and stops. All mask values are set to 2.0. Caption format uses "Mask Control: false".
- **Explicit** (`chunk_mask_mode: 'explicit'`): The generation region is precisely defined by the 0/1 mask from the select window. Caption format uses "Mask Control: true".

This suite also verifies that chunk vs full mode instructions are sent correctly based on whether the generation covers a sub-range or the full audio duration.

---

## US-8.1 — AddLayer modal shows mask mode toggle

**Steps**:
1. Right-click on a track lane at a specific time position
2. Select "Add Layer" from the context menu

**Expected**:
- `AddLayerModal` opens
- A mask mode toggle is visible with two options: "Auto (model decides)" and "Explicit (select window only)"
- Default selection is "Auto"

**Verdict**: automated
**Screenshot**: `suite-8/us-8.1-mask-toggle.png`

---

## US-8.2 — Generate with Auto mask mode

**Preconditions**: At least one track has existing audio for context

**Steps**:
1. Open AddLayerModal with a context window that includes existing audio
2. Ensure mask mode is set to "Auto"
3. Enter a local description: `melodic guitar riff, blues scale`
4. Click Generate

**Expected**:
- Generation completes without error
- A new clip appears on the timeline
- The model may have generated audio that extends beyond or starts before the strict select window, as it decides instrument timing autonomously

**Verdict**: human-checkpoint
**Human prompt**: "Auto mask mode was used. Does the generated audio sound natural in context? The model was free to decide instrument timing."
**Screenshot**: `suite-8/us-8.2-auto-mask.png`

---

## US-8.3 — Generate with Explicit mask mode

**Preconditions**: At least one track has existing audio for context

**Steps**:
1. Open AddLayerModal with a context window
2. Switch mask mode to "Explicit"
3. Enter a local description: `staccato piano chords`
4. Click Generate

**Expected**:
- Generation completes without error
- A new clip appears on the timeline
- The generated audio should be precisely within the select window boundaries

**Verdict**: human-checkpoint
**Human prompt**: "Explicit mask mode was used. Does the generated audio start and stop precisely at the selection boundaries?"
**Screenshot**: `suite-8/us-8.3-explicit-mask.png`

---

## US-8.4 — MultiTrack modal mask mode toggle

**Steps**:
1. Drag-select a time range across multiple track lanes
2. Verify the MultiTrackGenerateModal opens

**Expected**:
- Mask mode toggle is visible (Auto / Explicit)
- Default is "Auto"

**Verdict**: automated
**Screenshot**: `suite-8/us-8.4-multitrack-mask.png`

---

## US-8.5 — MultiTrack generate with Auto mask

**Preconditions**: Some tracks have existing audio in the selected range

**Steps**:
1. Open MultiTrackGenerateModal for a range with existing context
2. Ensure mask mode is "Auto"
3. Check 2-3 tracks, enter descriptions
4. Generate

**Expected**:
- All selected tracks generate without error
- Clips appear in the selected time range
- The model may have varied instrument timing per track

**Verdict**: human-checkpoint
**Human prompt**: "Multi-track generation with Auto mask. Do the generated tracks sound musically coherent together?"
**Screenshot**: `suite-8/us-8.5-multitrack-auto.png`

---

## US-8.6 — MultiTrack generate with Explicit mask

**Steps**:
1. Open MultiTrackGenerateModal
2. Switch mask mode to "Explicit"
3. Check 2-3 tracks, enter descriptions
4. Generate

**Expected**:
- All selected tracks generate without error
- Generated audio is precisely bounded to the selection range

**Verdict**: human-checkpoint
**Human prompt**: "Multi-track generation with Explicit mask. Does the audio start and stop precisely at the selection boundaries?"
**Screenshot**: `suite-8/us-8.6-multitrack-explicit.png`

---

## US-8.7 — Chunk mode instruction for sub-range generation

**Preconditions**: A project with total audio duration > 30s

**Steps**:
1. Open AddLayerModal targeting a sub-range (e.g. 10s-20s within a 60s project)
2. Generate a clip

**Expected**:
- The backend receives instruction containing "a segment of the" (chunk mode format)
- Generation completes without error
- The generated clip covers the specified sub-range

**Verdict**: automated (inspect network request or backend logs for instruction format)

---

## US-8.8 — Full mode instruction for full-range generation

**Steps**:
1. Use Batch Generate from Silence (Ctrl+G) to generate a single track
2. The clip covers the full audio duration (0 to totalDuration)

**Expected**:
- The backend receives instruction containing "Generate the ... track based on the audio context:" (full mode format, without "a segment of")
- Generation completes without error

**Verdict**: automated (inspect network request or backend logs for instruction format)

---

## US-8.9 — Batch from silence uses full mode for all tracks

**Steps**:
1. Start with a fresh project (no clips)
2. Open Batch Generate from Silence (Ctrl+G)
3. Check all tracks
4. Generate

**Expected**:
- All tracks generate in parallel (silence mode)
- Each track's request uses the full mode instruction (no "a segment of")
- All clips span the full audio duration

**Verdict**: automated (verify clip durations and instruction format)
**Screenshot**: `suite-8/us-8.9-batch-full-mode.png`
