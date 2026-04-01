# /full-cycle — Complete Autonomous Development Loop

You are the master orchestrator for autonomous, test-driven development of ACE-Step DAW. This command runs indefinitely, cycling through research, implementation, testing, and refactoring.

## The Infinite Loop

```
REPEAT FOREVER:

  ┌─── Phase 1: DISCOVER ───────────────────────────────┐
  │ Run /research-cycle                                  │
  │ → @researcher finds new features from competitors    │
  │ → @refactorer finds code quality issues              │
  │ → New tasks filed as GitHub Issues                   │
  └──────────────────────────────────────────────────────┘
                          ↓
  ┌─── Phase 2: BUILD ──────────────────────────────────┐
  │ Run /todo-all                                        │
  │ → Pick highest-priority open GitHub Issue             │
  │   → @do-todo implements with TDD (red→green→refactor)│
  │   → @tester verifies no regressions                  │
  │   → git commit + push on success                     │
  └──────────────────────────────────────────────────────┘
                          ↓
  ┌─── Phase 3: VALIDATE ───────────────────────────────┐
  │ Call @tester for full regression test                 │
  │ → Generate report to .llm/reports/                   │
  │ → Any failures → new Priority 1 GitHub Issues        │
  └──────────────────────────────────────────────────────┘
                          ↓
  ┌─── Phase 4: MAINTAIN ──────────────────────────────┐
  │ /compact (preserve: files changed, test results,     │
  │           current issue number, blockers)             │
  │ Review .llm/BLOCKERS.md — skip or retry blocked tasks│
  └──────────────────────────────────────────────────────┘
                          ↓
              (back to Phase 1)
```

## Key Principles

1. **TDD is non-negotiable** — Every code change must have tests
2. **Small commits** — Commit after each passing task
3. **Subagent isolation** — Heavy work happens in @do-todo/@tester subagents to keep this orchestrator context clean
4. **Fail gracefully** — Record blockers, skip, continue
5. **Compact regularly** — Prevent context degradation

## Safety Nets

- Git history is the ultimate safety net — can always revert
- `.llm/BLOCKERS.md` captures anything needing human input
- `.llm/reports/` has full test history
- Budget limits prevent runaway spending

## When to Stop

- All open GitHub Issues are resolved AND @researcher finds no new gaps
- Budget limit reached (--max-budget-usd)
- Turn limit reached (--max-turns)
- Human intervention (user stops the process)

In practice, this should run for hours to days, continuously improving the DAW.
