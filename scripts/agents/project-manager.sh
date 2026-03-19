#!/bin/bash
# Project Manager — persistent session, resumes each tick with full context
set -e
cd "$(dirname "$0")/../.."
REPO="ace-step/ACE-Step-DAW"
SESSION_FILE="/tmp/pm-session-id"
DECISION_LOG="/tmp/pm-decisions.log"
LOG="/tmp/pm-activity.log"

log() { echo "[$(date)] [PM] $*" >> "$LOG"; }

# ── Gather FULL team status ──

ISSUES=$(gh issue list --repo $REPO --state open --limit 30 \
  --json number,title,labels,assignees \
  --jq '[.[] | {num:.number, title:.title[:50], labels:[.labels[].name], assignees:[.assignees[].login]}]' 2>/dev/null)

PRS=$(gh pr list --repo $REPO --state open --limit 20 \
  --json number,title,isDraft,mergeable,headRefName,statusCheckRollup,reviewDecision \
  --jq '[.[] | {num:.number, title:.title[:40], draft:.isDraft, merge:.mergeable, branch:.headRefName, review:.reviewDecision, checks:[.statusCheckRollup[] | "\(.name):\(.conclusion // "pending")"]}]' 2>/dev/null)

# PRs with failed CI — dev agents should be fixing these
FAILED_PRS=$(gh pr list --repo $REPO --state open --limit 20 \
  --json number,headRefName,statusCheckRollup \
  --jq '[.[] | select(.statusCheckRollup[]?.conclusion == "FAILURE") | {num:.number, branch:.headRefName}]' 2>/dev/null)

# PRs with unresolved review comments
REVIEW_BLOCKED_PRS=$(gh pr list --repo $REPO --state open --limit 20 \
  --json number,reviewDecision \
  --jq '[.[] | select(.reviewDecision == "CHANGES_REQUESTED") | .number]' 2>/dev/null)

# Running agents — WHO is doing WHAT
CC_DETAIL=$(ps aux | grep -E 'claude.*(--print|bypassPermissions|dangerously)' | grep -v grep | awk '{for(i=11;i<=NF;i++) printf "%s ",$i; print ""}' | grep -oE 'issue.#[0-9]+|Issue #[0-9]+|#[0-9]+|issue-[0-9]+' | sort -u | tr '\n' ',' | sed 's/,$//')
CX_DETAIL=$(ps aux | grep 'codex exec' | grep -v grep | awk '{for(i=11;i<=NF;i++) printf "%s ",$i; print ""}' | grep -oE 'issue-[0-9]+|#[0-9]+' | sort -u | tr '\n' ',' | sed 's/,$//')
CC_COUNT=$(ps aux | grep -E 'claude.*(--print|bypassPermissions|dangerously)' | grep -v grep | wc -l | tr -d ' ')
CX_COUNT=$(ps aux | grep 'codex exec' | grep -v grep | wc -l | tr -d ' ')

# Dev agent worktrees — ground truth of what's being worked on
ACTIVE_WORKTREES=$(ls -d /tmp/daw-worktrees/agent-* 2>/dev/null | sed 's|.*/agent-||' | tr '\n' ',' | sed 's/,$//')

# Recent merges
RECENT=$(gh pr list --repo $REPO --state merged --limit 5 \
  --json number,title,mergedAt --jq '[.[] | "\(.number): \(.title[:40])"]' 2>/dev/null)

# Own recent decisions (external memory — survives session loss)
PREV_DECISIONS=""
if [ -f "$DECISION_LOG" ]; then
  PREV_DECISIONS=$(tail -30 "$DECISION_LOG")
fi

# ── Build status payload ──
STATUS_PAYLOAD="═══ TEAM STATUS ($(date '+%H:%M')) ═══

OPEN ISSUES (backlog):
$ISSUES

OPEN PRs (pipeline):
$PRS

CI-FAILED PRs (dev agents are fixing these — do NOT re-assign):
$FAILED_PRS

REVIEW-BLOCKED PRs (dev agents are addressing reviews — do NOT re-assign):
$REVIEW_BLOCKED_PRS

RUNNING AGENTS:
- Claude Code CLI: $CC_COUNT running → working on: $CC_DETAIL
- Codex CLI: $CX_COUNT running → working on: $CX_DETAIL
- Active worktrees (issues being worked): $ACTIVE_WORKTREES
- Max capacity: Claude Code 3, Codex 10

RECENTLY MERGED:
$RECENT

YOUR PREVIOUS DECISIONS (from prior ticks — use this to stay consistent):
$PREV_DECISIONS

═══ YOUR DECISIONS ═══

1. MERGE: For each non-draft PR where ALL checks pass and mergeable=MERGEABLE:
   gh pr merge NUMBER --squash --admin --repo $REPO

2. REBASE: For CONFLICTING PRs, checkout branch, rebase, push.

3. STAFF: Dispatch dev agents for unworked issues via launch-dev.sh:
   bash scripts/agents/launch-dev.sh ISSUE_NUM codex|claude
   CRITICAL RULES:
   - Do NOT assign issues that have a worktree (check ACTIVE_WORKTREES)
   - Do NOT assign issues that have a running agent (check RUNNING AGENTS)
   - Do NOT re-assign CI-failed or review-blocked PRs — the owning dev agent handles those
   - Prefer Codex (cheaper). Only use Claude if Codex >= 10
   - Always use launch-dev.sh, never raw codex exec for dev work

4. BALANCE: If Claude Code >= 3, don't add more. If Codex < 10 and unworked issues exist, add.

5. After all decisions, write a concise summary of EACH action you took.
   This will be saved as memory for your next tick."

# ── Resume or start PM session ──
if [ -f "$SESSION_FILE" ]; then
  SESSION_ID=$(cat "$SESSION_FILE")
  log "Resuming PM session $SESSION_ID"
  codex exec resume "$SESSION_ID" "$STATUS_PAYLOAD" \
    -o /tmp/pm-last-output.txt 2>&1 || true
else
  SESSION_ID=$(uuidgen | tr '[:upper:]' '[:lower:]')
  echo "$SESSION_ID" > "$SESSION_FILE"
  log "Starting new PM session $SESSION_ID"
  codex exec -C "$(pwd)" -s danger-full-access \
    -o /tmp/pm-last-output.txt \
    "You are the Project Manager for ACE-Step DAW. You will be resumed every 5 minutes with fresh team status. Your session persists — you remember prior decisions. Be consistent. Avoid contradicting yourself. Check YOUR PREVIOUS DECISIONS to stay aligned.

$STATUS_PAYLOAD" 2>&1 || true
fi

# ── Save decisions to external memory ──
if [ -f /tmp/pm-last-output.txt ]; then
  {
    echo "--- $(date '+%Y-%m-%d %H:%M') ---"
    tail -20 /tmp/pm-last-output.txt
  } >> "$DECISION_LOG"
  # Trim to last 200 lines to prevent unbounded growth
  tail -200 "$DECISION_LOG" > "$DECISION_LOG.tmp" && mv "$DECISION_LOG.tmp" "$DECISION_LOG"
fi

log "PM tick complete"
