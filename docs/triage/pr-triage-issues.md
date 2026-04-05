# PR Triage & Merge Plan — 33 Open PRs

> Generated 2026-04-05. Supersedes #1107 (original triage of 27 PRs).
> Each section below = one GitHub Issue to create.
> Copy each section as an issue body, using the **Title** line as the issue title.

---

## Master Issue

**Title:** `chore: PR Triage & Merge Plan — organize 33 open PRs into 6 themed batches`

**Labels:** `enhancement`, `priority: P0`

### Problem

33 open PRs have accumulated, causing:
- Increasing merge conflicts as branches diverge from main
- Duplicated work (2 pairs of PRs target the same issue)
- Context loss and stale branches
- No clear merge order, blocking subagent follow-up

### Duplicate PRs Identified

| Issue | PR A (older) | PR B (newer) | Recommendation |
|-------|-------------|-------------|----------------|
| #1023 (automation/LFO conflict) | #1440 (4 files, 2 commits) | #1448 (67 files, 8 commits) | **Keep #1448** — far more comprehensive, adds conflict detection UI. Close #1440. |
| #1033 (scene properties) | #1431 (4 files, color+tempo+rename) | #1446 (6 files, color+visual badges) | **Keep #1431** — broader scope (tempo/timeSig override + rename). Close #1446 or cherry-pick visual badge feature into #1431. |

### Dependency Chains

```
#1432 (MIDI capture backend) → #1445 (MIDI capture Session UI) → #1449 (Enhanced Session View)
#1431 (scene properties) → #1446 (visual indicators) → #1449 (follow actions)
#1410 (colors) → #1411 (title bar) → #1412 (layout) → #1413 (width) → #1414 (knobs) → #1417 (visualizations)
```

### Merge Batch Order (6 themes)

| Batch | Theme | Priority | PRs | Rationale |
|-------|-------|----------|-----|-----------|
| 1 | Testing & CI | P0 | 9 PRs | Foundation — increases confidence for all subsequent merges |
| 2 | Effect Device UI Polish | P1 | 11 PRs | Sequential chain of UI refinements, must merge in order |
| 3 | Session View | P1 | 4 PRs | Dependency chain, merge after duplicates resolved |
| 4 | Core Audio/DSP | P1 | 3 PRs | Independent engine features |
| 5 | New Major Features | P2 | 4 PRs | Large standalone features, lower risk |
| 6 | UI Component Polish | P2 | 1 PR | Standalone, merge anytime |

### Testing Strategy

1. **Per-PR**: Each PR already has unit tests. Subagent must run `npm test` + `npx tsc --noEmit` + `npm run build` after rebase.
2. **Per-Batch**: After merging all PRs in a batch, run full `npm run test:all` (unit + E2E).
3. **Integration Gate**: After Batch 2 (Effect UI) and Batch 3 (Session View), run `npm run test:e2e` specifically.
4. **Final Validation**: After all 6 batches merged, run full system test per AGENTS.md Step 9.

### Acceptance Criteria

- [ ] All duplicate PRs resolved (close one from each pair)
- [ ] Each batch merged in order without regressions
- [ ] `npm test` passes after each PR merge
- [ ] `npm run test:all` passes after each batch
- [ ] Total open PRs reduced to < 5
- [ ] No merge conflicts remaining

### Sub-Issues

- [ ] Batch 1: Testing & CI Infrastructure — #BATCH1
- [ ] Batch 2: Effect Device UI Polish — #BATCH2
- [ ] Batch 3: Session View Enhancement — #BATCH3
- [ ] Batch 4: Core Audio/DSP Features — #BATCH4
- [ ] Batch 5: New Major Features — #BATCH5
- [ ] Batch 6: UI Component Polish — #BATCH6

---

## Batch 1: Testing & CI Infrastructure

**Title:** `chore: Batch 1 — merge 9 testing & CI PRs (P0 foundation)`

**Labels:** `enhancement`, `priority: P0`

### Why First

Testing PRs are pure additive (no production code changes beyond test infra). Merging these first:
- Establishes higher test coverage baseline
- Makes subsequent merges safer (more tests catch regressions)
- No conflict risk with feature PRs

### PRs (merge order)

| Order | PR | Title | Files | Tests Added | Strategy |
|-------|-----|-------|-------|-------------|----------|
| 1 | #1427 | Add coverage thresholds to CI pipeline | CI config | CI gates | Merge first — sets baseline |
| 2 | #1428 | Make critical E2E tests blocking in CI | CI config | E2E gates | Merge with #1427 |
| 3 | #1433 | Unit tests for commandPalette search + resolveContextWindow | Test files | Unit tests | Independent, merge anytime |
| 4 | #1434 | Unit tests for focusResolution + sessionLaunchCommit | Test files | Unit tests | Independent |
| 5 | #1435 | Comprehensive unit tests for critical services | Test files | Unit tests | Independent |
| 6 | #1436 | Unit tests for critical hooks | Test files | Unit tests | Independent |
| 7 | #1437 | Unit tests for PluginEngine and RecordingEngine | Test files | Unit tests | Independent |
| 8 | #1447 | Unit tests for 5 critical untested engine files | Test files | Unit tests | Independent |
| 9 | #1438 | Integration test layer with real Zustand stores | Test infra | Integration tests | Merge last — may reference patterns from above |

### Merge Steps (per PR)

```bash
git checkout <pr-branch>
git rebase main        # resolve conflicts if any
npm test               # must pass
npx tsc --noEmit       # 0 errors
npm run build          # succeeds
# merge via PR
```

### Post-Batch Validation

```bash
npm run test:all       # full unit + E2E
npm run test:coverage  # verify thresholds from #1427 are enforced
```

---

## Batch 2: Effect Device UI Polish

**Title:** `chore: Batch 2 — merge 11 effect device UI PRs (P1, sequential chain)`

**Labels:** `enhancement`, `priority: P1`

### Why This Order

These PRs form a sequential UI refinement chain. Each builds on the previous:
colors → title bar → layout → width → knobs → visualizations → LFO.

### Duplicate Resolution

- **Close #1440** in favor of **#1448** (both close #1023, but #1448 is 67 files vs 4, includes conflict detection UI)

### PRs (strict merge order)

| Order | PR | Title | Scope | Notes |
|-------|-----|-------|-------|-------|
| 1 | #1410 | Deduplicate effect colors, add category grouping | Colors | Foundation — color system |
| 2 | #1411 | Redesign effect device title bar (Ableton-inspired) | Title bar | Depends on color system |
| 3 | #1412 | Standardize parameter layout with shared ModeButton | Layout | Shared component |
| 4 | #1413 | Add width tier system, remove scrollable card bodies | Width | Layout refinement |
| 5 | #1414 | Implement 2-tier knob size system | Knobs | Visual hierarchy |
| 6 | #1429 | Decompose EnhancePanel.tsx into focused sub-components | Refactor | Clean up before adding features |
| 7 | #1417 | Convolver IR, Limiter curve, upgraded EQ3 visualizations | Viz | New visual components |
| 8 | #1423 | Limiter knee math — standard centered soft-knee formula | DSP fix | Math correction |
| 9 | #1439 | Synth parameter editing UI | New UI | Standalone but fits theme |
| 10 | ~~#1440~~ | ~~Resolve automation/LFO parameter conflict~~ | — | **CLOSE** — superseded by #1448 |
| 11 | #1441 | Visual LFO waveform preview in effect UI | LFO viz | After #1448 conflict resolution |
| 12 | #1448 | Automation/LFO conflict detection and resolution | LFO+Auto | Comprehensive fix for #1023 |

### Conflict Risk

HIGH — these PRs likely touch overlapping files in `src/components/effects/`. Expect rebase conflicts especially in #1411-#1414 range. Budget extra time for conflict resolution.

### Testing Plan

- After each merge: `npm test` + visual check on `npm run dev`
- After full batch: `npm run test:e2e` (effect UI E2E tests)
- Manual check: open effect devices in browser, verify colors/layout/knobs render correctly

---

## Batch 3: Session View Enhancement

**Title:** `chore: Batch 3 — merge 4 Session View PRs (P1, dependency chain)`

**Labels:** `enhancement`, `priority: P1`

### Duplicate Resolution

- **Close #1446** in favor of **#1431** (both close #1033; #1431 is more comprehensive with tempo/timeSig override + rename)
- If #1446's visual badge feature is unique, cherry-pick it into #1431 before closing

### PRs (strict dependency order)

| Order | PR | Title | Closes | Depends On |
|-------|-----|-------|--------|-----------|
| 1 | #1431 | Scene properties — color, tempo/timeSig override, rename | #1033 | None |
| 2 | ~~#1446~~ | ~~Scene color property, visual override indicators~~ | ~~#1033~~ | **CLOSE** — superseded by #1431 |
| 3 | #1432 | MIDI retroactive capture — session auto-assign + tests | #1034 | None (parallel with #1431) |
| 4 | #1445 | Integrate MIDI retroactive capture into Session View | #1034 | **#1432 must be merged first** |
| 5 | #1449 | Enhanced Session View — follow actions, scene chaining | #1338 | #1431 (scene properties) |

### Dependency Graph

```
#1431 (scene props) ──────────────────→ #1449 (follow actions)
                                            ↑
#1432 (MIDI capture backend) → #1445 (MIDI capture UI) ─┘
```

### Testing Plan

- After #1431: verify scene color picker, tempo override, rename in Session View
- After #1432 + #1445: verify MIDI retroactive capture button appears and works
- After #1449: verify follow actions, scene chaining, and visual feedback
- Full batch: `npm run test:e2e` with Session View focused tests

---

## Batch 4: Core Audio/DSP Features

**Title:** `chore: Batch 4 — merge 3 audio engine PRs (P1, independent)`

**Labels:** `enhancement`, `priority: P1`

### PRs (independent, any order)

| PR | Title | Scope | Tests |
|-----|-------|-------|-------|
| #1420 | Professional time-stretch engine with 5 modes | Audio engine | 6 task checklist |
| #1421 | Pitch correction & vocal tuning engine | Audio engine | New engine tests |
| #1426 | Lazy placeholder count instead of 128-track cap | Performance | Removes hard limit |

### Testing Plan

- Each PR: `npm test` + `npx tsc --noEmit`
- After batch: `npm run test:all`
- Manual: create project with >128 tracks (for #1426), test time-stretch and pitch correction on audio clips

---

## Batch 5: New Major Features

**Title:** `chore: Batch 5 — merge 4 major feature PRs (P2, standalone)`

**Labels:** `enhancement`, `priority: P2`

### PRs (independent, recommended order)

| Order | PR | Title | Scope | Size | Closes |
|-------|-----|-------|-------|------|--------|
| 1 | #1425 | Sound Preview & Audition System | Instruments | 47 files, 25 tests | #1238 |
| 2 | #1444 | AI chord suggestion system (ChordSeqAI ONNX) | AI feature | New engine | — |
| 3 | #1430 | Video Track Support (Epic #1144) Phases 1-5 | Video | 23 files, 71 tests | #1144-#1149 |
| 4 | #1421 | Pitch correction & vocal tuning engine | Audio | New engine | — |

### Risk Assessment

- **#1430 (Video Track)**: Largest PR (23 files, closes 6 issues). Merge carefully, extensive E2E needed.
- **#1444 (AI Chord)**: External ONNX dependency. Verify model loading works in CI.
- **#1425 (Sound Preview)**: 47 files touched — high conflict potential if merged late.

### Testing Plan

- Each PR: full test suite + manual feature walkthrough
- #1430: import video file, verify filmstrip thumbnails, transport sync
- #1444: open chord suggestion panel, verify suggestions generate
- #1425: browse presets, click preview, verify audio plays before applying

---

## Batch 6: UI Component Polish

**Title:** `chore: Batch 6 — merge component polish PR (P2)`

**Labels:** `enhancement`, `priority: P2`

### PRs

| PR | Title | Scope |
|-----|-------|-------|
| #1402 | Component polish — Button, Tooltip, ContextMenu, Toast refinement | 10 tasks, global UI |

### Notes

- Standalone PR touching foundational UI components
- Could cause minor visual changes across the app
- Merge last to avoid conflicts with Batch 2 (effect UI) and Batch 5 (features)

### Testing Plan

- `npm run test:all`
- Visual regression: check all major views (Arrangement, Session, Mixer, Effects) for UI consistency
- Verify tooltips, context menus, and toasts work across all views

---

## Summary: Full Merge Roadmap

```
Week 1: Batch 1 (Testing/CI) — 9 PRs, low risk
         ↓ test:all passes
Week 1: Batch 2 (Effect UI) — 11 PRs, high conflict risk, sequential
         ↓ test:e2e passes
Week 2: Batch 3 (Session View) — 4 PRs, dependency chain
         ↓ test:e2e passes
Week 2: Batch 4 (Audio/DSP) — 3 PRs, independent
         ↓ test:all passes
Week 3: Batch 5 (Major Features) — 4 PRs, large but independent
         ↓ test:all passes
Week 3: Batch 6 (UI Polish) — 1 PR, final cleanup
         ↓ FULL SYSTEM TEST (AGENTS.md Step 9)
```

### PRs to Close (duplicates)

- Close **#1440** → superseded by #1448
- Close **#1446** → superseded by #1431

### After All Batches

- Run full system test per AGENTS.md Step 9
- Update issue #1107 as resolved
- Tag release if all green
