# Harness Engineering Skill

> Best practices for configuring and optimizing the Claude Code harness for maximum agent productivity.
> Use this skill when tuning agent workflows, debugging agent failures, or onboarding new agents.

## When to Use

- Setting up or modifying agent infrastructure
- Diagnosing agent performance issues (too many fix rounds, context overflow, stale state)
- Periodic harness review (every 10 versions)
- After a sprint with high agent failure rates

## Core Principles

### 1. Layered Configuration (Pyramid of Specificity)

```
CLAUDE.md (≤120 lines)           ← Every agent reads this. Critical rules ONLY.
  └── AGENTS.md                   ← Process rules, competitive research, red lines.
      └── .claude/agents/*.md     ← Per-agent instructions. Narrow scope.
          └── .claude/references/ ← On-demand reference docs. Loaded when needed.
              └── .claude/skills/ ← Domain knowledge. Loaded by skill trigger.
```

**Rules**:
- Each layer adds specificity, never repeats the layer above
- If a rule applies to ALL agents, it belongs in CLAUDE.md
- If a rule applies to ONE agent type, it belongs in that agent's definition
- Detailed reference material (API docs, design standards) goes in `.claude/references/`
- Domain knowledge (competitor patterns, architecture guides) goes in `.claude/skills/`

### 2. Mechanical Enforcement > Written Instructions

**Hierarchy of enforcement reliability** (most to least reliable):
1. **CI/CD checks** — Runs on every push, blocks merge. Cannot be bypassed by agents.
2. **Hooks** (PreToolCall/PostToolCall) — Runs mechanically before/after tool calls. Hard to skip.
3. **Agent definition rules** — Read at agent start. Can be forgotten under context pressure.
4. **CLAUDE.md instructions** — Auto-loaded but diluted by other content.
5. **Verbal reminders** — "Don't forget to run tests" — least reliable.

**Best practice**: For any rule that agents repeatedly violate, promote it UP this hierarchy.
- Agents keep committing with type errors? → Add PreToolCall hook on `git commit`.
- Tests being skipped? → Add CI check that blocks merge.
- Agents using `any`? → Add tsconfig strict checks.

### 3. Context Window Management

**Symptoms of context pressure** (agents start doing these):
- Re-reading files already read this session
- Adding defensive checks "just in case"
- Duplicating existing utilities
- Rushing to commit with stubs
- Skipping tests or verification

**Prevention strategies**:
- Keep CLAUDE.md concise (≤120 lines)
- Use subagents (`@do-todo`, `@tester`) for focused tasks
- Each subagent should read ONLY the files it needs
- Agent definitions should reference (not inline) large docs
- Compact regularly — preserve: modified files, task progress, test results, blockers

### 4. State File Hygiene

**State files** (`.llm/todo.md`, `TASK_QUEUE.md`, `PIPELINE.md`, `BLOCKERS.md`):
- Must have a `Last updated: YYYY-MM-DD` header
- Archive completed items — don't let done tasks pile up
- Stale state files cause agents to make wrong decisions
- Review freshness every Monday (or every 5 versions)

**Protocol**:
```
Every Monday or new sprint:
1. Archive completed todo items
2. Update PIPELINE.md cron status
3. Review BLOCKERS.md — resolve or escalate
4. Verify TASK_QUEUE.md reflects current priorities
```

### 5. Agent Specialization

**Good agent design**:
- Each agent has ONE clear job (do-todo = implement one task, tester = run tests)
- Narrow tool access (reviewer doesn't need Write/Edit)
- Explicit output format (structured, parseable)
- References only the files relevant to its job

**Anti-patterns**:
- Agent that "does everything" → split into focused agents
- Agent definition > 100 lines → extract references
- Agent with broad tool access → restrict to what it actually needs

### 6. Feedback Loop Optimization

**Current pipeline**:
```
Researcher → PM → Issues → Dev Agent → PR → CI → QA → Merge
                                          ↑              |
                                          └── fix loop ──┘
```

**Key metrics to track**:
- **First-pass CI success rate**: If < 70%, agent prompts need better pre-push testing emphasis
- **Average fix rounds per PR**: If > 2, quality gates should be stricter or hooks added
- **Agent context utilization**: If sessions regularly hit limits, tasks are too large
- **Stale PR rate**: If PRs sit open > 24h, PM agent isn't running or is disabled

### 7. Hook Configuration Patterns

**Recommended hooks for this project**:

```json
{
  "hooks": {
    "PreToolCall": [
      {
        "matcher": "Bash(git commit*)",
        "hooks": [{
          "type": "command",
          "command": "npx tsc --noEmit 2>&1 | tee /dev/stderr | grep -q 'error TS' && exit 1 || exit 0"
        }]
      }
    ],
    "PostToolCall": [
      {
        "matcher": "Write|Edit",
        "hooks": [{
          "type": "command",
          "command": "echo 'Reminder: run npx tsc --noEmit before committing.'"
        }]
      }
    ]
  }
}
```

**Hook design rules**:
- Hooks must be fast (< 10s) — slow hooks frustrate agents and waste tokens
- Hooks should fail loudly with actionable messages
- Don't duplicate CI checks in hooks — hooks are for fast, local feedback
- Test hooks manually before deploying (make a test commit to verify behavior)

## Audit Checklist

Run this quarterly (every 10 versions) or when agent performance degrades:

- [ ] **CLAUDE.md size**: Is it ≤120 lines? If not, extract to references.
- [ ] **Instruction dedup**: Is any rule stated in more than one file? Consolidate.
- [ ] **Hook coverage**: Are quality gates enforced by hooks, not just instructions?
- [ ] **State freshness**: Do all `.llm/` files have recent `Last updated` dates?
- [ ] **Agent tool access**: Does each agent have minimum necessary tool permissions?
- [ ] **CI reliability**: Are all CI checks green on main? Any flaky tests?
- [ ] **First-pass success rate**: What % of agent PRs pass CI on first push?
- [ ] **Context efficiency**: Are agents hitting context limits? Should tasks be smaller?
- [ ] **Subagent utilization**: Are focused agents being used, or is the main agent doing everything?
- [ ] **Feedback loop speed**: How long from push → CI result → agent fix? Can we speed it up?

## Output Format

```markdown
# Harness Engineering Audit -- [date]

## Configuration Health
| Aspect | Status | Action |
|--------|--------|--------|
| CLAUDE.md size | X lines (target ≤120) | [ok/needs trim] |
| Instruction dedup | [clean/N duplicates] | [ok/consolidate] |
| Hook coverage | [X/Y gates covered] | [ok/add hooks] |
| State freshness | [all current/N stale] | [ok/update] |

## Agent Performance
| Metric | Value | Target | Action |
|--------|-------|--------|--------|
| First-pass CI success | X% | ≥70% | [ok/improve prompts] |
| Avg fix rounds | X | ≤2 | [ok/add hooks] |
| Stale PRs | X | 0 | [ok/check PM agent] |

## Recommendations
1. [recommendation with priority]
```
