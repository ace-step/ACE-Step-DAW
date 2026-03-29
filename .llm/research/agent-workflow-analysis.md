# ACE-Step DAW — Agent Workflow & CLAUDE.md Architecture Analysis

> Date: 2026-03-29
> Scope: Full audit of agent infrastructure, harness configuration, and development workflow

---

## 1. Current Architecture Overview

### What You Have (Inventory)

| Layer | Components | Status |
|-------|-----------|--------|
| **Harness Config** | `CLAUDE.md` (~400 lines), `AGENTS.md` (~340 lines), `.claude/settings.json`, `AGENT_CONTEXT.md` | Active, some redundancy |
| **Agent Definitions** | 6 agents: `do-todo`, `refactorer`, `researcher`, `tester`, `reviewer`, `product-manager` | Active |
| **Slash Commands** | 7 commands: `research-cycle`, `todo-all`, `full-cycle`, + 4 DAW commands | Active |
| **Shell Scripts** | 14 scripts in `scripts/agents/` (PM, dev launcher, QA, researcher, etc.) | Partially active |
| **Cron Pipeline** | PM Brain (disabled), QA Tester (2h), Daily Report (7pm), CEO Heartbeat (1h) | Partially active |
| **MCP Server** | DAW bridge with 20+ tools (read/write/transport/mixer/generation) | Active |
| **CI/CD** | 4 GitHub Actions: test (blocking), e2e (non-blocking), ops-on-merge, docs | Active |
| **State Files** | `.llm/todo.md`, `TASK_QUEUE.md`, `PIPELINE.md`, `TEAM.md`, `BLOCKERS.md` | Mixed freshness |
| **Quality Gates** | tsc + vitest + build (no ESLint, no Prettier, no pre-commit hooks) | Gaps |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Human (Founder / CEO)                       │
│                    ┌──────────────────┐                          │
│                    │  CEO Heartbeat   │ (hourly cron)            │
│                    └────────┬─────────┘                          │
│                             │ steers                             │
├─────────────────────────────┼───────────────────────────────────┤
│  Orchestration Layer        │                                    │
│  ┌──────────┐  ┌────────────▼──┐  ┌──────────┐                  │
│  │Researcher│  │Product Manager│  │ Refactorer│                  │
│  │(on-demand)│ │ (cron/disabled)│ │(on-demand) │                 │
│  └─────┬────┘  └──────┬────────┘  └─────┬─────┘                 │
│        │              │                  │                        │
│        ▼              ▼                  ▼                        │
│  .llm/research/   GitHub Issues     .llm/todo.md                 │
│                   TASK_QUEUE.md                                   │
├──────────────────────────────────────────────────────────────────┤
│  Execution Layer                                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                       │
│  │ do-todo  │  │launch-dev│  │ QA Tester│  (2h cron)            │
│  │(subagent)│  │(worktree)│  │(worktree) │                      │
│  └────┬─────┘  └────┬─────┘  └─────┬────┘                       │
│       │              │              │                             │
│       ▼              ▼              ▼                             │
│  Local commits    PR + CI loop   Bug issues                      │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│  Validation Layer                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────────┐                   │
│  │ Tester   │  │ Reviewer │  │ GitHub Actions│                   │
│  │(subagent)│  │(subagent)│  │ (CI/CD)       │                   │
│  └──────────┘  └──────────┘  └───────────────┘                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## 2. Strengths (What's Working Well)

### S1: Mature Multi-Agent Separation of Concerns
Each agent has a clear, narrow mandate. The `do-todo` agent does ONE task per invocation. The `researcher` explores ONE topic. This prevents scope creep and keeps context windows focused.

### S2: PR Ownership Lifecycle
`launch-dev.sh` implements a genuine "agent owns PR until merge" pattern with session persistence, CI polling, feedback collection, and up to 5 fix rounds. This is ahead of most teams.

### S3: CLI-First / Agent-Friendly Design Mandate
The `window.__store` API exposure requirement means every feature is testable and operable by agents. This is a force multiplier — it enables agent-driven QA, automated regression testing, and programmatic feature verification.

### S4: DAW-Specific MCP Bridge
The WebSocket-based MCP server provides 20+ domain-specific tools. This is a genuine competitive advantage — agents can compose music, control transport, and manipulate the mixer without browser automation.

### S5: Worktree-Based Isolation
Each dev agent gets its own git worktree. No conflicts between parallel agents. Clean separation.

### S6: Self-Healing Pipeline
QA finds bugs → creates issues → dev picks up → fixes → QA re-tests. The cycle is designed to converge without human intervention.

---

## 3. Weaknesses & Gaps (What Needs Improvement)

### W1: CLAUDE.md Information Overload (Critical)

**Problem**: `CLAUDE.md` is ~400 lines and tries to be everything: tech stack reference, quality gates, TDD instructions, interaction design standards, store API docs, git conventions, skill recommendations, and agent rules. `AGENTS.md` adds another ~340 lines with significant overlap.

**Impact**: Every agent invocation loads 700+ lines of instructions. Most of it is irrelevant to the specific task. This wastes context tokens, dilutes critical instructions, and increases the chance of agents ignoring important rules.

**Evidence**: The "Context Anxiety Checklist" in CLAUDE.md itself acknowledges this is a problem — agents re-read files, add defensive checks, and lose track of modifications.

**Best Practice**: Anthropic's documentation recommends keeping CLAUDE.md concise and focused on the 20% of rules that matter 80% of the time. Detailed references should be in separate files loaded on-demand via skills or agent definitions.

### W2: No Hooks Configuration (High)

**Problem**: `.claude/settings.json` only has permissions. No hooks are configured.

**Impact**: Quality gates (tsc, lint, tests) are only enforced by instructions in CLAUDE.md, which agents can forget or skip under context pressure. Hooks would enforce them mechanically.

**Best Practice**: Configure `PreToolCall` and `PostToolCall` hooks for:
- Pre-commit: run `tsc --noEmit` before `git commit`
- Post-edit: run affected tests automatically
- Pre-push: run full quality gate suite

### W3: No Linting or Formatting Enforcement (High)

**Problem**: No ESLint, Prettier, or pre-commit hooks. Code style consistency depends entirely on agent judgment.

**Impact**: As the codebase grows (already 27k+ test lines), inconsistencies accumulate. TypeScript strict mode catches type errors but not style issues, unused imports (noUnusedLocals is `false`!), or common anti-patterns.

**Best Practice**: Add Biome (fast, zero-config alternative to ESLint+Prettier) as a quality gate.

### W4: Stale State Files (Medium)

**Problem**: `.llm/todo.md` has items from an old sprint. `TASK_QUEUE.md` references Sprint 1/2 features that may be complete. `PIPELINE.md` says PM Brain "should be re-enabled" — suggesting it's been disabled for a while.

**Impact**: Agents reading stale state files make wrong prioritization decisions. The PM agent especially depends on fresh `TASK_QUEUE.md`.

### W5: Redundant Instruction Sources (Medium)

**Problem**: The same rules appear in multiple places:
- Quality gates: `CLAUDE.md` + `AGENTS.md` + `AGENT_CONTEXT.md` + individual agent `.md` files
- Git conventions: `CLAUDE.md` + `AGENTS.md` + `AGENT_CONTEXT.md`
- Store API: `CLAUDE.md` + `AGENTS.md`
- TDD cycle: `CLAUDE.md` + `AGENTS.md` + `do-todo.md`

**Impact**: When you update a rule, you must update it in 3-5 places. Drift is inevitable. Agents may receive conflicting instructions.

### W6: No Structured Feedback Loop from Production (Medium)

**Problem**: The research cycle discovers work from competitive analysis. But there's no structured mechanism to capture:
- User feedback / bug reports from real users
- Performance metrics from production
- Error logs that auto-create issues

### W7: PM Agent Disabled + Decision Memory is Fragile (Medium)

**Problem**: The PM agent is disabled. When it runs, its decision memory is a flat text file (`decisions.log`) trimmed to 200 lines. No structured state.

**Impact**: Without the PM agent, there's no automated work dispatching. The pipeline depends on manual triggers or CEO heartbeat (hourly — too infrequent for a fast development pace).

### W8: No Agent Performance Metrics (Low)

**Problem**: No tracking of:
- How many fix rounds each PR takes
- Which agents produce the most test failures
- Average time from issue creation to merge
- Context window utilization per agent

---

## 4. Recommendations (Prioritized)

### R1: Restructure CLAUDE.md into Layered Configuration (P0)

**Current**: One monolithic CLAUDE.md + one monolithic AGENTS.md

**Proposed Architecture**:

```
CLAUDE.md                          # ≤100 lines — ONLY the critical rules
├── Tech stack (1 line)
├── Quality gates (4 commands)
├── TDD cycle (3 lines)
├── Git conventions (3 lines)
├── "Read AGENTS.md for full process"
└── "Read .claude/references/ for design standards"

.claude/references/
├── interaction-design.md          # Extracted from CLAUDE.md "DAW Interaction Design Standards"
├── store-api.md                   # Extracted from CLAUDE.md "Store API"
├── agent-rules.md                 # Extracted from AGENTS.md agent-specific rules
└── competitive-research-index.md  # Extracted from AGENTS.md

.claude/agents/
├── do-todo.md                     # Already good — keeps its own context
├── researcher.md                  # Add: "Read .claude/references/competitive-research-index.md"
├── reviewer.md                    # Add: "Read .claude/references/interaction-design.md"
└── ...
```

**Why**: Each agent only loads what it needs. Main CLAUDE.md stays fast to parse. References are loaded on-demand by skills and agent definitions that need them.

**Rule of Thumb**: If a section of CLAUDE.md is only relevant to one agent type, move it to that agent's definition or a reference file.

### R2: Add Hooks for Mechanical Quality Enforcement (P0)

Add to `.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolCall": [
      {
        "matcher": "Bash(git commit*)",
        "command": "npx tsc --noEmit 2>&1 | head -20",
        "description": "Type-check before commit"
      }
    ],
    "PostToolCall": [
      {
        "matcher": "Edit|Write",
        "command": "npx tsc --noEmit --pretty false 2>&1 | grep -c 'error TS' || true",
        "description": "Quick type-check after file edits"
      }
    ]
  }
}
```

**Why**: Hooks are mechanical — they run regardless of context pressure, token limits, or agent forgetfulness. They're the harness equivalent of CI, but local and immediate.

### R3: Add Biome for Linting + Formatting (P1)

```bash
npm install --save-dev @biomejs/biome
npx biome init
```

Add to quality gates: `npx biome check src/` before every commit.

**Why**: Biome is ~100x faster than ESLint+Prettier. One tool, zero config needed. Catches unused imports, console.log, formatting inconsistencies. Pairs well with hooks (R2).

### R4: Enable Structured Auto-Research Cycle (P1)

Currently `/research-cycle` must be manually invoked. Implement as a scheduled trigger:

```json
{
  "name": "auto-research",
  "schedule": "0 9 * * 1",
  "prompt": "/research-cycle",
  "description": "Weekly competitive research on Monday mornings"
}
```

Combined with re-enabling the PM agent (at 30-min intervals, not 10-min to save costs), this creates a continuous discovery → planning → implementation → validation loop.

**Full Autonomous Loop**:
```
Weekly:  @researcher → .llm/research/ → new user stories
Daily:   @product-manager → prioritize → create GitHub issues
Hourly:  @ceo-heartbeat → launch dev agents for top issues
On-push: CI → test → @qa-tester → bug issues → dev agents fix
```

### R5: Consolidate Redundant Instructions (P1)

Create a single source of truth for each rule category:

| Category | Single Source | Referenced By |
|----------|-------------|--------------|
| Quality Gates | `CLAUDE.md` (kept) | All agents via CLAUDE.md auto-load |
| Git Conventions | `CLAUDE.md` (kept) | All agents via CLAUDE.md auto-load |
| Interaction Design | `.claude/references/interaction-design.md` | `reviewer.md`, `do-todo.md` (explicit reference) |
| Store API | `.claude/references/store-api.md` | `tester.md`, E2E tests |
| Dev Process (9-step) | `AGENTS.md` (kept, trimmed) | `launch-dev.sh` → `AGENT_CONTEXT.md` |
| Competitive Research | `.claude/references/research-index.md` | `researcher.md` |

Delete duplicate paragraphs in `AGENT_CONTEXT.md` — it should be a 10-line pointer to `CLAUDE.md` and `AGENTS.md`, not a restatement.

### R6: Add Agent Performance Dashboard (P2)

Create `scripts/agents/metrics.sh` that extracts from git log and GitHub API:

```
PR Lifecycle:
  - Avg rounds to merge: 2.3
  - Avg time issue→merge: 4.2 hours
  - PRs blocked >5 rounds: 2 (PR #470, #460)

Agent Quality:
  - First-pass CI success rate: 67%
  - Copilot review approval rate: 45%
  - Test regression rate: 3%

Context Efficiency:
  - Avg session length (tokens): ~80k
  - Session resumption success rate: 85%
```

Feed this into the Daily Report. Use it to tune agent prompts — e.g., if first-pass CI success is low, the `AGENT_CONTEXT.md` prompt needs more emphasis on pre-push testing.

### R7: Structured State Files with Schema (P2)

Replace free-form markdown state files with structured YAML/JSON that agents can parse reliably:

```yaml
# .llm/sprint.yaml
sprint: 3
started: 2026-03-25
goals:
  - id: S3-G1
    title: "Recording engine wired to UI"
    status: in_progress
    issue: 1104
    assignee: claude-dev
tasks:
  - id: S3-T1
    title: "Arm button in TrackHeader"
    status: pending
    depends_on: []
    priority: P0
```

**Why**: Markdown todo lists are ambiguous. Agents parsing `- [ ] some task` have to guess context. Structured data eliminates parsing errors and enables metrics extraction.

### R8: Session Start Hook for Fresh Agents (P2)

Add a `SessionStart` hook that:
1. Runs `git fetch origin main` (keep branch current)
2. Reads `.llm/sprint.yaml` and displays current sprint status
3. Checks for stale worktrees and warns
4. Validates that quality gates pass on current state

This ensures every new agent session starts with accurate state, not stale assumptions.

---

## 5. Best Practices Comparison

### vs. Anthropic's Recommended Harness Engineering

| Practice | Anthropic Recommends | ACE-Step DAW Status |
|----------|---------------------|-------------------|
| Concise CLAUDE.md | ≤100 lines, critical rules only | **Gap**: ~400 lines |
| Hooks for enforcement | Pre/PostToolCall hooks | **Gap**: No hooks configured |
| Agent definitions for specialization | Narrow, focused agents | **Good**: 6 specialized agents |
| Skills for on-demand knowledge | Load references via skills | **Partial**: 1 skill (openDAW), more needed |
| Settings.json permissions | Whitelist-based | **Good**: Configured |

### vs. Best-in-Class Autonomous Agent Workflows

| Practice | Industry Best | ACE-Step DAW Status |
|----------|-------------|-------------------|
| Continuous research loop | Auto-scheduled, topic rotation | **Partial**: Manual `/research-cycle` |
| Structured task queue | YAML/JSON with dependencies | **Gap**: Free-form markdown |
| PR ownership lifecycle | Agent owns PR through merge | **Good**: `launch-dev.sh` |
| Feedback collection | CI + reviews + user reports | **Partial**: CI + reviews only |
| Performance metrics | Dashboard with trend tracking | **Gap**: No metrics |
| Context management | Compaction + session resume | **Partial**: Session files, stale detection |
| Multi-model routing | Route by task complexity | **Good**: Claude for P0, Codex for P1+ |

---

## 6. Implementation Priority Matrix

```
                    High Impact
                        │
     ┌──────────────────┼──────────────────┐
     │                  │                  │
     │  R1: Restructure │  R2: Add Hooks   │
     │  CLAUDE.md       │                  │
     │                  │  R4: Auto-Research│
     │  R5: Consolidate │  Schedule        │
     │  Redundancy      │                  │
     │                  │                  │
Low ─┼──────────────────┼──────────────────┼─ High
Effort│                 │                  │  Effort
     │  R3: Add Biome  │  R7: Structured  │
     │                  │  State Files     │
     │  R8: Session     │                  │
     │  Start Hook      │  R6: Metrics     │
     │                  │  Dashboard       │
     │                  │                  │
     └──────────────────┼──────────────────┘
                        │
                    Low Impact
```

**Recommended execution order**: R1 → R2 → R5 → R3 → R4 → R8 → R7 → R6

---

## 7. Quick Wins (Can Be Done Today)

1. **Enable `noUnusedLocals: true`** in `tsconfig.json` — catches dead code with zero effort
2. **Add a `PreToolCall` hook** for `git commit` that runs `tsc --noEmit` — prevents broken commits
3. **Trim CLAUDE.md** by moving "DAW Interaction Design Standards" section (~100 lines) to `.claude/references/interaction-design.md`
4. **Re-enable PM agent** at 30-min interval (not 10-min) — restarts the autonomous work dispatch loop
5. **Update `.llm/todo.md`** — mark completed items, archive old sprint tasks, set current sprint context
