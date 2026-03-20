# Suite 4: Multi-Track Generate Modal

> Verdict type: human-checkpoint (audio quality)
> Entry point: Drag-select a time range across multiple track lanes on the timeline
> Preconditions: Suite 0 passes; a project with multiple Stems tracks

Drag-selecting on the timeline (without modifier keys for context) sets `selectWindow` in uiStore, which opens `MultiTrackGenerateModal`. The modal generates clips for multiple tracks within the selected time range.

---

## US-4.1 — Open modal via timeline drag-select

**Preconditions**: A project with multiple Stems tracks

**Steps**:
1. Click and drag horizontally across the timeline area, spanning multiple track lanes (e.g. from 0s to 30s across Drums, Bass, Guitar)
2. Release the mouse

**Expected**:
- A selection rectangle appears during the drag
- `MultiTrackGenerateModal` opens showing:
  - The selected time range
  - Track list with checkboxes (pre-checked for tracks in the drag region)
  - Per-track description textareas
  - Global song description textarea
  - Shared seed input with randomize button
  - Generate button with track count

**Verdict**: automated
**Screenshot**: `suite-4/us-4.1-modal-open.png`

---

## US-4.2 — Generate multiple tracks for selected region

**Steps**:
1. In the Multi-Track Generate modal, verify the time range and track list
2. Check Drums, Bass, and Guitar
3. Enter per-track descriptions:
   - Drums: `steady rock beat`
   - Bass: `root note bass line`
   - Guitar: `power chords`
4. Enter global description: `classic rock song, 130 BPM`
5. Click "Generate 3 tracks"

**Expected**:
- Generation starts for all selected tracks
- Clips appear on the timeline in the selected time range after completion
- Each clip has a rendered waveform

**Verdict**: human-checkpoint
**Human prompt**: "Three tracks generated for the selected region. Please play back and verify: (1) all tracks have audio, (2) they sound musically related."
**Screenshot**: `suite-4/us-4.2-generating.png`, `suite-4/us-4.2-complete.png`

---

## US-4.3 — Multi-track with existing context audio

**Preconditions**: Drums track already has a clip in the 0–30s range

**Steps**:
1. Drag-select the 0–30s range across Bass and Guitar lanes
2. Modal should detect existing context audio (Drums)
3. Check Bass and Guitar, enter descriptions
4. Generate

**Expected**:
- Bass and Guitar are generated with Drums as context
- Generated tracks are musically coherent with the existing Drums

**Verdict**: human-checkpoint
**Human prompt**: "Bass and Guitar generated with existing Drums as context. Do they complement the Drums?"
**Screenshot**: `suite-4/us-4.3-with-context.png`

---

## US-4.4 — Context audio preview

**Preconditions**: Some tracks have existing clips in the selected range

**Steps**:
1. Open Multi-Track Generate modal for a range with existing audio
2. Click the play button to preview context audio
3. Click stop

**Expected**:
- Context audio plays audibly
- Scrub slider shows playback position
- Stop button stops playback

**Verdict**: human-checkpoint
**Human prompt**: "Context audio preview played. Did you hear the existing track audio?"

---

## US-4.5 — Close modal without generating

**Steps**:
1. Open Multi-Track Generate modal via drag-select
2. Press Escape

**Expected**:
- Modal closes
- Select window clears from the timeline
- No generation jobs are created
- No clips are added

**Verdict**: automated
