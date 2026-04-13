#!/bin/bash
# PM Auto — Self-contained project manager that runs without LLM
# Pure bash logic: gather state → decide → execute
# Triggered by cron every 5 minutes
set -e
cd "$(dirname "$0")/../.."

REPO="ace-step/ACE-Step-DAW"
PM_DIR=".pm"
LOG="$PM_DIR/activity.log"
mkdir -p "$PM_DIR"

MAX_CODEX=10
MAX_CLAUDE=3

log() { echo "[$(date)] [PM-auto] $*" >> "$LOG"; }

# ── Mutex ──
LOCKDIR="/tmp/pm-auto.lock.d"
if ! mkdir "$LOCKDIR" 2>/dev/null; then
  LOCK_AGE=$(( $(date +%s) - $(stat -f %m "$LOCKDIR" 2>/dev/null || echo 0) ))
  if [ "$LOCK_AGE" -gt 600 ]; then
    rm -rf "$LOCKDIR"
    mkdir "$LOCKDIR" 2>/dev/null || exit 0
  else
    log "Skip — previous tick still running"
    exit 0
  fi
fi
trap 'rm -rf "$LOCKDIR"' EXIT

# ═══════════════════════════════════════════
# Step 1: GATHER STATE
# ═══════════════════════════════════════════

# Count live agents
CC_COUNT=$(ps aux | grep -E 'claude.*(--print|bypassPermissions|dangerously)' | grep -v grep | wc -l | tr -d ' ')
CX_COUNT=$(ps aux | grep 'codex' | grep -v grep | grep -v 'pm-auto\|project-manager' | wc -l | tr -d ' ')
# Approximate: each codex agent uses ~3 processes
CX_AGENTS=$(( CX_COUNT / 3 ))

MULTICA_ONLINE=0
if command -v multica >/dev/null 2>&1 && multica daemon status --output json 2>/dev/null | python3 -c "import sys,json; exit(0 if json.load(sys.stdin).get('status')=='running' else 1)" 2>/dev/null; then
  MULTICA_ONLINE=1
fi

log "State: Claude=$CC_COUNT Codex≈$CX_AGENTS Multica=$([ $MULTICA_ONLINE -eq 1 ] && echo 'online' || echo 'offline')"

# ═══════════════════════════════════════════
# Step 2: RECOVER STALE AGENTS
# ═══════════════════════════════════════════

STALE=$(bash scripts/agents/registry.sh stale 2>/dev/null)
if [ -n "$STALE" ]; then
  while IFS= read -r line; do
    ISSUE_NUM=$(echo "$line" | grep -oE '#[0-9]+' | head -1 | tr -d '#')
    if [ -n "$ISSUE_NUM" ]; then
      log "Recovering stale agent #$ISSUE_NUM"
      nohup bash scripts/agents/launch-dev.sh "$ISSUE_NUM" codex >> "$LOG" 2>&1 &
      sleep 3
    fi
  done <<< "$STALE"
fi

# ═══════════════════════════════════════════
# Step 2.5: CLEANUP — close orphan PRs for already-closed issues
# ═══════════════════════════════════════════

OPEN_PRS=$(gh pr list --repo "$REPO" --state open --json number,headRefName --jq '.[] | "\(.number)\t\(.headRefName)"' 2>/dev/null)
while IFS=$'\t' read -r PR_NUM BRANCH_NAME; do
  [ -z "$PR_NUM" ] && continue
  ISSUE_NUM=$(echo "$BRANCH_NAME" | grep -oE '[0-9]+$')
  [ -z "$ISSUE_NUM" ] && continue
  ISSUE_STATE=$(gh issue view "$ISSUE_NUM" --repo "$REPO" --json state -q '.state' 2>/dev/null)
  if [ "$ISSUE_STATE" = "CLOSED" ]; then
    log "Closing orphan PR #$PR_NUM (issue #$ISSUE_NUM already closed)"
    gh pr close "$PR_NUM" --repo "$REPO" --comment "Auto-closing: issue #$ISSUE_NUM already resolved." 2>/dev/null
    # Kill any zombie agent processes for this issue
    ZOMBIE_PIDS=$(pgrep -f "agent-${ISSUE_NUM}[^0-9]" 2>/dev/null)
    [ -n "$ZOMBIE_PIDS" ] && echo "$ZOMBIE_PIDS" | xargs kill 2>/dev/null && log "Killed zombie agent for #$ISSUE_NUM"
    # Clean worktree
    [ -d "/tmp/daw-worktrees/agent-$ISSUE_NUM" ] && rm -rf "/tmp/daw-worktrees/agent-$ISSUE_NUM"
    bash scripts/agents/registry.sh unregister "$ISSUE_NUM" 2>/dev/null
  fi
done <<< "$OPEN_PRS"

# ═══════════════════════════════════════════
# Step 3: MERGE GREEN PRs
# ═══════════════════════════════════════════

# Find PRs where ALL checks passed
MERGE_READY=$(gh pr list --repo "$REPO" --state open --json number,mergeable,statusCheckRollup \
  --jq '[.[] | select(.mergeable == "MERGEABLE") | select(.statusCheckRollup | length > 0) | select(.statusCheckRollup | all(.conclusion == "SUCCESS")) | .number] | .[]' 2>/dev/null)

for PR_NUM in $MERGE_READY; do
  log "Merging PR #$PR_NUM (all checks green)"
  gh pr merge "$PR_NUM" --squash --admin --repo "$REPO" 2>/dev/null && log "Merged PR #$PR_NUM" || log "Failed to merge PR #$PR_NUM"
  sleep 2
done

# ═══════════════════════════════════════════
# Step 3.5: FIX FAILING PRs via Feedback Runner (native sub-agents)
# ═══════════════════════════════════════════

if [ ! -d "/tmp/feedback-runner.lock.d" ]; then
  FAILING=$(gh pr list --repo "$REPO" --state open --json statusCheckRollup \
    --jq '[.[] | select(.statusCheckRollup | length > 0) | select(.statusCheckRollup | any(.conclusion == "FAILURE" or .conclusion == "ERROR"))] | length' 2>/dev/null)
  if [ "$FAILING" -gt 0 ] 2>/dev/null; then
    nohup bash scripts/agents/feedback-runner.sh 4 >> "$LOG" 2>&1 &
    log "Launched feedback runner for $FAILING failing PRs (PID $!)"
  fi
fi

# ═══════════════════════════════════════════
# Step 4: DISPATCH via Sprint Runner (native sub-agents)
# ═══════════════════════════════════════════

# Step 4a: Multica dispatch for multica-managed issues (if daemon is online)
if [ "$MULTICA_ONLINE" -eq 1 ]; then
  MULTICA_ISSUES=$(gh issue list --repo "$REPO" --state open --label "multica-managed" --json number,title --jq '.[] | "\(.number)\t\(.title)"' 2>/dev/null)
  while IFS=$'\t' read -r ISSUE_NUM TITLE; do
    [ -z "$ISSUE_NUM" ] && continue
    # Skip if already assigned in local registry (outputs "yes" or "no")
    if bash scripts/agents/registry.sh check "$ISSUE_NUM" 2>/dev/null | grep -q "yes"; then
      continue
    fi
    log "Multica dispatch: #$ISSUE_NUM — $TITLE"
    multica issue assign "$ISSUE_NUM" --to "coder-claude" 2>/dev/null && \
      log "Multica dispatched #$ISSUE_NUM" || \
      log "Multica dispatch failed for #$ISSUE_NUM — will fall through to sprint-runner"
  done <<< "$MULTICA_ISSUES"
fi

# Step 4b: Sprint runner for non-multica issues (existing logic, excludes multica-managed)
# Check if sprint runner is already active
if [ -d "/tmp/sprint-runner.lock.d" ]; then
  RUNNER_AGE=$(( $(date +%s) - $(stat -f %m "/tmp/sprint-runner.lock.d" 2>/dev/null || echo 0) ))
  if [ "$RUNNER_AGE" -lt 3600 ]; then
    log "Sprint runner still active (${RUNNER_AGE}s) — skipping dispatch"
  else
    log "Sprint runner stale (${RUNNER_AGE}s) — will relaunch"
    rm -rf "/tmp/sprint-runner.lock.d"
    nohup bash scripts/agents/sprint-runner.sh 6 >> "$LOG" 2>&1 &
    log "Relaunched sprint runner (PID $!)"
  fi
else
  # Check if there are non-multica un-assigned issues
  if [ "$MULTICA_ONLINE" -eq 1 ]; then
    HAS_WORK=$(gh issue list --repo "$REPO" --state open --limit 1 --json number,labels \
      --jq '[.[] | select(.labels | map(.name) | index("multica-managed") | not)] | .[0].number' 2>/dev/null)
  else
    HAS_WORK=$(gh issue list --repo "$REPO" --state open --limit 1 --json number -q '.[0].number' 2>/dev/null)
  fi
  if [ -n "$HAS_WORK" ]; then
    nohup bash scripts/agents/sprint-runner.sh 6 >> "$LOG" 2>&1 &
    log "Launched sprint runner (PID $!)"
  else
    log "No open issues — nothing to dispatch"
  fi
fi

log "PM-auto tick complete"

# Trim log
if [ -f "$LOG" ]; then
  tail -500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
