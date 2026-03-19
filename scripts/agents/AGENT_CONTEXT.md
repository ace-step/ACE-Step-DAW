# ACE-Step DAW — Agent Context (READ THIS FIRST)

You are working on ACE-Step DAW, a browser-based AI-native DAW.
Before writing ANY code, you MUST understand these standards.

## Must-Read Files (in this repo)
1. `CLAUDE.md` — Tech stack, commands, quality gates, TDD cycle, store API, interaction design standards
2. `AGENTS.md` — Development process, PR workflow, competitive research depth, release standards
3. `docs/design/INTERACTION_DESIGN_GUIDE.md` — Full UX/UI design guide (competitive analysis, patterns)
4. `docs/design/UX_IMPROVEMENT_CHECKLIST.md` — Priority checklist of what to build

## Critical Rules
- Every UI action must have a corresponding Zustand store action
- Every feature needs unit tests (vitest) + must pass `npm run build`
- Components must be < 600 lines
- No TypeScript `any` types
- Keyboard shortcuts: check existing in `useKeyboardShortcuts.ts` before adding
- Follow progressive disclosure: default = simple, right-click = advanced
- Visual feedback within 100ms for all interactions
- All drag operations need `data-testid` attributes

## Interaction Design Standards (from CLAUDE.md)
- Timeline: snap to grid by default, Alt = free movement
- Knobs: vertical drag, double-click = reset, right-click = precise input
- Keyboard-first: every mouse action has a keyboard equivalent
- Undo everything: every state change calls `_pushHistory()`
- Color-blind safe: never use color alone to convey meaning

## Code Style
- Git identity: ChuxiJ <junmin@acestudio.ai>
- Branch: fix/issue-NUMBER or feat/issue-NUMBER
- Commit: conventional (feat:/fix:/test:/refactor:)
- PR: title includes "closes #NUMBER"

## Before Submitting
1. `npx tsc --noEmit` — 0 errors
2. `npx vitest run tests/unit/` — all pass
3. `npm run build` — success
