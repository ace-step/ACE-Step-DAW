# ACE-Step DAW — Virtual Development Team

> This file defines the multi-agent team structure. Agents are orchestrated
> via cron jobs and on-demand launches, not a persistent orchestrator.

## Team Roles

### Orchestrator (Cron-Based — Claude Opus on main session)
- **Responsibility**: Strategic oversight, PR review, merge decisions, agent launching
- **How it runs**: CEO Heartbeat cron (every 1 hour) reviews progress and steers
- **Does**: High-level review, launch dev/QA agents when needed, handle founder messages
- **Does NOT**: Execute coding tasks directly (delegates to dev agents)

### Product Manager (Cron Agent)
- **Responsibility**: Merge ready PRs, balance workload, maintain sprint backlog, create Issues
- **How it runs**: PM Brain cron (every 10 min, currently disabled — should be re-enabled)
- **Resumes a persistent session** across ticks (does not cold-start)
- **Output**: Updated `TASK_QUEUE.md`, new GitHub Issues with labels, sprint plans
- **Script**: `scripts/agents/project-manager.sh`

### Developer (On-Demand Agent)
- **Responsibility**: Implement features, fix bugs, write code, run tests
- **How it runs**: Launched by PM or CEO heartbeat via `scripts/agents/launch-dev.sh`
- **Owns the PR until merge**: resumed in the same session for CI failures and review comments
- **Creates**: Branches as `fix/issue-NUMBER`, code changes, tests
- **Model**: Claude Code CLI (in worktree per issue)
- **Rules**: Must follow CLAUDE.md interaction design standards and AGENT_CONTEXT.md SOP

### QA Tester (Cron Agent)
- **Responsibility**: Run user scenario tests, find bugs, create Issues
- **How it runs**: QA Tester cron (every 2 hours) runs `qa-tester.sh full`
- **Output**: Test reports, GitHub Issues for bugs (labeled `priority: P0`, `role: tester`)
- **Script**: `scripts/agents/qa-tester.sh`

### Researcher (On-Demand Agent)
- **Responsibility**: Deep competitive analysis, technical research, architecture decisions
- **How it runs**: Triggered on-demand by PM or orchestrator
- **Output**: Research docs in `docs/research-notes/` or `docs/design/`
- **Script**: `scripts/agents/researcher.sh`
- **Model**: claude-opus-4-6 (needs depth)

### Daily Reporter (Cron Agent)
- **Responsibility**: Summarize daily progress and post to Discord
- **How it runs**: Daily Dev Report cron (7pm PDT daily, isolated session)
- **Output**: Formatted report with PRs merged, tests run, sprint progress

### Additional Roles (scripts available, triggered on-demand)
- **DevOps** (`devops.sh`): Infrastructure and deployment tasks
- **Refactorer** (`refactorer.sh`): Code quality and refactoring
- **Release Manager** (`release-manager.sh`): Release preparation and publishing
- **Product Reviewer** (`product-manager-review.sh`): Product review tasks

## Workflow Pipeline

```
┌─────────┐    ┌──────────┐    ┌───────────┐    ┌──────────┐
│ Product  │───>│ Developer │───>│ QA Tester │───>│  Merge   │
│ Manager  │    │ (owns PR) │    │           │    │ (by PM)  │
│ (sprint +│    │ (code +   │    │ (tests +  │    │          │
│  backlog)│    │  CI loop) │    │  bugs)    │    │          │
└──────────┘    └───────────┘    └──────────┘    └──────────┘
     │               │  ▲               │
     │               │  │ CI/review     │
     │               └──┘  feedback     │
     │                                  │
     └──── Bug reports feed back ───────┘
```

## Coordination Model

1. **Cron-driven, not idle-loop**: Agents wake on schedule, do their work, then exit
2. **PM maintains persistent session**: Context carries across ticks (no cold-start)
3. **Dev agents own PR lifecycle**: Implement → push → wait CI → fix → address reviews → merge
4. **Dev agents resume sessions**: When CI/review results arrive, same session is resumed with full context
5. **CEO heartbeat provides strategic oversight**: Hourly check for stuck agents or direction changes
6. **Max 3 dev agents running simultaneously** (to avoid resource contention)

## Task Assignment Protocol

1. PM reads TASK_QUEUE.md and open GitHub Issues
2. For each ready task, PM launches a dev agent via `launch-dev.sh`
3. Dev agent creates worktree, implements, pushes, creates PR
4. Dev agent is resumed for CI failures and review comments until PR merges
5. QA tester catches regressions and creates new Issues
6. PM picks up new Issues in next tick

## Communication Protocol

- Agents communicate via files and GitHub (Issues, PRs, comments)
- Daily report posts to Discord for human visibility
- Founder's messages are handled by orchestrator (CEO heartbeat session)
- Never block on founder's response — continue working
