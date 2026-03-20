# Suite 0: Backend Connectivity

> Verdict type: automated
> Entry point: page load + Settings dialog
> Preconditions: `run.sh` has completed successfully

This suite verifies that the DAW can communicate with the ACE-Step-1.5 API backend. All other suites depend on this passing.

---

## US-0.1 — Health check passes

**Steps**:
1. Navigate to `http://127.0.0.1:5174`
2. Wait for page load
3. Take a snapshot of the page

**Expected**:
- Page loads without errors
- No "Backend unavailable" or connection error text in the DOM
- Status bar does not show a red/error state

**Verdict**: automated

---

## US-0.2 — Model inventory loads

**Steps**:
1. Open the Settings dialog (click the gear icon in the toolbar)
2. Navigate to the Model section

**Expected**:
- DiT model dropdown contains at least one option (e.g. `acestep-v15-turbo-fix-inst-shift-dynamic`)
- LM model information is displayed (e.g. `acestep-5Hz-lm-1.7B`)

**Verdict**: automated

---

## US-0.3 — Generation settings accessible

**Steps**:
1. In the Settings dialog, locate the Generation section

**Expected**:
- Inference Steps input is visible and adjustable (range 10–200)
- Guidance Scale input is visible and adjustable (range 1–20)
- Shift input is visible and adjustable (range 0–10)
- Thinking mode toggle is visible

**Verdict**: automated
