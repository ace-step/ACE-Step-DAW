# Suite 3: Add Layer Modal

> Verdict type: human-checkpoint (musical coherence with context)
> Entry point: Right-click on empty area of a Stems track lane → "Add Layer..."
> Preconditions: Suite 0 passes; a project with Stems tracks; ideally some tracks already have clips

Opens `AddLayerModal` for a specific track. The modal shows a context/select timeline diagram and generates a single clip using existing audio from other tracks as context.

---

## US-3.1 — Open Add Layer from context menu

**Preconditions**: A project with at least one Stems track

**Steps**:
1. Right-click on an empty area of a Stems track lane (e.g. Bass)
2. Observe the context menu

**Expected**:
- Context menu appears with "Add Layer..." option

**Verdict**: automated
**Screenshot**: `suite-3/us-3.1-context-menu.png`

---

## US-3.2 — Modal layout and controls

**Steps**:
1. Click "Add Layer..." from the context menu

**Expected**:
- Modal opens showing:
  - Timeline diagram with Context and Select regions
  - Dual-range slider for start/end time
  - Track description textarea (pre-filled with track's local caption or display name)
  - Global song description textarea (pre-filled from project)
  - Mask mode toggle (Auto / Explicit)
  - Advanced options section (collapsed by default)
  - Generate and Cancel buttons
- For vocal tracks: lyrics textarea is also visible

**Verdict**: automated
**Screenshot**: `suite-3/us-3.2-modal-layout.png`

---

## US-3.3 — Adjust select window range

**Steps**:
1. Open Add Layer modal
2. Drag the left handle of the dual-range slider to change the start time
3. Drag the right handle to change the end time

**Expected**:
- Time labels update to reflect the new range
- Timeline diagram updates the select region

**Verdict**: automated
**Screenshot**: `suite-3/us-3.3-range-adjusted.png`

---

## US-3.4 — Generate a new layer with context

**Preconditions**: At least one other track (e.g. Drums) already has a generated clip

**Steps**:
1. Right-click on the Bass track lane → "Add Layer..."
2. Enter track description: `deep bass line, following the drum groove`
3. Ensure global description is filled
4. Click Generate

**Expected**:
- Generation starts (modal may close or show progress)
- New clip appears on the Bass track at the selected time range
- The generated bass is musically aware of the existing drums context

**Verdict**: human-checkpoint
**Human prompt**: "A Bass layer was generated using existing Drums as context. Does the bass follow the drum groove?"
**Screenshot**: `suite-3/us-3.4-layer-generated.png`

---

## US-3.5 — Generate a layer on empty project (no context)

**Preconditions**: Fresh project, no clips on any track

**Steps**:
1. Right-click on Drums track lane → "Add Layer..."
2. Enter description: `energetic rock drums, driving beat`
3. Click Generate

**Expected**:
- Generation succeeds using silence as context
- Clip appears on timeline with waveform

**Verdict**: human-checkpoint
**Human prompt**: "Drums generated from silence via Add Layer. Is the audio audible and reasonable?"
**Screenshot**: `suite-3/us-3.5-no-context.png`

---

## US-3.6 — Mask mode: Auto vs Explicit

**Steps**:
1. Open Add Layer, set mask mode to "Auto", generate
2. Delete the generated clip
3. Open Add Layer again, set mask mode to "Explicit", generate with same description

**Expected**:
- Both modes produce valid output without errors
- Both clips appear on timeline with waveforms

**Verdict**: human-checkpoint
**Human prompt**: "Two clips generated with Auto vs Explicit mask mode. Do both sound reasonable?"
**Screenshot**: `suite-3/us-3.6-auto.png`, `suite-3/us-3.6-explicit.png`

---

## US-3.7 — Advanced options: Sample Mode

**Steps**:
1. Open Add Layer
2. Expand "Advanced" options
3. Enable "Sample Mode" checkbox
4. Click Generate

**Expected**:
- Generation uses auto-generated caption/lyrics/metadata from the model
- Clip appears on timeline

**Verdict**: human-checkpoint
**Human prompt**: "Sample Mode was used (model auto-generates metadata). Does the output sound like a valid musical clip?"
**Screenshot**: `suite-3/us-3.7-sample-mode.png`

---

## US-3.8 — Edit existing clip metadata (Edit Mode)

**Preconditions**: A clip already exists on a track with generated audio

**Steps**:
1. Right-click the clip → "Edit Clip" (opens AddLayerModal in edit mode with `clipId`)
2. Modify the track description text
3. Click "Save" (not Generate)

**Expected**:
- Clip metadata updates (description changes)
- Audio is NOT regenerated
- Modal closes

**Verdict**: automated (verify description changed, audio blob unchanged)
**Screenshot**: `suite-3/us-3.8-edit-mode.png`
