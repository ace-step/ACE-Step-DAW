# ACE-Step DAW — Agent Instructions

> This file is automatically loaded by Claude Code. All agents MUST follow AGENTS.md as well.

## Tech Stack

React 19 + TypeScript 5.7 + Vite 6 + Zustand 5 + Tone.js + Tailwind CSS v4

## Commands

```bash
npm run dev          # Start dev server (http://127.0.0.1:5174)
npm test             # Run Vitest unit tests
npm run test:watch   # Run Vitest in watch mode
npm run test:e2e     # Run Playwright E2E tests
npm run test:all     # Run unit + E2E tests
npm run test:coverage # Unit tests with coverage report
npm run build        # TypeScript check + Vite production build
npx tsc --noEmit     # Type check only (no output)
```

## Quality Gates (must ALL pass before any commit)

1. `npx tsc --noEmit` — 0 type errors
2. `npm test` — all unit tests pass
3. `npm run build` — succeeds with 0 errors

## TDD Cycle (mandatory for all code changes)

1. **Red**: Write a failing test that describes the desired behavior
2. **Green**: Write the minimum code to make the test pass
3. **Refactor**: Clean up while keeping tests green
4. **Commit**: `git commit` with conventional commit message

## Autonomous Work Rules

- ALWAYS run `npm test` before AND after code changes
- Every new feature MUST include unit tests (+ E2E test if UI-facing)
- Every bug fix MUST include a regression test that fails without the fix
- If tests fail after your change, fix immediately — never move on with red tests
- Record blockers to `.llm/BLOCKERS.md` and continue with the next task
- After completing a logical unit of work, commit immediately
- Use `@do-todo` agent for individual tasks to keep main context clean
- Use `@tester` agent after each task to run full regression

## When Compacting, Always Preserve

- The full list of modified files and their paths
- Current task from `.llm/todo.md` and its progress
- Test results (which passed, which failed)
- Any blockers recorded in `.llm/BLOCKERS.md`

## Store API (for programmatic testing and E2E)

```js
// Read state
window.__store.getState().project.tracks

// Add track
window.__store.getState().addTrack('stems' | 'sample' | 'sequencer' | 'pianoroll')

// Add MIDI note
window.__store.getState().addMidiNote(clipId, {
  pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8
})

// Toggle sequencer step
window.__store.getState().toggleSequencerStep(trackId, rowId, stepIndex)

// Update project settings
window.__store.getState().updateProjectSettings({ bpm: 140 })
```

## Project Structure

- `src/store/` — Zustand stores (projectStore, transportStore, generationStore, uiStore)
- `src/engine/` — Audio engine (Tone.js wrappers)
- `src/services/` — Business logic (API, generation pipeline, storage)
- `src/components/` — React UI components
- `src/hooks/` — React hooks
- `src/utils/` — Pure utility functions
- `src/types/` — TypeScript interfaces
- `tests/e2e/` — Playwright E2E tests
- `.llm/todo.md` — Agent task list
- `.llm/BLOCKERS.md` — Issues needing human input

## Git Conventions

- Branch: `feat/v0.0.X-xxx`, `fix/v0.0.X-xxx`, `test/v0.0.X-xxx`
- Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Identity: `user.name: ChuxiJ`, `user.email: junmin@acestudio.ai`
- Never push directly to main — always use PR workflow
