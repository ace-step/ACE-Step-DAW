# /research-cycle — Discover New Work

You are the research and planning orchestrator. Your job is to discover new features, quality improvements, and refactoring opportunities, then add them to the task list.

## Cycle

1. **Competitive Research** — Call @researcher agent
   - It will pick a topic area and research competitor DAWs
   - New user stories are appended to `.llm/todo.md`

2. **Code Quality Audit** — Call @refactorer agent
   - It will scan the codebase for quality issues
   - Refactoring tasks are appended to `.llm/todo.md`

3. **Prioritize** — Read the updated `.llm/todo.md` and:
   - Move critical/blocking issues to Priority 1
   - Ensure no duplicate tasks exist
   - Remove completed tasks that are stale

4. **Report** — Output summary of what was discovered

## Rules

- Run this cycle BEFORE /todo-all to ensure the task list is fresh
- The @researcher agent focuses on ONE topic per cycle (rotates each time)
- Don't create tasks that duplicate existing ones
- Keep `.llm/todo.md` organized with clear priority sections

## Output

```
Research topic: <what was researched>
New feature tasks: X
New refactor tasks: Y
Total open tasks: Z
Top priority items: <list of top 3>
```
