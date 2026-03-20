# Suite 7: Repaint Generation

> Verdict type: human-checkpoint (audio quality requires listening)
> Entry point: Right-click a generated clip -> "Repaint Selection" (RepaintModal), or timeline region selection -> "Regenerate Region" (RegionRegenerateModal)
> Preconditions: Suite 0 passes; a project is open with Stems tracks; at least one track has a generated clip with audio

The Repaint feature regenerates a selected sub-range of an existing clip using `task_type: 'repaint'`. The Region Regenerate feature repaints overlapping clips within a timeline selection.

---

## US-7.1 — Open RepaintModal from clip context menu

**Preconditions**: At least one clip has been generated (status = ready)

**Steps**:
1. Right-click a generated clip on the timeline
2. Select "Repaint Selection" from the context menu

**Expected**:
- `RepaintModal` opens with title "Repaint Selection"
- Target clip info is displayed (track name, clip time range)
- Repaint range slider is visible, defaulting to the full clip range
- Mini timeline diagram shows clip region and repaint region
- Prompt textarea is pre-filled with the clip's prompt
- Global song description textarea is visible
- Repaint mode buttons are visible (Conservative / Balanced / Aggressive), with "Balanced" selected by default
- Repaint strength slider is visible (default 0.50), only shown in Balanced mode
- Generate button reads "Repaint Selection"

**Verdict**: automated
**Screenshot**: `suite-7/us-7.1-modal-open.png`

---

## US-7.2 — Repaint a sub-range with balanced mode

**Steps**:
1. Open RepaintModal on a generated clip
2. Adjust the repaint range slider to select the middle third of the clip
3. Enter prompt: `energetic drum fill, building intensity`
4. Leave repaint mode as "Balanced" with strength 0.50
5. Click "Repaint Selection"

**Expected**:
- Modal closes
- A generation job appears in the GenerationPanel with "Repainting..." progress
- After completion, the clip is updated with the repainted audio
- Audio outside the repaint region is preserved unchanged
- The clip's version history contains the previous audio

**Verdict**: human-checkpoint
**Human prompt**: "A sub-range was repainted. Please play the clip and verify: (1) the repainted section sounds different from before, (2) the audio outside the repaint range sounds unchanged, (3) there are no obvious glitches at the boundaries."
**Screenshot**: `suite-7/us-7.2-repaint-complete.png`

---

## US-7.3 — Repaint mode: Conservative

**Steps**:
1. Open RepaintModal on a generated clip
2. Select the first half of the clip as repaint range
3. Click "Conservative" mode button
4. Enter prompt: `subtle variation, same feel`
5. Generate

**Expected**:
- Repaint strength slider is hidden (conservative mode has fixed parameters)
- Generation completes without error
- The repainted section sounds very close to the original with subtle changes

**Verdict**: human-checkpoint
**Human prompt**: "Conservative repaint was applied. Does the repainted section sound very similar to the original with only subtle differences?"

---

## US-7.4 — Repaint mode: Aggressive

**Steps**:
1. Open RepaintModal on a generated clip
2. Select a sub-range
3. Click "Aggressive" mode button
4. Enter prompt: `completely different rhythm, heavy distortion`
5. Generate

**Expected**:
- Repaint strength slider is hidden (aggressive mode has fixed parameters)
- Generation completes without error
- The repainted section sounds dramatically different from the original

**Verdict**: human-checkpoint
**Human prompt**: "Aggressive repaint was applied. Does the repainted section sound significantly different from the original?"

---

## US-7.5 — Repaint strength slider in balanced mode

**Steps**:
1. Open RepaintModal on a generated clip
2. Ensure "Balanced" mode is selected
3. Set repaint strength to 0.1
4. Generate and note the result
5. Repeat with repaint strength at 0.9

**Expected**:
- Both generations complete without error
- Strength 0.1 produces subtle changes (closer to conservative)
- Strength 0.9 produces dramatic changes (closer to aggressive)

**Verdict**: human-checkpoint
**Human prompt**: "Two repaints with different strengths (0.1 and 0.9). Does the low-strength version preserve more of the original?"

---

## US-7.6 — Repaint on clip without audio shows warning

**Preconditions**: A clip exists that has NOT been generated yet

**Steps**:
1. Right-click the ungenerated clip
2. Select "Repaint Selection"

**Expected**:
- RepaintModal opens
- Warning: "No audio generated yet"
- "Repaint Selection" button is disabled

**Verdict**: automated
**Screenshot**: `suite-7/us-7.6-no-audio.png`

---

## US-7.7 — Region Regenerate modal

**Preconditions**: Multiple tracks have generated clips that overlap a common time range

**Steps**:
1. Select a time range on the timeline that overlaps generated clips on multiple tracks
2. Right-click the selection and choose "Regenerate Region"

**Expected**:
- `RegionRegenerateModal` opens with title "Regenerate Region"
- Selected region time range is displayed
- Affected tracks and clip count are listed
- Prompt textarea and global caption textarea are visible
- Generate button shows the count of clips to regenerate

**Verdict**: automated
**Screenshot**: `suite-7/us-7.7-region-modal.png`

---

## US-7.8 — Region Regenerate execution

**Steps**:
1. Open RegionRegenerateModal for a region with 2+ overlapping clips
2. Enter prompt: `more energetic, faster rhythm`
3. Click "Regenerate N Clips"

**Expected**:
- Modal closes
- Generation jobs appear for each affected clip
- After completion, all affected clips are updated
- Audio outside the selected region is preserved
- Version history is saved for each clip before regeneration

**Verdict**: human-checkpoint
**Human prompt**: "Multiple clips were regenerated in a region. Please play back and verify: (1) the regenerated sections sound different, (2) audio outside the region is unchanged."
**Screenshot**: `suite-7/us-7.8-region-complete.png`

---

## US-7.9 — Close modals without generating

**Steps**:
1. Open RepaintModal, press Escape
2. Open RegionRegenerateModal, press Escape

**Expected**:
- Both modals close without creating generation jobs
- No clips are modified

**Verdict**: automated
