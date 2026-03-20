# Suite 2: Batch Generate from Context (LEGO Pipeline)

> Verdict type: human-checkpoint (musical coherence requires listening)
> Entry point: `Ctrl+Shift+G`
> Preconditions: Suite 0 passes; a project is open with Stems tracks

Opens `BatchGenerateModal` with `mode='context'`. Tracks generate **sequentially** in generation order (Drums → Bass → Guitar → ...). Each track receives the cumulative mix of all previously generated tracks as `src_audio`.

---

## US-2.1 — Open modal via keyboard shortcut

**Steps**:
1. Ensure a project is open with default tracks
2. Press `Ctrl+Shift+G`

**Expected**:
- `BatchGenerateModal` opens with title "Generate from Context"

**Verdict**: automated
**Screenshot**: `suite-2/us-2.1-modal-open.png`

---

## US-2.2 — Generate all tracks with LEGO context chain

**Steps**:
1. Start with a fresh project (no existing clips)
2. Open Batch Generate (Context)
3. Enter global description: `chill lo-fi hip hop beat, mellow vibes, 85 BPM`
4. Enter per-track descriptions:
   - Drums: `laid-back boom bap drums, vinyl crackle`
   - Bass: `deep mellow bass, following the drums`
   - Guitar: `jazzy guitar chords, warm tone`
5. Check all tracks, click Generate

**Expected**:
- Tracks generate sequentially: Drums first (order 12), then Bass (order 11), then Guitar (order 10), etc.
- Progress is visible in GenerationPanel — one track at a time
- After completion, all Stems tracks have clips on the timeline

**Verdict**: human-checkpoint
**Human prompt**: "LEGO pipeline complete. Please: (1) play all tracks together — do they sound musically coherent? (2) solo Bass — does it follow the Drums groove? (3) solo Guitar — does it complement Drums+Bass?"
**Screenshot**: `suite-2/us-2.2-generating.png`, `suite-2/us-2.2-all-done.png`

---

## US-2.3 — Verify sequential generation order

**Steps**:
1. During US-2.2, observe the GenerationPanel at the bottom of the screen

**Expected**:
- Jobs appear one at a time in generation order
- First job is for the track with highest order (typically Drums)
- Each subsequent job starts only after the previous one completes
- The stage transitions are visible: queued → generating → processing → done

**Verdict**: automated (observe job sequence in GenerationPanel)
**Screenshot**: `suite-2/us-2.3-sequence.png`

---

## US-2.4 — Partial context generation

**Steps**:
1. Open Batch Generate (Context)
2. Check only Drums, Bass, and Guitar (uncheck the rest)
3. Enter descriptions, click Generate

**Expected**:
- Only 3 tracks generate, in order: Drums → Bass → Guitar
- Context chain: Drums gets silence, Bass gets Drums, Guitar gets Drums+Bass
- Unchecked tracks remain empty

**Verdict**: automated (clip presence) + human-checkpoint (coherence)
**Screenshot**: `suite-2/us-2.4-partial.png`

---

## US-2.5 — Context generation with pre-existing clips

**Preconditions**: Drums track already has a generated clip (from Suite 1 or a prior run)

**Steps**:
1. Open Batch Generate (Context)
2. Drums should show "has existing audio" or be unchecked by default
3. Check only Bass and Guitar
4. Generate

**Expected**:
- Bass receives the existing Drums clip as context
- Guitar receives Drums+Bass cumulative mix as context
- The pre-existing Drums clip is NOT regenerated or modified

**Verdict**: human-checkpoint
**Human prompt**: "Bass and Guitar were generated using existing Drums as context. Does the Bass follow the Drums groove? Does Guitar complement both?"
**Screenshot**: `suite-2/us-2.5-existing-context.png`

---

## US-2.6 — Lyrics for vocal tracks

**Steps**:
1. Open Batch Generate (Context)
2. For "Vocals" row, enter lyrics:
   ```
   [Verse]
   Walking down the street at night
   City lights are shining bright
   ```
3. For "Backing Vocals" row, enter: `Ooh, aah, ooh`
4. Generate with all tracks checked

**Expected**:
- Lyrics textareas appear only for vocal-type tracks (vocals, backing_vocals)
- Generation completes for all tracks
- Vocal clips use the provided lyrics

**Verdict**: human-checkpoint
**Human prompt**: "Lyrics were provided for vocal tracks. Can you hear the lyrics in the vocal output?"
**Screenshot**: `suite-2/us-2.6-lyrics.png`

---

## US-2.7 — Global caption pre-fills from project

**Steps**:
1. Open Settings dialog, set Global Song Description to `ambient electronic, 90 BPM, A minor`
2. Close Settings
3. Open Batch Generate (Context)

**Expected**:
- Global song description textarea is pre-filled with `ambient electronic, 90 BPM, A minor`

**Verdict**: automated

---

## US-2.8 — Generation progress and ETA display

**Steps**:
1. Start a Batch Generate (Context) with 4+ tracks
2. Observe the GenerationPanel during generation

**Expected**:
- Each active job shows: track name, current stage, progress bar with percentage, ETA countdown
- Jobs transition: queued → generating → processing → done
- Completed jobs show a done/checkmark state
- ETA is reasonable (not showing negative or extremely large values)

**Verdict**: automated
**Screenshot**: `suite-2/us-2.8-progress.png`
