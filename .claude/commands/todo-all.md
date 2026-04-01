# /todo-all — Execute All Tasks with TDD

You are the task orchestration loop. Your job is to process open GitHub Issues using the TDD agent pattern. Falls back to `.llm/todo.md` if GitHub tools are unavailable.

## Loop

```
REPEAT until no open tasks remain or budget is exhausted:
  1. List open GitHub Issues by priority (P0 → P1 → P2 → P3)
     Fallback: read .llm/todo.md for unchecked tasks
  2. Pick the highest priority unassigned issue
  3. If no open tasks → STOP and report summary
  4. Create branch: feat/issue-NUMBER or fix/issue-NUMBER
  5. Call @do-todo agent to execute the task (pass issue number)
  6. Call @tester agent to verify all tests still pass
  7. If @tester reports failures:
     a. The failures become new Priority 1 GitHub Issues (or .llm/todo.md entries)
     b. Call @do-todo agent to fix the failures
     c. Call @tester agent again to re-verify
  8. Push branch + create PR with `Closes #NUMBER`
  9. /compact if context is getting large (preserve issue number + progress)
  10. Continue to next task
```

## Important Rules

- Each @do-todo call handles exactly ONE task (keeps subagent context clean)
- Always verify with @tester after each task (catch regressions immediately)
- If a task is blocked, @do-todo will record it in .llm/BLOCKERS.md — skip and continue
- Commit after each successful task (small, atomic commits)
- If the same task fails 3 times, mark it as blocked and move on

## Completion Report

When all tasks are processed, output:
```
Tasks completed: X/Y
Tasks blocked: Z
Total commits: N
Test suite: X passed, Y failed
Blockers: <list from .llm/BLOCKERS.md>
```
