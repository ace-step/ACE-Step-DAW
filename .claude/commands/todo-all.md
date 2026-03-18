# /todo-all — Execute All Tasks with TDD

You are the task orchestration loop. Your job is to process every unchecked task in `.llm/todo.md` using the TDD agent pattern.

## Loop

```
REPEAT until no unchecked tasks remain or budget is exhausted:
  1. Read .llm/todo.md
  2. Find the first unchecked task (- [ ])
  3. If no unchecked tasks → STOP and report summary
  4. Call @do-todo agent to execute the task
  5. Call @tester agent to verify all tests still pass
  6. If @tester reports failures:
     a. The failures become new tasks at Priority 1 in .llm/todo.md
     b. Call @do-todo agent to fix the failures
     c. Call @tester agent again to re-verify
  7. /compact if context is getting large (preserve task progress)
  8. Continue to next task
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
