# Development Process

> Auto-loaded for all agents. Follow this process for any non-trivial work.

## TDD Cycle (mandatory)

1. **Red**: Write a failing test first
2. **Green**: Minimum code to pass
3. **Refactor**: Clean up, keep tests green
4. **Commit**: Conventional commit message

## Before Coding

- Run `npm test` to establish baseline
- For UI tasks: read `.claude/references/interaction-design.md` AND `.claude/references/design-patterns.md`
- For store/API tasks: read `.claude/references/store-api.md`
- For unfamiliar APIs: use `/quick-research` skill (2-3 searches max)

## After Coding

- Run `npm test` to confirm no regressions
- Run quality gates: `npx tsc --noEmit` + `npm run build`
- Commit immediately after completing a logical unit of work

## Research Triggers

| Trigger | Action |
|---------|--------|
| Unfamiliar API or library | `/quick-research` — search docs + examples |
| 2+ viable approaches | `/brainstorm` — score and select |
| Competitor behavior needed | WebSearch for interaction-detail level info |
| Error after 2 failed attempts | Stop guessing, search the error |

## Competitive Research Depth Standard

- BAD: "Ableton has Group Tracks"
- GOOD: "Ableton Group Track: nestable, shows sub-clip overview when folded, Cmd+Click for multi-select, color applies to all sub-tracks"
