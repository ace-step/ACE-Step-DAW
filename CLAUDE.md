# ACE-Step DAW — Agent Instructions

> Automatically loaded by Claude Code. All agents MUST also follow AGENTS.md.
> Detailed references in `.claude/references/` — load on-demand, not by default.

## Tech Stack

React 19 + TypeScript 5.7 + Vite 6 + Zustand 5 + Tone.js + Tailwind CSS v4

## Issue-First Workflow (BLOCKING — do this BEFORE any code)

1. **Create GitHub issue** via `gh issue create` — English title AND body (regardless of conversation language), `feat:`/`fix:`/`docs:`/`refactor:`/`chore:` prefix, acceptance criteria checklist, label: `bug`/`enhancement`/`docs`/`refactor`
2. **Create branch** — `feat/issue-NUMBER` or `fix/issue-NUMBER`
3. **Implement** — TDD cycle + quality gates
4. **Create PR** — `Closes #NUMBER` in body
5. **Report** — issue URL + PR URL to user

**Skip only for**: pure questions, trivial typos (<3 lines), or existing issues. **When in doubt, create the issue.** It takes 10 seconds.

## Autonomous Development Loop

When working autonomously (cron-driven or self-directed), follow this full lifecycle:

### Phase 0: Task Acquisition
1. `gh issue list --state open --label "priority: P0" --limit 10` (then P1, P2) — pick highest priority issue
2. **No issues?** Spawn discovery subagents:
   - `@tester` — full test suite + boundary exploration, file bugs as Issues
   - `@refactorer` — code quality audit + tech debt scan, file Issues
   - `@researcher` — competitive/community feedback research, file improvement Issues
3. Wait for Issues to appear, then continue

### Phase 1: PR Check (before creating new work)
1. Check if issue already has a linked PR: `gh pr list --search "issue:NUMBER"`
2. **Existing PR with `changes_requested`**: checkout that branch, apply requested changes
3. **Existing PR with merge conflicts**: rebase on main and resolve conflicts
4. **No existing PR**: create branch `feat/issue-NUMBER` or `fix/issue-NUMBER`, implement, push, create PR

### Phase 2: QA Verification Loop (max 3 rounds)
```
for round in 1..3:
    run: npx tsc --noEmit + npm test + npm run build
    if all pass → proceed to Phase 3
    else → auto-fix failures, git push, continue loop
if 3 rounds exhausted → label PR "qa-blocked", flag for human review
```

### Phase 3: UI Visual Review (only for UI changes)
1. Start dev server (`npm run dev`)
2. Capture screenshots at desktop (1920), tablet (1024), mobile (390) viewports
3. Review against criteria: visual hierarchy, spacing consistency, color harmony, typography, interaction feedback, dark/light mode, animation smoothness, brand consistency
4. Iterate at least 3 rounds, up to 8 max
5. After each UI refinement, re-run lightweight QA (`npm test` + `npm run build`)
6. If not approved after max rounds → label PR `ui-needs-review`, flag for human

### Phase 4: Code Review Loop (max 3 rounds)
```
for round in 1..3:
    run: /codex review (or /review for PR diff analysis)
    if approved → proceed to Phase 5
    else → apply review fixes, re-run QA, git push, continue loop
if 3 rounds exhausted → flag for human review
```

### Phase 5: Merge Protocol
1. Confirm PR is approved AND QA passed
2. If merge conflicts exist → rebase on main, resolve, push
3. Final gate: `npx tsc --noEmit` + `npm test` + `npm run build`
4. If final gate passes → merge PR, close issue, delete branch
5. If final gate fails → flag for human review

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

- **Done Criteria**: Write checklist in `.llm/todo.md` before coding features touching 3+ files. Include edge cases (non-standard BPMs, undo, keyboard path, scroll offsets). Each item must be verifiable by test, screenshot, or store assertion.
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
- **Own the PR lifecycle**: don't abandon PRs — handle CI failures, review comments, conflicts until merged
- **Max 3 auto-fix rounds**: if tests/build/lint fail 3 times, stop and flag for human review instead of looping forever
- **UI changes require visual proof**: screenshot before/after, check responsive viewports, never merge UI changes without visual verification

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
- **Design Patterns**: `.claude/references/design-patterns.md` — Concrete sizing, color, spacing, typography rules for DAW UI
- **Store API**: `.claude/references/store-api.md` — `window.__store` API, CLI-first mandate, testing standard
- **Skills**: `.claude/references/skills.md` — Recommended Claude Code skills by development step
- **openDAW Patterns**: `.claude/skills/refer_opendaw_design/SKILL.md` — Architecture reference

## gstack

Use `/browse` for **all web browsing**. Never use `mcp__Claude_in_Chrome__*` tools.

Available: `/office-hours`, `/plan-ceo-review`, `/plan-eng-review`, `/plan-design-review`, `/design-consultation`, `/review`, `/ship`, `/browse`, `/qa`, `/qa-only`, `/design-review`, `/setup-browser-cookies`, `/retro`, `/investigate`, `/document-release`, `/codex`, `/careful`, `/freeze`, `/guard`, `/unfreeze`, `/gstack-upgrade`
