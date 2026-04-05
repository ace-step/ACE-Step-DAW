#!/usr/bin/env bash
# Creates 7 GitHub Issues for PR Triage & Merge Plan
# Usage: GH_TOKEN=ghp_xxx ./create-triage-issues.sh
# Or:    gh auth login && ./create-triage-issues.sh

set -euo pipefail

REPO="ace-step/ACE-Step-DAW"

create_issue() {
  local title="$1"
  local body="$2"
  local labels="$3"

  if command -v gh &>/dev/null && gh auth status &>/dev/null 2>&1; then
    gh issue create --repo "$REPO" --title "$title" --label "$labels" --body "$body"
  elif [ -n "${GH_TOKEN:-}" ]; then
    local json
    json=$(python3 -c "
import json
print(json.dumps({
  'title': '''$title''',
  'body': $(python3 -c "import json,sys; print(json.dumps(sys.stdin.read()))" <<< "$body"),
  'labels': '${labels}'.split(',')
}))
")
    curl -s -X POST \
      -H "Authorization: Bearer $GH_TOKEN" \
      -H "Accept: application/vnd.github+json" \
      -d "$json" \
      "https://api.github.com/repos/$REPO/issues"
  else
    echo "ERROR: No auth. Run 'gh auth login' or set GH_TOKEN env var."
    exit 1
  fi
}

echo "=== Creating Master Issue ==="
MASTER_URL=$(create_issue \
  "chore: PR Triage & Merge Plan — organize 33 open PRs into 6 themed batches" \
  "$(cat <<'BODY'
## Problem

33 open PRs have accumulated, causing:
- Increasing merge conflicts as branches diverge from main
- Duplicated work (2 pairs of PRs target the same issue)
- Context loss and stale branches
- No clear merge order, blocking subagent follow-up

Supersedes #1107.

## Duplicate PRs Identified

| Issue | PR A (older) | PR B (newer) | Recommendation |
|-------|-------------|-------------|----------------|
| #1023 (automation/LFO conflict) | #1440 (4 files) | #1448 (67 files) | **Keep #1448** — far more comprehensive. Close #1440. |
| #1033 (scene properties) | #1431 (color+tempo+rename) | #1446 (color+badges) | **Keep #1431** — broader scope. Close #1446. |

## Dependency Chains

- `#1432 → #1445 → #1449` (MIDI capture → Session UI → follow actions)
- `#1431 → #1449` (scene properties → follow actions)
- `#1410 → #1411 → #1412 → #1413 → #1414 → #1417` (effect UI chain)

## Merge Batch Order

| Batch | Theme | Priority | PRs | Rationale |
|-------|-------|----------|-----|-----------|
| 1 | Testing & CI | P0 | #1427 #1428 #1433 #1434 #1435 #1436 #1437 #1447 #1438 | Foundation — safe additive tests |
| 2 | Effect Device UI | P1 | #1410 #1411 #1412 #1413 #1414 #1429 #1417 #1423 #1439 #1441 #1448 | Sequential UI chain |
| 3 | Session View | P1 | #1431 #1432 #1445 #1449 | Dependency chain |
| 4 | Core Audio/DSP | P1 | #1420 #1421 #1426 | Independent engine features |
| 5 | Major Features | P2 | #1425 #1444 #1430 | Large standalone features |
| 6 | UI Polish | P2 | #1402 | Standalone cleanup |

## Testing Strategy

1. **Per-PR**: `npm test` + `npx tsc --noEmit` + `npm run build` after rebase
2. **Per-Batch**: `npm run test:all` (unit + E2E) after all PRs in batch merged
3. **Integration Gate**: `npm run test:e2e` after Batch 2 and Batch 3
4. **Final**: Full system test per AGENTS.md Step 9

## Acceptance Criteria

- [ ] All duplicate PRs resolved (close #1440 and #1446)
- [ ] Batch 1: Testing & CI merged
- [ ] Batch 2: Effect Device UI merged
- [ ] Batch 3: Session View merged
- [ ] Batch 4: Audio/DSP merged
- [ ] Batch 5: Major Features merged
- [ ] Batch 6: UI Polish merged
- [ ] `npm run test:all` green after all batches
- [ ] Total open PRs < 5
BODY
)" \
  "enhancement,priority: P0")

echo ""
echo "Master issue created: $MASTER_URL"
echo ""

echo "=== Creating Batch 1: Testing & CI ==="
create_issue \
  "chore: Batch 1 — merge 9 testing & CI PRs (P0 foundation)" \
  "$(cat <<'BODY'
Part of the PR Triage & Merge Plan.

## Why First

Testing PRs are pure additive (no production code changes). Merging first:
- Establishes higher test coverage baseline
- Makes subsequent merges safer
- No conflict risk with feature PRs

## PRs (merge order)

| # | PR | Title | Strategy |
|---|-----|-------|----------|
| 1 | #1427 | Add coverage thresholds to CI pipeline | CI config — merge first |
| 2 | #1428 | Make critical E2E tests blocking in CI | CI config |
| 3 | #1433 | Unit tests: commandPalette search + resolveContextWindow | Independent |
| 4 | #1434 | Unit tests: focusResolution + sessionLaunchCommit | Independent |
| 5 | #1435 | Comprehensive unit tests for critical services | Independent |
| 6 | #1436 | Unit tests for critical hooks | Independent |
| 7 | #1437 | Unit tests: PluginEngine + RecordingEngine | Independent |
| 8 | #1447 | Unit tests for 5 critical untested engine files | Independent |
| 9 | #1438 | Integration test layer with real Zustand stores | Merge last |

## Per-PR Merge Steps

\`\`\`bash
git checkout <pr-branch> && git rebase main
npm test && npx tsc --noEmit && npm run build
# merge via PR
\`\`\`

## Post-Batch Validation

\`\`\`bash
npm run test:all
npm run test:coverage  # verify thresholds from #1427
\`\`\`

## Acceptance Criteria

- [ ] All 9 PRs merged without regressions
- [ ] `npm run test:all` passes
- [ ] Coverage thresholds enforced in CI
BODY
)" \
  "enhancement,priority: P0"

echo ""

echo "=== Creating Batch 2: Effect Device UI ==="
create_issue \
  "chore: Batch 2 — merge 11 effect device UI PRs (P1, sequential)" \
  "$(cat <<'BODY'
Part of the PR Triage & Merge Plan.

## Duplicate Resolution

- **Close #1440** in favor of **#1448** (both close #1023, but #1448 is 67 files with conflict detection UI)

## PRs (strict merge order)

| # | PR | Title | Notes |
|---|-----|-------|-------|
| 1 | #1410 | Deduplicate effect colors, category grouping | Color foundation |
| 2 | #1411 | Redesign effect device title bar | Depends on colors |
| 3 | #1412 | Standardize parameter layout (ModeButton) | Shared component |
| 4 | #1413 | Width tier system, remove scrollable cards | Layout refinement |
| 5 | #1414 | 2-tier knob size system | Visual hierarchy |
| 6 | #1429 | Decompose EnhancePanel.tsx | Refactor before features |
| 7 | #1417 | Convolver IR, Limiter curve, EQ3 viz | New components |
| 8 | #1423 | Limiter knee math fix | DSP correction |
| 9 | #1439 | Synth parameter editing UI | New UI |
| 10 | #1441 | Visual LFO waveform preview | LFO viz |
| 11 | #1448 | Automation/LFO conflict detection | Comprehensive #1023 fix |

## Conflict Risk: HIGH

These PRs touch overlapping files in \`src/components/effects/\`. Expect rebase conflicts in #1411-#1414 range.

## Testing Plan

- After each merge: \`npm test\` + visual check on \`npm run dev\`
- After full batch: \`npm run test:e2e\`
- Manual: verify effect device colors/layout/knobs in browser

## Acceptance Criteria

- [ ] #1440 closed as duplicate
- [ ] All 11 PRs merged in order
- [ ] No visual regressions in effect devices
- [ ] \`npm run test:e2e\` passes
BODY
)" \
  "enhancement,priority: P1"

echo ""

echo "=== Creating Batch 3: Session View ==="
create_issue \
  "chore: Batch 3 — merge 4 Session View PRs (P1, dependency chain)" \
  "$(cat <<'BODY'
Part of the PR Triage & Merge Plan.

## Duplicate Resolution

- **Close #1446** in favor of **#1431** (both close #1033; #1431 has tempo/timeSig + rename)
- Cherry-pick #1446 visual badge feature into #1431 if unique

## PRs (strict dependency order)

| # | PR | Title | Depends On |
|---|-----|-------|-----------|
| 1 | #1431 | Scene properties: color, tempo/timeSig, rename | None |
| 2 | #1432 | MIDI retroactive capture: session auto-assign | None (parallel with #1431) |
| 3 | #1445 | MIDI retroactive capture → Session View UI | **#1432 must merge first** |
| 4 | #1449 | Enhanced Session View: follow actions, chaining | **#1431 must merge first** |

## Dependency Graph

\`\`\`
#1431 (scene props) ────────────────→ #1449 (follow actions)
                                          ↑
#1432 (MIDI backend) → #1445 (MIDI UI) ──┘
\`\`\`

## Testing Plan

- After #1431: verify scene color picker, tempo override, rename
- After #1432 + #1445: verify MIDI retroactive capture button works
- After #1449: verify follow actions, scene chaining, visual feedback
- Full batch: \`npm run test:e2e\`

## Acceptance Criteria

- [ ] #1446 closed as duplicate
- [ ] All 4 PRs merged in dependency order
- [ ] Session View features verified visually
- [ ] \`npm run test:e2e\` passes
BODY
)" \
  "enhancement,priority: P1"

echo ""

echo "=== Creating Batch 4: Audio/DSP ==="
create_issue \
  "chore: Batch 4 — merge 3 audio engine PRs (P1, independent)" \
  "$(cat <<'BODY'
Part of the PR Triage & Merge Plan.

## PRs (independent, any order)

| PR | Title | Scope |
|-----|-------|-------|
| #1420 | Professional time-stretch engine (5 modes) | Audio engine |
| #1421 | Pitch correction & vocal tuning engine | Audio engine |
| #1426 | Lazy placeholder count (removes 128-track cap) | Performance |

## Testing Plan

- Each PR: \`npm test\` + \`npx tsc --noEmit\`
- After batch: \`npm run test:all\`
- Manual: create >128 tracks (#1426), test time-stretch and pitch correction

## Acceptance Criteria

- [ ] All 3 PRs merged
- [ ] \`npm run test:all\` passes
- [ ] Audio features verified manually
BODY
)" \
  "enhancement,priority: P1"

echo ""

echo "=== Creating Batch 5: Major Features ==="
create_issue \
  "chore: Batch 5 — merge 4 major feature PRs (P2, standalone)" \
  "$(cat <<'BODY'
Part of the PR Triage & Merge Plan.

## PRs (recommended order)

| # | PR | Title | Size | Closes |
|---|-----|-------|------|--------|
| 1 | #1425 | Sound Preview & Audition System | 47 files, 25 tests | #1238 |
| 2 | #1444 | AI chord suggestion (ChordSeqAI ONNX) | New engine | — |
| 3 | #1430 | Video Track Support Phases 1-5 | 23 files, 71 tests | #1144-#1149 |

## Risk Assessment

- **#1430 (Video Track)**: Largest PR — 23 files, closes 6 issues. Extensive E2E needed.
- **#1444 (AI Chord)**: External ONNX dependency. Verify model loading in CI.
- **#1425 (Sound Preview)**: 47 files — high conflict potential if merged late.

## Testing Plan

- Each PR: full test suite + manual feature walkthrough
- #1430: import video, verify filmstrip thumbnails, transport sync
- #1444: open chord suggestion panel, verify suggestions generate
- #1425: browse presets, preview audio before applying

## Acceptance Criteria

- [ ] All 3 PRs merged
- [ ] \`npm run test:all\` passes
- [ ] Each feature manually verified
BODY
)" \
  "enhancement,priority: P2"

echo ""

echo "=== Creating Batch 6: UI Polish ==="
create_issue \
  "chore: Batch 6 — merge component polish PR (P2, final)" \
  "$(cat <<'BODY'
Part of the PR Triage & Merge Plan.

## PRs

| PR | Title | Scope |
|-----|-------|-------|
| #1402 | Component polish: Button, Tooltip, ContextMenu, Toast | Global UI |

## Notes

- Touches foundational UI components — may cause minor visual changes across app
- Merge last to avoid conflicts with Batch 2 (effect UI) and Batch 5 (features)

## Testing Plan

- \`npm run test:all\`
- Visual regression: check Arrangement, Session, Mixer, Effects views
- Verify tooltips, context menus, and toasts work everywhere

## After ALL Batches

- Run full system test per AGENTS.md Step 9
- Update #1107 as resolved
- Tag release if all green

## Acceptance Criteria

- [ ] #1402 merged
- [ ] \`npm run test:all\` passes
- [ ] Full system test passes
- [ ] Total open PRs < 5
BODY
)" \
  "enhancement,priority: P2"

echo ""
echo "=== All 7 issues created! ==="
