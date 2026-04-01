# Autonomous AI Development Workflow

> This file is auto-loaded by Claude Code for ALL sessions and ALL subagents.
> These are non-negotiable rules for autonomous development.

## GitHub Issue-First (BLOCKING)

Before writing ANY code (except pure questions or trivial typos <3 lines):

1. **Check for existing issue** — search GitHub Issues for duplicates first
2. **Create GitHub Issue** — English title AND body, prefix: `feat:`/`fix:`/`docs:`/`refactor:`/`chore:`, include acceptance criteria checklist, label: `bug`/`enhancement`/`docs`/`refactor`
3. **Create branch** from main — `feat/issue-NUMBER` or `fix/issue-NUMBER`
4. **Implement** on that branch with TDD + quality gates
5. **Create PR** with `Closes #NUMBER` in body
6. **Report** issue URL + PR URL to user

## Task Coordination = GitHub Issues (NOT .llm/todo.md)

- `.llm/todo.md` is for **session-local scratch notes only** — never use it for cross-agent coordination
- Use GitHub Issues as the single source of truth for task tracking
- Assign yourself to an issue before starting work (prevents duplicate effort by parallel agents)
- Label with priority: `priority: P0` / `priority: P1` / `priority: P2` / `priority: P3`

## Autonomous Task Acquisition

When no specific task is given:
1. Search open issues: P0 first, then P1, P2
2. Pick the highest priority unassigned issue
3. If no issues exist, spawn discovery agents (`@tester`, `@refactorer`, `@researcher`) to create issues
4. Never start coding without an issue number

## Quality Gates (ALL must pass before commit)

1. `npx tsc --noEmit` — 0 type errors
2. `npm test` — all pass
3. `npm run build` — succeeds
4. UI changes: verify visually via dev server

## Red Lines (absolute prohibitions)

- Never push directly to main — always PR workflow
- Never merge before CI passes
- Never skip tests — TDD is mandatory
- Never self-assess UI quality — run mechanical checks
- Max 3 auto-fix rounds — then flag for human review
- Never write tests that only assert truthiness — assert specific values
