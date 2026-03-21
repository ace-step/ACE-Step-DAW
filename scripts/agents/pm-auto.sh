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

log "State: Claude=$CC_COUNT Codex≈$CX_AGENTS"

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
# Step 4: DISPATCH NEW AGENTS
# ═══════════════════════════════════════════

# Recalculate after merges/recoveries
CC_COUNT=$(ps aux | grep -E 'claude.*(--print|bypassPermissions|dangerously)' | grep -v grep | wc -l | tr -d ' ')
CX_COUNT=$(ps aux | grep 'codex' | grep -v grep | grep -v 'pm-auto\|project-manager' | wc -l | tr -d ' ')
CX_AGENTS=$(( CX_COUNT / 3 ))

# Get open issues not already being worked
OPEN_ISSUES=$(gh issue list --repo "$REPO" --state open --limit 50 \
  --json number,labels \
  --jq '.[] | "\(.number)\t\([.labels[].name] | join(","))"' 2>/dev/null)

while IFS=$'\t' read -r ISSUE_NUM LABELS; do
  [ -z "$ISSUE_NUM" ] && continue
  
  # Skip if already has a worktree (agent working or stale — stale handled above)
  [ -d "/tmp/daw-worktrees/agent-$ISSUE_NUM" ] && continue
  
  # Skip if already has an open PR
  BRANCH="fix/issue-$ISSUE_NUM"
  HAS_PR=$(gh pr list --repo "$REPO" --head "$BRANCH" --state open --json number -q '.[0].number' 2>/dev/null)
  [ -n "$HAS_PR" ] && continue

  # Determine tool by priority
  TOOL="codex"
  if echo "$LABELS" | grep -q 'P0'; then
    if [ "$CC_COUNT" -lt "$MAX_CLAUDE" ]; then
      TOOL="claude"
    fi
  fi

  # Check capacity
  if [ "$TOOL" = "claude" ] && [ "$CC_COUNT" -ge "$MAX_CLAUDE" ]; then
    TOOL="codex"  # Fallback to codex if claude is full
  fi
  if [ "$TOOL" = "codex" ] && [ "$CX_AGENTS" -ge "$MAX_CODEX" ]; then
    log "All slots full (Claude=$CC_COUNT/$MAX_CLAUDE, Codex≈$CX_AGENTS/$MAX_CODEX) — stopping dispatch"
    break
  fi

  # Launch
  log "Dispatching #$ISSUE_NUM via $TOOL (labels: $LABELS)"
  nohup bash scripts/agents/launch-dev.sh "$ISSUE_NUM" "$TOOL" >> "$LOG" 2>&1 &
  sleep 3

  # Update counts
  if [ "$TOOL" = "claude" ]; then
    CC_COUNT=$((CC_COUNT + 1))
  else
    CX_AGENTS=$((CX_AGENTS + 1))
  fi

done <<< "$OPEN_ISSUES"

log "PM-auto tick complete: Claude=$CC_COUNT Codex≈$CX_AGENTS"

# Trim log
if [ -f "$LOG" ]; then
  tail -500 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi
