# Quality Audit Skill

> Systematic quality assessment across engineering robustness, UI/UX aesthetics, and feature completeness.
> Use this skill before releases, after sprints, or when quality needs a health check.

## When to Use

- Before any release (mandatory)
- After completing a sprint of work
- When user reports quality issues
- Periodically (every 5 versions)

## Three-Dimensional Quality Assessment

### Dimension 1: Engineering Robustness

**Automated Checks** (run these first):
```bash
npx tsc --noEmit                    # Type safety
npm test                             # Unit test suite
npm run build                        # Build integrity
npx tsc --noEmit --noUnusedLocals 2>&1 | head -20  # Dead code indicator
```

**Manual Review Checklist**:
- [ ] **Error boundaries**: Every lazy-loaded component has an error boundary
- [ ] **No silent failures**: All catch blocks either re-throw, toast, or log meaningfully
- [ ] **Undo coverage**: Every state mutation goes through `_pushHistory()`
- [ ] **Memory leaks**: All `useEffect` cleanup functions properly dispose subscriptions, timers, and event listeners
- [ ] **Race conditions**: Async operations use abort controllers or check mounted state
- [ ] **Audio stability**: `AudioContext` lifecycle is managed (suspend/resume, no orphaned nodes)
- [ ] **Store integrity**: No direct state mutation — all changes via Zustand actions
- [ ] **Type safety**: Search for `as any`, `// @ts-ignore`, `// @ts-expect-error` — each must have justification
- [ ] **Test quality**: No `toBeTruthy`/`toBeDefined` — assertions test specific values
- [ ] **E2E coverage**: Every user-facing feature has at least one Playwright spec

**Scoring** (0-10):
- 10: All checks pass, full test coverage, zero type workarounds
- 7-9: Minor gaps (missing E2E for some features, a few `as any`)
- 4-6: Significant gaps (no E2E for major flows, silent failures)
- 0-3: Critical issues (build warnings, failing tests, memory leaks)

### Dimension 2: UI/UX Aesthetics & Interaction Quality

**Reference**: `.claude/references/interaction-design.md`

**Visual Quality Checklist**:
- [ ] **Color consistency**: Track colors from palette, state indicators match conventions (green=active, red=error, yellow=warning, blue=selected)
- [ ] **Dark theme**: No bright spots, no unreadable text, consistent surface hierarchy
- [ ] **WCAG AA contrast**: All text meets 4.5:1 ratio against backgrounds
- [ ] **Color-blind safe**: No information conveyed by color alone
- [ ] **Spacing rhythm**: Consistent use of spacing scale (4px grid)
- [ ] **Typography hierarchy**: Clear visual hierarchy (headers, labels, values, secondary text)
- [ ] **Loading states**: All async operations show progress (spinner, skeleton, progress bar)
- [ ] **Empty states**: Meaningful messages and CTAs when no data exists

**Interaction Quality Checklist**:
- [ ] **< 100ms feedback**: Every click, drag start, and hover has immediate visual response
- [ ] **< 16ms audio params**: Volume/pan/effect changes update within one animation frame
- [ ] **Keyboard-first**: Every mouse action has keyboard equivalent
- [ ] **Drag feedback**: Ghost preview at snap position, valid/invalid zone indicators
- [ ] **Double-click reset**: All knobs/sliders reset to default on double-click
- [ ] **Right-click precision**: Context menus on knobs/faders for exact value entry
- [ ] **Undo works everywhere**: Ctrl+Z reverses any action
- [ ] **Progressive disclosure**: Advanced features behind toggles/menus, not cluttering default view
- [ ] **Toast notifications**: Success auto-dismiss 3s, errors persist until dismissed

**Scoring** (0-10):
- 10: Comparable to Ableton/Logic in polish, all interactions feel native
- 7-9: Good overall, minor interaction gaps (some missing keyboard shortcuts)
- 4-6: Functional but rough (inconsistent feedback, missing empty states)
- 0-3: Significant UX debt (broken interactions, no keyboard support)

### Dimension 3: Feature Completeness (vs. Competitors)

**Core DAW Features** (compare against Ableton Live 12):
- [ ] **Transport**: Play, stop, loop, BPM, time signature, metronome
- [ ] **Timeline**: Multi-track arrangement, clip drag/resize, snap to grid
- [ ] **MIDI editing**: Piano roll, note entry, velocity editing, quantize
- [ ] **Audio recording**: Input selection, arm/disarm, monitoring
- [ ] **Mixing**: Volume, pan, solo, mute, effects sends, master bus
- [ ] **Effects**: Built-in effects chain, wet/dry, bypass
- [ ] **Automation**: Parameter automation curves, draw/edit modes
- [ ] **Export**: WAV/MP3 export, stem export
- [ ] **Project management**: Save, load, auto-save, project templates
- [ ] **Sequencer**: Step sequencer with pattern editing

**AI-Native Features** (unique to ACE-Step):
- [ ] **AI music generation**: Text-to-music via ACE-Step API
- [ ] **BPM detection**: Automatic tempo detection from audio
- [ ] **Chord recognition**: Automatic chord analysis
- [ ] **Agent API**: Full programmatic control via `window.__store`

**Scoring** (0-10):
- 10: Feature parity with competitor core features + unique AI capabilities
- 7-9: Most core features present, some gaps in advanced workflows
- 4-6: Basic DAW functionality works, missing several standard features
- 0-3: Fundamental features missing or broken

## Output Format

```markdown
# Quality Audit Report — [date]

## Scores
| Dimension | Score | Trend |
|-----------|-------|-------|
| Engineering Robustness | X/10 | up/down/stable |
| UI/UX Aesthetics | X/10 | up/down/stable |
| Feature Completeness | X/10 | up/down/stable |
| **Overall** | **X/10** | |

## Critical Issues (fix before next release)
1. [issue description] — [file:line or area]

## Improvement Opportunities (next sprint)
1. [opportunity] — expected impact: [high/medium/low]

## What's Working Well
1. [positive observation]
```

## Generating Action Items

After scoring, create GitHub issues for:
- Any critical issue (score < 4 in any dimension)
- Top 3 improvement opportunities
- Label with: `quality-audit`, plus `engineering`/`ux`/`feature-gap`
