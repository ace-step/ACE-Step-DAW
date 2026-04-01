# ACE-Step DAW — Agent Instructions

> Automatically loaded by Claude Code for ALL sessions and subagents.
> Critical rules are in `.claude/rules/` (also auto-loaded).
> Detailed references in `.claude/references/` — load on-demand, not by default.

@AGENTS.md

## Tech Stack

React 19 + TypeScript 5.7 + Vite 6 + Zustand 5 + Tone.js + Tailwind CSS v4

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

## Agentic Work Discipline

- **Done Criteria**: Write acceptance criteria checklist in the GitHub Issue body (or PR description) before coding features touching 3+ files. Include edge cases. Each item must be verifiable by test, screenshot, or store assertion.
- **External Evaluation**: Never self-assess. Run `@tester` before every commit.
- **Context Anxiety**: If re-reading files, adding defensive checks, duplicating utilities, or skipping tests — STOP and compact.
- Use `@do-todo` for individual tasks, `@tester` after each task
- Record blockers to `.llm/BLOCKERS.md`

## When Compacting, Preserve

- Modified files list and paths
- Current GitHub Issue number and progress
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

> Full git rules in `.claude/rules/git-conventions.md` (auto-loaded).

- Branch: `feat/issue-NUMBER`, `fix/issue-NUMBER` (preferred) or `feat/v0.0.X-xxx`
- Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Identity: `user.name: ChuxiJ`, `user.email: junmin@acestudio.ai`

## References (load when relevant to your task)

- **Interaction Design**: `.claude/references/interaction-design.md` — UI patterns, drag/drop, keyboard, feedback
- **Design Patterns**: `.claude/references/design-patterns.md` — Concrete sizing, color, spacing, typography rules for DAW UI
- **Store API**: `.claude/references/store-api.md` — `window.__store` API, CLI-first mandate, testing standard
- **Skills**: `.claude/references/skills.md` — Recommended Claude Code skills by development step
- **openDAW Patterns**: `.claude/skills/refer_opendaw_design/SKILL.md` — Architecture reference

## gstack

Use `/browse` for **all web browsing**. Never use `mcp__Claude_in_Chrome__*` tools.

Available: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/review`, `/ship`, `/browse`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`
