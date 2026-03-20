# GPU Integration Tests

End-to-end integration tests for AI generation features that require a real GPU and the ACE-Step-1.5 inference backend. These tests **cannot** run in GitHub Actions (no GPU) — they run on GPU cluster machines via a QA agent using MCP browser tools.

## Directory Structure

```
tests/gpu-integration/
├── README.md                  # This file — overview and conventions
├── run.sh                     # Environment setup + service launcher
├── agent-prompt.md            # Instructions for the QA agent (MCP browser workflow)
└── stories/
    ├── 00-backend-connectivity.md   # Suite 0: health check, model inventory
    ├── 01-batch-silence.md          # Suite 1: Batch Generate from Silence
    ├── 02-batch-context.md          # Suite 2: Batch Generate from Context (LEGO)
    ├── 03-add-layer.md              # Suite 3: Add Layer Modal
    ├── 04-multi-track.md            # Suite 4: Multi-Track Generate Modal
    ├── 05-error-handling.md         # Suite 5: Error handling and edge cases
    ├── 06-cover-generation.md       # Suite 6: Cover Generation (CoverModal, Vocal2BGM)
    ├── 07-repaint-generation.md     # Suite 7: Repaint Generation (RepaintModal, RegionRegenerate)
    └── 08-mask-modes.md             # Suite 8: Mask Modes (Auto vs Explicit)
```

## How It Works

```
┌─────────────────────────────────────────────────────────────────┐
│  GPU Cluster Machine                                            │
│                                                                 │
│  1. run.sh  ──▶  starts ACE-Step-1.5 API  (port 8001)          │
│              ──▶  starts ACE-Step-DAW dev  (port 5174)          │
│              ──▶  verifies connectivity                         │
│                                                                 │
│  2. QA Agent reads agent-prompt.md                              │
│     ──▶  uses MCP browser tools to drive the DAW UI             │
│     ──▶  follows stories/*.md for each test suite               │
│     ──▶  takes screenshots at each checkpoint                   │
│     ──▶  asks human for PASS/FAIL on audio quality              │
│                                                                 │
│  3. On FAIL  ──▶  agent files GitHub issue via `gh`             │
│  4. Final    ──▶  agent produces test report summary            │
└─────────────────────────────────────────────────────────────────┘
```

## Running the Tests

### Step 1 — Start services

```bash
cd tests/gpu-integration
chmod +x run.sh
./run.sh
```

This starts the API and DAW servers, waits for readiness, and prints the URLs. It is idempotent — if services are already running, it skips startup.

### Step 2 — Run the QA agent

Give the agent the contents of `agent-prompt.md` as its system prompt. The agent will:

1. Open the DAW in the browser
2. Execute each story suite in order (Suite 0 → 1 → 2 → 3 → 4 → 5)
3. Take screenshots and ask for human feedback at checkpoints
4. File GitHub issues for any failures
5. Produce a final test report

### Step 3 — Review results

The agent produces a test report table at the end. Screenshots are saved during the run. Any failures result in GitHub issues with labels `bug`, `role: tester`, `status: backlog`.

## Conventions

### Adding new test suites

1. Create a new file in `stories/` with the next sequence number: `06-feature-name.md`
2. Follow the story template (see any existing file for the format)
3. Add the suite to the execution order in `agent-prompt.md`
4. Each story must have: **ID**, **preconditions**, **steps**, **expected results**, and **verdict type** (automated / human-checkpoint)

### Story file format

Every story file follows this structure:

```markdown
# Suite N: Feature Name

> Verdict type: automated | human-checkpoint
> Entry point: how the user triggers this feature
> Preconditions: what must be true before running

## US-N.1 — Story title

**Preconditions**: ...

**Steps**:
1. ...
2. ...

**Expected**:
- ...

**Verdict**: automated | human-checkpoint
**MCP sequence**: (optional, for complex interactions)
```

### Naming

- Suite files: `NN-kebab-case.md` (NN = two-digit sequence number)
- Story IDs: `US-N.M` where N = suite number, M = story number within suite
- Screenshots: `suite-N/us-N.M-description.png`

### Verdict types

- **automated**: The agent can determine PASS/FAIL by inspecting the DOM, store state, or HTTP responses. No human input needed.
- **human-checkpoint**: The agent performs all mechanical steps, then asks the human to evaluate (typically audio quality, musical coherence). The human provides PASS/FAIL.

## Scope

| Suite | Feature | Mode |
|-------|---------|------|
| 0 | Backend connectivity | — |
| 1 | Batch Generate from Silence | silence |
| 2 | Batch Generate from Context (LEGO) | context |
| 3 | Add Layer Modal | context |
| 4 | Multi-Track Generate Modal | context/silence |
| 5 | Error handling | — |
| 6 | Cover Generation | cover (CoverModal, Vocal2BGM) |
| 7 | Repaint Generation | repaint (RepaintModal, RegionRegenerate) |
| 8 | Mask Modes | auto/explicit mask, chunk/full instruction |

Out of scope (to be added when model support is ready): Stem Separation, Audio Analysis.
