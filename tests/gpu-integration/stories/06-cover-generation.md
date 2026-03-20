# Suite 6: Cover Generation

> Verdict type: human-checkpoint (audio quality requires listening)
> Entry point: Right-click a generated clip -> "Create Cover" (CoverModal), or right-click a vocal clip -> "Generate Accompaniment" (Vocal2BGMModal)
> Preconditions: Suite 0 passes; a project is open with Stems tracks; at least one track has a generated clip with audio

The Cover feature transforms existing audio into a new style using `task_type: 'cover'`. The Vocal2BGM feature generates accompaniment from a vocal reference clip using the same backend task type.

---

## US-6.1 — Open CoverModal from clip context menu

**Preconditions**: At least one clip has been generated (status = ready) on any Stems track

**Steps**:
1. Right-click a generated clip on the timeline
2. Select "Create Cover" from the context menu

**Expected**:
- `CoverModal` opens with title "Create Cover"
- Source clip info is displayed (track name, prompt)
- Style description textarea is pre-filled with the clip's prompt
- Lyrics textarea is visible
- Cover strength slider is visible (default 0.50)
- "Create new clip" checkbox is checked by default
- Generate button reads "Generate Cover"

**Verdict**: automated
**Screenshot**: `suite-6/us-6.1-modal-open.png`

---

## US-6.2 — Generate cover with default settings

**Steps**:
1. Open CoverModal on a generated clip
2. Enter style description: `jazz arrangement, smooth saxophone, soft piano`
3. Leave cover strength at 0.50
4. Leave "Create new clip" checked
5. Click "Generate Cover"

**Expected**:
- Modal closes
- A generation job appears in the GenerationPanel
- After completion, a new clip appears on the same track (original clip is preserved)
- The new clip has a rendered waveform

**Verdict**: human-checkpoint
**Human prompt**: "A cover was generated. Please play both the original and the cover clip. Does the cover sound like a jazz re-arrangement of the original?"
**Screenshot**: `suite-6/us-6.2-generating.png`, `suite-6/us-6.2-complete.png`

---

## US-6.3 — Cover strength slider affects output

**Steps**:
1. Open CoverModal on a generated clip
2. Set cover strength to 0.1 (close to original)
3. Enter style description: `electronic remix, heavy synths`
4. Generate cover
5. Note the result
6. Repeat with cover strength at 0.9 (fully reimagined)

**Expected**:
- Both generations complete without error
- The 0.1-strength cover sounds closer to the original
- The 0.9-strength cover sounds more dramatically different

**Verdict**: human-checkpoint
**Human prompt**: "Two covers were generated with different strengths (0.1 and 0.9). Does the low-strength version sound closer to the original than the high-strength version?"

---

## US-6.4 — Cover replaces original clip when unchecked

**Steps**:
1. Open CoverModal on a generated clip
2. Uncheck "Create new clip (leave original intact)"
3. Enter style description: `acoustic folk arrangement`
4. Click "Generate Cover"

**Expected**:
- The original clip is replaced (not preserved as a separate clip)
- The clip's version history contains the previous audio (can be restored)
- The replaced clip has a rendered waveform

**Verdict**: automated (check clip count unchanged) + human-checkpoint (audio)

---

## US-6.5 — Cover on clip without audio shows warning

**Preconditions**: A clip exists that has NOT been generated yet (status != ready)

**Steps**:
1. Right-click the ungenerated clip
2. Select "Create Cover"

**Expected**:
- CoverModal opens
- A warning message is displayed: "No audio generated yet"
- The "Generate Cover" button is disabled

**Verdict**: automated
**Screenshot**: `suite-6/us-6.5-no-audio.png`

---

## US-6.6 — Open Vocal2BGM modal from vocal clip

**Preconditions**: A Vocals track has a generated clip with audio

**Steps**:
1. Right-click the generated vocal clip
2. Select "Generate Accompaniment"

**Expected**:
- `Vocal2BGMModal` opens with title "Generate Accompaniment"
- Source vocal info is displayed (track name, prompt, duration, BPM/key if inferred)
- Target track dropdown shows non-vocal Stems tracks
- Style preset selector is visible
- Style description textarea is visible
- BPM and Key radio buttons default to "Project"
- Generate button reads "Generate Accompaniment"

**Verdict**: automated
**Screenshot**: `suite-6/us-6.6-v2bgm-modal.png`

---

## US-6.7 — Generate accompaniment from vocal

**Steps**:
1. Open Vocal2BGMModal on a generated vocal clip
2. Select a target track (e.g. Guitar)
3. Enter style description: `jazzy guitar chords, warm tone, following the vocal melody`
4. Click "Generate Accompaniment"

**Expected**:
- Modal closes
- A generation job appears in the GenerationPanel
- After completion, a new clip appears on the target track (Guitar)
- The new clip has a rendered waveform and matches the vocal clip's time position

**Verdict**: human-checkpoint
**Human prompt**: "An accompaniment was generated from a vocal clip. Please play both the vocal and the accompaniment together. Does the accompaniment complement the vocals?"
**Screenshot**: `suite-6/us-6.7-v2bgm-complete.png`

---

## US-6.8 — Vocal2BGM with style preset

**Steps**:
1. Open Vocal2BGMModal on a generated vocal clip
2. Click a style preset category (e.g. "Jazz")
3. Click a preset to apply it
4. Verify the style description textarea is filled with the preset caption
5. Generate

**Expected**:
- Preset caption is applied to the style description
- Generation completes without error
- Result clip is present on the target track

**Verdict**: automated (preset application) + human-checkpoint (audio quality)

---

## US-6.9 — Close modals without generating

**Steps**:
1. Open CoverModal, press Escape
2. Open Vocal2BGMModal, press Escape

**Expected**:
- Both modals close without creating generation jobs
- No clips are added to the timeline

**Verdict**: automated
