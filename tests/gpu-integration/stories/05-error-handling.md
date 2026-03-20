# Suite 5: Error Handling and Edge Cases

> Verdict type: automated
> Entry point: various
> Preconditions: Suite 0 passes

---

## US-5.1 — Generation when API is unreachable

**Steps**:
1. Open Settings dialog
2. Change Backend URL to an invalid address: `http://127.0.0.1:9999`
3. Close Settings
4. Attempt to generate via Batch Generate (Silence) with any description

**Expected**:
- A clear error message is displayed (e.g. "Backend unavailable", connection error, or toast notification)
- The DAW remains usable — no frozen UI, no unresponsive buttons
- No partial or broken clips on the timeline

**Cleanup**: Restore Backend URL to the correct value (clear the field to use default `/api` proxy, or set `http://127.0.0.1:8001`)

**Verdict**: automated
**Screenshot**: `suite-5/us-5.1-api-error.png`

---

## US-5.2 — Cancel in-progress batch generation

**Steps**:
1. Start a Batch Generate (Context) with 4+ tracks and a long duration (e.g. 120s)
2. While generation is in progress (at least one job is in "generating" state), click Cancel on the active job in GenerationPanel

**Expected**:
- Current generation cancels
- Remaining queued jobs are also cancelled
- No broken or partial clips are left on the timeline
- The DAW is immediately usable again (can start a new generation)

**Verdict**: automated
**Screenshot**: `suite-5/us-5.2-cancel.png`

---

## US-5.3 — Non-Stems track types excluded

**Steps**:
1. Add a Sequencer track and a Piano Roll track to the project
2. Open Batch Generate (Silence)

**Expected**:
- Only Stems tracks appear in the track list
- Sequencer and Piano Roll tracks are not listed (or are listed but disabled/unchecked and skipped during generation)
- No crash or error

**Verdict**: automated
**Screenshot**: `suite-5/us-5.3-non-stems.png`
