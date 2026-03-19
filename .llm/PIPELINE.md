# ACE-Step DAW — Automated Development Pipeline

> This file defines the cron-driven agent pipeline. Each agent runs periodically
> and picks up work from the previous stage.

## Pipeline Flow

```
┌──────────┐  Periodic   ┌──────────┐  Creates   ┌──────────┐  Implements  ┌──────────┐  Validates  ┌──────────┐
│ PM Agent │────────────>│  Issues  │──────────>│ Dev Agent│────────────>│ QA Agent │────────────>│  Merge   │
│(periodic)│  specs/tasks │ (GitHub) │  picks up  │(on-demand)│  runs tests │(periodic) │  if green  │(dev owns)│
└──────────┘             └──────────┘           └──────────┘            └──────────┘           └──────────┘
      ^                                              │  ▲                     │
      │                                              │  │ CI/review loop      │
      │                                              └──┘                     │
      └───────────── Bug reports feed back into PM planning ──────────────────┘
```

## Cron Schedule (actual — from jobs.json)

| Agent | Frequency | Status | What it does |
|-------|-----------|--------|-------------|
| PM Brain | Every 10 min | **DISABLED** — should be re-enabled at 5 min interval | Merge ready PRs, balance workload, maintain sprint |
| QA Tester | Every 2 hours | Enabled | Run user scenario tests, find bugs, create Issues |
| Daily Dev Report | Daily 7pm PDT | Enabled | Summarize progress, metrics, blockers (posts to Discord) |
| CEO Heartbeat | Every 1 hour | Enabled | High-level review: check progress, steer if needed, launch agents if stuck |

## How It Works

### 1. PM Brain (every 10 min — currently disabled)
- Runs `project-manager.sh` which resumes a **persistent session** across ticks
- Merges ready PRs, reviews open Issues, balances dev workload
- Maintains sprint plan and creates new GitHub Issues with labels
- Reads: UX checklist, research reports, bug reports, competitive analysis
- Should be re-enabled at a 5-minute interval for tighter feedback loops

### 2. QA Tester (every 2 hours)
- Runs `qa-tester.sh full` as a background task
- Starts dev server
- Runs Playwright through all core user workflows
- Takes screenshots at each step
- Compares with expected behavior
- Creates GitHub Issues for any bugs found (labeled `priority: P0`, `role: tester`)
- Writes test report to docs/qa/

### 3. Dev Agents (launched on-demand by PM or CEO heartbeat)
- Launched via `launch-dev.sh` which creates a worktree per issue
- **Owns the PR until merge**: after initial implementation, the agent is resumed
  in the same session when CI results or review comments arrive
- Feedback loop: implement → push → wait for CI → fix failures → address review → merge
- Does NOT cold-start each tick — resumes session with full prior context
- Creates branches as `fix/issue-NUMBER` (automated naming convention)
- Runs build + tests before pushing
- Updates Issue status on completion

### 4. Daily Dev Report (7pm PDT)
- Runs daily in an isolated session
- Checks git log for today's commits
- Reads sprint plan and task queue
- Checks build and test status
- Summarizes: PRs merged, issues closed, bugs found, test results
- Posts formatted report to Discord

### 5. CEO Heartbeat (every 1 hour)
- High-level strategic review, not execution
- Checks GitHub Issues (open vs closed), agent progress, strategic direction
- Launches Claude Code CLI agents if something is stuck or off-track
- Replies with brief status or NO_REPLY if everything is fine

## Self-Healing Properties
- QA finds bug → creates Issue → Dev picks it up → fixes → QA re-tests
- If CI fails → Dev agent is resumed in same session → fixes → CI re-runs
- Dev agents own PRs through the full lifecycle (no orphaned PRs)
- CEO heartbeat detects stuck agents and can relaunch
- No human intervention needed for the pipeline to run

## Available Agent Scripts

All scripts live in `scripts/agents/`:
- `project-manager.sh` — PM brain (persistent session)
- `launch-dev.sh` — Launch dev agent for a specific issue (worktree-based)
- `qa-tester.sh` — QA testing (build + Playwright scenarios)
- `researcher.sh` — Deep research on specific topics
- `devops.sh` — DevOps and infrastructure tasks
- `refactorer.sh` — Code refactoring tasks
- `release-manager.sh` — Release management
- `product-manager-review.sh` — Product review tasks
- `ensure-worktree.sh` — Utility for worktree management
