# ACE-Step DAW — Virtual Development Team

> This file defines the multi-agent team structure. The orchestrator (main session)
> manages all agents, assigns tasks, and ensures maximum utilization.

## Team Roles

### 🎯 Orchestrator (Main Agent — Claude Opus)
- **Responsibility**: Task prioritization, agent assignment, PR review, merge decisions
- **Never does**: Long coding tasks alone (delegates to dev agents)
- **Always does**: Quick fixes (<20 lines), PR merges, responding to the founder

### 🔬 Researcher (Subagent)
- **Responsibility**: Deep competitive analysis, technical research, architecture decisions
- **Output**: Research docs in `docs/research-notes/` or `docs/design/`
- **Trigger**: New technology question, competitive gap, architecture decision
- **Model**: claude-opus-4-6 (needs depth)

### 📋 Product Manager (Subagent)
- **Responsibility**: Write feature specs, update UX checklist, prioritize backlog
- **Output**: Updates to `TASK_QUEUE.md`, `UX_IMPROVEMENT_CHECKLIST.md`, feature specs
- **Trigger**: After research completes, after user feedback, weekly planning
- **Model**: claude-opus-4-6 (needs product thinking)

### 💻 Developer (Subagent or Codex)
- **Responsibility**: Implement features, write code, run local tests
- **Output**: Code changes on feature branches, committed and pushed
- **Trigger**: Task assigned from TASK_QUEUE.md
- **Model**: Codex gpt-5.4 (fast, good at coding) or Claude Code
- **Rules**: Must follow CLAUDE.md interaction design standards

### 🧪 Tester (Subagent)
- **Responsibility**: Write tests, run test suites, validate PRs
- **Output**: Test files, test reports, CI status checks
- **Trigger**: After dev completes a feature, before merge
- **Model**: claude-opus-4-6 (needs to understand intent)

### 👁️ Reviewer (GitHub Copilot + Subagent)
- **Responsibility**: Code review, quality checks, bug detection
- **Output**: PR comments, approval/rejection
- **Trigger**: PR created
- **Tools**: GitHub Copilot (auto), plus manual review subagent for critical PRs

## Workflow Pipeline

```
┌─────────┐    ┌──────────┐    ┌───────────┐    ┌──────────┐    ┌──────────┐
│ Research │───>│ Product  │───>│ Developer │───>│ Tester   │───>│ Reviewer │───> Merge
│          │    │ Manager  │    │           │    │          │    │          │
│ (deep    │    │ (spec +  │    │ (code +   │    │ (tests + │    │ (Copilot │
│  analysis│    │  backlog)│    │  branch)  │    │  CI)     │    │  + agent)│
└─────────┘    └──────────┘    └───────────┘    └──────────┘    └──────────┘
     │               │               │               │               │
     └───────────────┴───────────────┴───────────────┴───────────────┘
                              Orchestrator manages all
```

## Parallelization Rules

1. **Max 3 subagents running simultaneously** (to avoid resource contention)
2. **Research + Dev can run in parallel** (different concerns)
3. **Tester runs AFTER dev** (needs code to test)
4. **Reviewer runs AFTER tester** (needs tests passing)
5. **Orchestrator NEVER waits idle** — always has a quick task or is reviewing

## Task Assignment Protocol

1. Orchestrator reads TASK_QUEUE.md
2. For each ready task:
   - Simple (<20 lines): Orchestrator does it directly
   - Medium (20-200 lines): Spawn developer subagent
   - Complex (>200 lines): Spawn developer + tester subagents
   - Research: Spawn researcher subagent
   - Product: Spawn PM subagent
3. Track in-progress tasks in TASK_QUEUE.md
4. When agent completes: review output → merge if good → assign next task

## Communication Protocol

- Subagents write to files (not messages)
- Orchestrator checks completion events
- Founder's messages are handled by orchestrator immediately (quick reply → delegate if needed)
- Never block on founder's response — continue working
