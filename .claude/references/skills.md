# Recommended Claude Code Skills

> Install via `npx clawhub@latest install <name> --dir .claude/skills`
> These are recommended but NOT currently installed.

## By Development Step

### Step 1 — Research
- `find-skill` — Search for additional skills on ClawHub

### Step 2 — Planning
- `agile-toolkit` — Sprint planning, backlog management, estimation
- `task-development-workflow` — Task breakdown and dev workflow

### Step 3 — UI/UX Design
- `ui-ux-pro-max` — Visual hierarchy, cognitive load, navigation patterns
- `ui-ux-design` — Mobile-first design, WCAG 2.2, Tailwind + Shadcn
- `ui-audit` — Automated UI audit against UX principles
- `superdesign` — Modern UI best practices
- `distinctive-design-systems` — Design tokens, typography, layered surfaces

### Step 4 — Coding
- `react-expert` — React 18+ component architecture, hooks, performance
- `typescript-mastery` — Advanced TS patterns, branded types, generics
- `zustand-patterns` — Store design, slice factory, persist, testing
- `tailwind-v4-shadcn` — Tailwind v4 + shadcn/ui theming
- `software-architect` — Scalable systems, trade-offs, boundaries
- `clean-code-review` — Naming, functions, structure, anti-patterns

### Step 5 — Code Review
- `clean-code-review` — Pre-edit safety checks, coding standards

### Step 6-7 — Testing & Validation
- `test-master` — Unit, integration, E2E, coverage, performance testing
- `e2e-testing-patterns` — Playwright/Cypress patterns, flaky test elimination
- `happy-hues` — Color palette validation
- `ui-audit` — Accessibility and UX principle verification

### ACE-Step Music Generation
- `acestep` — ACE-Step API for music generation
- `acestep-songwriting` — Lyrics and caption writing guide
- `acestep-lyrics-transcription` — Audio to timestamped lyrics
- `acestep-simplemv` — Music video rendering
- `acestep-thumbnail` — Cover art generation via Gemini

## Skill Combos (load together for common tasks)

| Task | Skills |
|------|--------|
| **New UI Feature** | `react-expert` + `ui-ux-pro-max` + `zustand-patterns` + `tailwind-v4-shadcn` |
| **Code Review** | `clean-code-review` + `typescript-mastery` |
| **E2E Testing** | `e2e-testing-patterns` + `test-master` + `ui-audit` |
| **Design Audit** | `ui-ux-design` + `distinctive-design-systems` + `happy-hues` |
| **AI Music Feature** | `acestep` + `acestep-songwriting` + `software-architect` |
| **Architecture Refactor** | `software-architect` + `zustand-patterns` + `clean-code-review` |

## Quarterly Review

Every 10 versions (v0.0.20, v0.0.30...), review all installed skills:
- Are they still up-to-date?
- Are there newer/better alternatives on ClawHub?
- Run `npx clawhub@latest search <keyword>` to discover new skills.
