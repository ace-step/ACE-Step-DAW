# ACE-Step DAW — Agent Instructions

> Automatically loaded by Claude Code. All agents MUST also follow AGENTS.md.
> Detailed references in `.claude/references/` — load on-demand, not by default.

## Tech Stack

React 19 + TypeScript 5.7 + Vite 6 + Zustand 5 + Tone.js + Tailwind CSS v4

## Issue-First Workflow (BLOCKING — do this BEFORE any code)

1. **Create GitHub issue** — English title with `feat:`/`fix:`/`docs:`/`refactor:`/`chore:` prefix, acceptance criteria checklist, label: `bug`/`enhancement`/`docs`/`refactor`
2. **Create branch** — `feat/issue-NUMBER` or `fix/issue-NUMBER`
3. **Implement** — TDD cycle + quality gates
4. **Create PR** — `Closes #NUMBER` in body
5. **Report** — issue URL + PR URL to user

**Skip only for**: pure questions, trivial typos (<3 lines), or existing issues. **When in doubt, create the issue.** It takes 10 seconds.

## Commands

```bash
npm run dev          # Dev server (http://127.0.0.1:5174)
npm test             # Vitest unit tests
npm run test:watch   # Vitest in watch mode
npm run test:e2e     # Playwright E2E tests
npm run test:all     # Unit + E2E
npm run test:coverage # Unit tests with coverage report
npm run build        # TypeScript check + Vite build
npx tsc --noEmit     # Type check only
```

## Quality Gates (ALL must pass before any commit)

1. `npx tsc --noEmit` — 0 type errors
2. `npm test` — all unit tests pass
3. `npm run build` — succeeds with 0 errors
4. **UI changes**: verify visually via dev server — never claim it works without seeing it

## TDD Cycle (mandatory)

1. **Red**: Write a failing test
2. **Green**: Minimum code to pass
3. **Refactor**: Clean up, keep tests green
4. **Commit**: Conventional commit message

## Agentic Work Discipline

- **Done Criteria**: Write checklist in `.llm/todo.md` before coding features touching 3+ files. Each item must be verifiable by test, screenshot, or store assertion.
- **External Evaluation**: Never self-assess. Run `@tester` before every commit.
- **Context Anxiety**: If re-reading files, adding defensive checks, duplicating utilities, or skipping tests — STOP and compact.

## Autonomous Work Rules

- Run `npm test` before AND after code changes
- Every new feature MUST include unit tests (+ E2E if UI-facing)
- Every bug fix MUST include a regression test
- Never move on with red tests — fix immediately
- Record blockers to `.llm/BLOCKERS.md`
- Use `@do-todo` for individual tasks, `@tester` after each task
- Never write tests that only assert truthiness — assert specific values
- For interactive features, write adversarial test cases in TDD Red phase (weird BPMs, rapid input, undo immediately after action, drag during playback)
- After completing a logical unit of work, commit immediately

## When Compacting, Preserve

- Modified files list and paths
- Current task from `.llm/todo.md` and progress
- Test results (passed/failed)
- Blockers from `.llm/BLOCKERS.md`

## Project Structure

- `src/store/` — Zustand stores (projectStore, transportStore, generationStore, uiStore)
- `src/engine/` — Audio engine (Tone.js wrappers)
- `src/services/` — Business logic (API, generation pipeline, storage)
- `src/components/` — React UI components
- `src/hooks/` — React hooks
- `src/utils/` — Pure utility functions
- `src/types/` — TypeScript interfaces
- `tests/e2e/` — Playwright E2E tests

## Git Conventions

- Branch: `feat/v0.0.X-xxx`, `fix/v0.0.X-xxx`, `test/v0.0.X-xxx`
- Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Identity: `user.name: ChuxiJ`, `user.email: junmin@acestudio.ai`
- Never push directly to main — always PR workflow
- Never merge before CI passes

## References (load when relevant to your task)

- **Interaction Design**: `.claude/references/interaction-design.md` — UI patterns, drag/drop, keyboard, feedback
- **Store API**: `.claude/references/store-api.md` — `window.__store` API, CLI-first mandate, testing standard
- **Skills**: `.claude/references/skills.md` — Recommended Claude Code skills by development step
- **openDAW Patterns**: `.claude/skills/refer_opendaw_design/SKILL.md` — Architecture reference

## gstack

Use `/browse` for **all web browsing**. Never use `mcp__Claude_in_Chrome__*` tools.

Available: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/review`, `/ship`, `/browse`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`
