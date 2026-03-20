# Suite 1: Batch Generate from Silence

> Verdict type: human-checkpoint (audio quality requires listening)
> Entry point: Toolbar "Genr" button or `Ctrl+G`
> Preconditions: Suite 0 passes; a project is open with Stems tracks

Opens `BatchGenerateModal` with `mode='silence'`. Each track generates independently using silence as `src_audio` — no cross-track context dependency.

---

## US-1.1 — Open modal via toolbar

**Steps**:
1. Ensure a project is open with default tracks (Drums, Bass, Guitar, Keyboard, Vocals)
2. Click the "Genr" button in the toolbar (`data-onboarding-target="genr-button"`)

**Expected**:
- `BatchGenerateModal` opens with title "Generate from Silence"
- All Stems tracks listed with checkboxes (checked by default for tracks without clips)
- Global song description textarea is visible
- Shared seed input with randomize button is visible
- Generate button shows the count of selected tracks

**Verdict**: automated
**Screenshot**: `suite-1/us-1.1-modal-open.png`

---

## US-1.2 — Open modal via keyboard shortcut

**Steps**:
1. Press `Ctrl+G`

**Expected**:
- Same modal opens as US-1.1

**Verdict**: automated

---

## US-1.3 — Generate all tracks from silence

**Steps**:
1. Open Batch Generate (Silence)
2. Fill global song description: `upbeat pop song, energetic drums, groovy bass, bright guitar, warm keyboard`
3. Ensure all tracks are checked
4. Click the Generate button

**Expected**:
- Modal closes
- Generation jobs appear in the bottom GenerationPanel with progress bars
- Each track generates independently (all may run in parallel or sequentially — either is valid)
- After completion, each Stems track has a clip on the timeline with a rendered waveform
- Clips are playable (press Space to play)

**Verdict**: human-checkpoint
**Human prompt**: "All tracks generated from silence. Please play back (Space) and verify: (1) each track has audible, non-silent audio, (2) no obvious artifacts or noise."
**Screenshot**: `suite-1/us-1.3-generating.png`, `suite-1/us-1.3-complete.png`

---

## US-1.4 — Generate subset of tracks

**Steps**:
1. Open Batch Generate (Silence)
2. Uncheck all tracks, then check only "Drums" and "Bass"
3. Enter global description: `minimal beat, deep bass`
4. Click Generate

**Expected**:
- Only Drums and Bass clips are generated
- Other tracks remain empty
- Button label shows correct count (e.g. "Generate (2)")

**Verdict**: automated (clip presence check) + human-checkpoint (audio)
**Screenshot**: `suite-1/us-1.4-subset.png`

---

## US-1.5 — Per-track local descriptions

**Steps**:
1. Open Batch Generate (Silence)
2. Enter local descriptions:
   - Drums: `punchy kick, tight closed hi-hats, snare on 2 and 4`
   - Bass: `walking bass line, jazz feel`
   - Vocals: enter lyrics in the lyrics textarea: `La la la, singing in the sun`
3. Generate all checked tracks

**Expected**:
- Generation completes without error for all tracks
- Each track's clip is present on the timeline

**Verdict**: human-checkpoint
**Human prompt**: "Per-track descriptions were used. Please solo each track and verify the audio roughly matches the description."
**Screenshot**: `suite-1/us-1.5-per-track.png`

---

## US-1.6 — Shared seed determinism

**Steps**:
1. Open Batch Generate (Silence)
2. Set seed to `12345`
3. Check only "Drums", enter description: `four on the floor kick`
4. Generate and note the waveform shape
5. Delete the generated clip
6. Repeat steps 1–4 with the same seed and description

**Expected**:
- The two generated clips have identical or near-identical waveforms

**Verdict**: automated (waveform comparison via screenshot diff)
**Screenshot**: `suite-1/us-1.6-seed-run1.png`, `suite-1/us-1.6-seed-run2.png`

---

## US-1.7 — Randomize seed button

**Steps**:
1. Open Batch Generate (Silence)
2. Note the current seed value
3. Click the randomize (dice) button next to the seed input

**Expected**:
- Seed value changes to a different random number

**Verdict**: automated

---

## US-1.8 — Close modal without generating

**Steps**:
1. Open Batch Generate (Silence)
2. Press Escape

**Expected**:
- Modal closes
- No generation jobs are created
- No clips are added to the timeline

**Verdict**: automated
