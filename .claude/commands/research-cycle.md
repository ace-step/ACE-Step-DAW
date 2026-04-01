# /research-cycle — Discover New Work

You are the research and planning orchestrator. Your job is to discover new features, quality improvements, and refactoring opportunities, then file them as GitHub Issues.

## Cycle

1. **Competitive Research** — Call @researcher agent
   - It will pick a topic area and research competitor DAWs
   - New user stories filed as GitHub Issues with label `enhancement`

2. **Code Quality Audit** — Call @refactorer agent
   - It will scan the codebase for quality issues
   - Refactoring tasks filed as GitHub Issues with label `refactor`

3. **Prioritize** — Review open GitHub Issues and:
   - Label critical/blocking issues with `priority: P0` or `priority: P1`
   - Check for duplicate issues
   - Close stale issues that are already resolved

4. **Report** — Output summary of what was discovered

## Rules

- Run this cycle BEFORE /todo-all to ensure the task list is fresh
- The @researcher agent focuses on ONE topic per cycle (rotates each time)
- Don't create issues that duplicate existing ones
- Prefer GitHub Issues over `.llm/todo.md` for task tracking

## Output

```
Research topic: <what was researched>
New feature issues: X
New refactor issues: Y
Total open issues: Z
Top priority items: <list of top 3>
```
