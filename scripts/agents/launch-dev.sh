#!/bin/bash
# Launch a coding agent. Usage: launch-dev.sh <issue> <codex|claude>
ISSUE_NUM=$1
TOOL=${2:-"codex"}
REPO="ace-step/ACE-Step-DAW"
DAW="$(cd "$(dirname "$0")/../.." && pwd)"
WT="/tmp/daw-worktrees/agent-$ISSUE_NUM"
LOCKDIR="/tmp/daw-claude-launch.lock"
MAX_CLAUDE=3

# Cleanup stale worktrees older than 24h
cleanup_stale_worktrees() {
  for wt in /tmp/daw-worktrees/agent-*; do
    [ -d "$wt" ] || continue
    local age=$(( $(date +%s) - $(stat -f %m "$wt" 2>/dev/null || echo 0) ))
    if [ "$age" -gt 86400 ]; then
      local issue_num=$(basename "$wt" | sed 's/agent-//')
      # Only clean if no active process
      if ! pgrep -f "run-agent.sh.*$wt" > /dev/null 2>&1; then
        echo "[$(date)] Cleaning stale worktree: $wt (${age}s old)" >> /tmp/pm-activity.log
        rm -rf "$wt"
        cd "$DAW" && git worktree prune 2>/dev/null
      fi
    fi
  done
}
cleanup_stale_worktrees

# Skip if already running — check for active run-agent.sh process for this exact issue
if pgrep -f "run-agent.sh.*/tmp/daw-worktrees/agent-$ISSUE_NUM " > /dev/null 2>&1; then
  echo "SKIP: #$ISSUE_NUM already running"
  exit 0
fi

# Count ALL running Claude Code CLI processes (match multiple invocation patterns)
count_claude() {
  ps aux | grep -E "claude.*(--print|bypassPermissions|dangerously)" | grep -v grep | wc -l | tr -d " "
}

# Concurrent limit with mkdir-based lock (macOS compatible, atomic)
acquire_lock() {
  local attempts=0
  while [ $attempts -lt 15 ]; do
    if mkdir "$LOCKDIR" 2>/dev/null; then
      trap 'rmdir "$LOCKDIR" 2>/dev/null' EXIT
      return 0
    fi
    sleep 2
    attempts=$((attempts + 1))
  done
  return 1
}

if [ "$TOOL" = "claude" ]; then
  if ! acquire_lock; then
    echo "WARN: Could not acquire Claude launch lock for #$ISSUE_NUM, using Codex" >> /tmp/pm-activity.log
    TOOL="codex"
  else
    CC_COUNT=$(count_claude)
    if [ "$CC_COUNT" -ge "$MAX_CLAUDE" ]; then
      echo "WARN: Claude at capacity ($CC_COUNT/$MAX_CLAUDE), using Codex for #$ISSUE_NUM" >> /tmp/pm-activity.log
      TOOL="codex"
    else
      # Stagger launches: wait 3s between Claude starts to let Anthropic register sessions
      sleep 3
      # Re-check after sleep (another launch-dev.sh may have started one)
      CC_COUNT=$(count_claude)
      if [ "$CC_COUNT" -ge "$MAX_CLAUDE" ]; then
        echo "WARN: Claude filled during wait ($CC_COUNT/$MAX_CLAUDE), using Codex for #$ISSUE_NUM" >> /tmp/pm-activity.log
        TOOL="codex"
      fi
    fi
  fi
fi

TITLE=$(timeout 10 gh issue view $ISSUE_NUM --repo $REPO --json title --jq .title 2>/dev/null || echo "issue $ISSUE_NUM")

# Clean worktree
[ -n "$WT" ] && [[ "$WT" == /tmp/daw-worktrees/* ]] && rm -rf "$WT"

# Create fresh worktree
cd "$DAW"
git fetch origin main 2>/dev/null
git worktree prune 2>/dev/null
git branch -D "fix/issue-$ISSUE_NUM" 2>/dev/null
git worktree add "$WT" origin/main --detach 2>/dev/null || { echo "ERROR: worktree fail #$ISSUE_NUM"; exit 1; }
cd "$WT"
git checkout -B "fix/issue-$ISSUE_NUM" origin/main 2>/dev/null

# Write prompt to file
cat "$DAW/scripts/agents/AGENT_CONTEXT.md" > "$WT/agent-prompt.txt" 2>/dev/null
echo "---" >> "$WT/agent-prompt.txt"
echo "IMPLEMENT ISSUE #$ISSUE_NUM: $TITLE" >> "$WT/agent-prompt.txt"
timeout 10 gh issue view $ISSUE_NUM --repo $REPO --json body --jq .body 2>/dev/null >> "$WT/agent-prompt.txt"
echo "" >> "$WT/agent-prompt.txt"
echo "You are on branch fix/issue-$ISSUE_NUM. Implement, then: npx tsc --noEmit && npm run build && npx vitest run tests/unit/ && git add -A && git commit -m 'feat: resolve #$ISSUE_NUM'. Do NOT push." >> "$WT/agent-prompt.txt"

# Write wrapper
cat > "$WT/run-agent.sh" << 'WEOF'
#!/bin/bash
WT="$1"; TOOL="$2"; ISSUE="$3"; TITLE="$4"; REPO="ace-step/ACE-Step-DAW"
BRANCH="fix/issue-$ISSUE"
MAX_ROUNDS=5          # Max fix iterations before giving up
CI_POLL_INTERVAL=60   # Seconds between CI status checks
CI_POLL_TIMEOUT=900   # Max seconds to wait for CI (15 min)
LOG="/tmp/pm-activity.log"
SESSION_FILE="$WT/.agent-session-id"  # Persist session ID across rounds

log() { echo "[$(date)] [agent-$ISSUE] $*" >> "$LOG"; echo "$*"; }

cd "$WT" || exit 1

# ── Helper: run Claude with session persistence ──
# First call: creates session. Subsequent calls: resume same session.
run_claude() {
  local prompt="$1"
  local session_id
  local retries=0

  while [ $retries -lt 3 ]; do
    local output
    if [ -f "$SESSION_FILE" ]; then
      # Resume existing session — agent has full context of prior work
      session_id=$(cat "$SESSION_FILE")
      log "Resuming Claude session $session_id"
      output=$(~/.local/bin/claude --print --resume "$session_id" \
        --permission-mode bypassPermissions --fallback-model sonnet \
        "$prompt" 2>&1)
    else
      # First run — create a named session with a stable UUID
      session_id=$(uuidgen | tr '[:upper:]' '[:lower:]')
      echo "$session_id" > "$SESSION_FILE"
      log "Starting Claude session $session_id"
      output=$(~/.local/bin/claude --print --session-id "$session_id" \
        --permission-mode bypassPermissions --fallback-model sonnet \
        "$prompt" 2>&1)
    fi

    if echo "$output" | grep -qiE "403.*forbidden|Request not allowed|authentication_failed|500|502|503|overloaded|rate.limit|timeout|ETIMEDOUT|ECONNRESET"; then
      retries=$((retries + 1))
      log "Claude transient error, retry $retries/3"
      sleep $((retries * 15))
    else
      echo "$output"
      return 0
    fi
  done

  log "Claude failed 3x, falling back to Codex"
  # Fallback: start a codex session instead
  rm -f "$SESSION_FILE"
  TOOL="codex"
  run_codex "$prompt"
}

# ── Helper: run Codex with session persistence ──
# First call: creates session. Subsequent calls: resume same session.
run_codex() {
  local prompt="$1"

  if [ -f "$SESSION_FILE" ]; then
    local session_id
    session_id=$(cat "$SESSION_FILE")
    log "Resuming Codex session $session_id"
    codex exec resume "$session_id" "$prompt"
  else
    # First run — capture session ID from codex output
    # Use --json + -o to get structured output with session info
    local output_file="$WT/.codex-output.tmp"
    codex exec -C "$WT" -s danger-full-access \
      -o "$output_file" "$prompt"
    # Codex stores sessions by cwd; use --last for resume
    # Save a marker so we know to use --last next time
    echo "codex-last" > "$SESSION_FILE"
  fi
}

# ── Helper: dispatch to the right tool ──
run_agent() {
  local prompt="$1"
  if [ "$TOOL" = "codex" ]; then
    run_codex "$prompt"
  else
    run_claude "$prompt"
  fi
}

# ── Helper: wait for CI to finish, return conclusion ──
wait_for_ci() {
  local pr_num="$1"
  local elapsed=0
  while [ $elapsed -lt $CI_POLL_TIMEOUT ]; do
    sleep $CI_POLL_INTERVAL
    elapsed=$((elapsed + CI_POLL_INTERVAL))
    local status
    status=$(gh pr checks "$pr_num" --repo "$REPO" 2>/dev/null)
    if echo "$status" | grep -q "pending\|in_progress\|queued"; then
      log "CI still running ($elapsed/${CI_POLL_TIMEOUT}s)..."
      continue
    fi
    if echo "$status" | grep -qi "fail\|error"; then
      echo "failure"
      return 0
    fi
    echo "success"
    return 0
  done
  echo "timeout"
}

# ── Helper: collect all feedback (CI failures + review comments) ──
collect_feedback() {
  local pr_num="$1"
  local feedback=""

  # 1. CI failure logs
  local failed_run
  failed_run=$(gh run list --branch "$BRANCH" --repo "$REPO" --status failure \
    --limit 1 --json databaseId -q '.[0].databaseId' 2>/dev/null)
  if [ -n "$failed_run" ]; then
    local ci_log
    ci_log=$(gh run view "$failed_run" --repo "$REPO" --log-failed 2>/dev/null | tail -80)
    [ -n "$ci_log" ] && feedback+="## CI Failure Log
$ci_log

"
  fi

  # 2. PR review comments (Copilot, humans, any reviewer)
  local review_comments
  review_comments=$(gh api "repos/$REPO/pulls/$pr_num/comments" \
    --jq '.[] | "**\(.user.login)** on `\(.path):\(.line)`:\n\(.body)\n---"' 2>/dev/null)
  [ -n "$review_comments" ] && feedback+="## Code Review Comments (address ALL of these)
$review_comments

"

  # 3. PR reviews requesting changes
  local reviews
  reviews=$(gh api "repos/$REPO/pulls/$pr_num/reviews" \
    --jq '.[] | select(.state != "APPROVED" and .state != "COMMENTED") | "**\(.user.login)** [\(.state)]:\n\(.body)\n---"' 2>/dev/null)
  [ -n "$reviews" ] && feedback+="## Reviews Requesting Changes
$reviews

"

  echo "$feedback"
}

# Detect stale session — if file is older than 2 hours, session is likely dead
if [ -f "$SESSION_FILE" ]; then
  SESSION_AGE=$(( $(date +%s) - $(stat -f %m "$SESSION_FILE" 2>/dev/null || echo 0) ))
  if [ "$SESSION_AGE" -gt 7200 ]; then
    log "Session file is ${SESSION_AGE}s old (>2hr), starting fresh"
    rm -f "$SESSION_FILE"
  fi
fi

# ═══════════════════════════════════════════
# Phase 1: Initial implementation
# ═══════════════════════════════════════════
PROMPT=$(cat "$WT/agent-prompt.txt")
log "Phase 1: initial implementation for #$ISSUE"
run_agent "$PROMPT"

# Post-agent: verify + push + rebase + push + PR
cd "$WT" || exit 0
AHEAD=$(git rev-list origin/main..HEAD --count 2>/dev/null)
[ "$AHEAD" = "0" ] && { log "No commits produced, exiting"; exit 0; }
# Push raw commits first (safety net — work is on remote even if rebase fails)
git push origin "$BRANCH" --force-with-lease 2>/dev/null
# Then rebase for clean history
git fetch origin main 2>/dev/null
git rebase origin/main 2>/dev/null || { git rebase --abort 2>/dev/null; log "Rebase conflict, raw commits preserved on remote"; }
# Push rebased version
git push origin "$BRANCH" --force-with-lease 2>/dev/null || { log "Push failed after rebase"; }

# Create PR (or get existing PR number)
gh pr create --repo "$REPO" --title "feat: #$ISSUE — $TITLE" \
  --body "Closes #$ISSUE" --base main --head "$BRANCH" 2>/dev/null
PR_NUM=$(gh pr list --repo "$REPO" --head "$BRANCH" --json number -q '.[0].number' 2>/dev/null)
[ -z "$PR_NUM" ] && { log "Could not find PR for $BRANCH, exiting"; exit 0; }
log "PR #$PR_NUM created for #$ISSUE"

# ═══════════════════════════════════════════
# Phase 2: Feedback loop — same agent owns PR until merge
# ═══════════════════════════════════════════
ROUND=0
while [ $ROUND -lt $MAX_ROUNDS ]; do
  ROUND=$((ROUND + 1))
  log "Round $ROUND/$MAX_ROUNDS: waiting for CI on PR #$PR_NUM"

  CI_RESULT=$(wait_for_ci "$PR_NUM")
  log "CI result: $CI_RESULT"

  # Check if PR was already merged
  PR_STATE=$(gh pr view "$PR_NUM" --repo "$REPO" --json state -q '.state' 2>/dev/null)
  [ "$PR_STATE" = "MERGED" ] && { log "PR #$PR_NUM merged! Agent done."; exit 0; }

  # If CI passed, wait for review comments to arrive
  if [ "$CI_RESULT" = "success" ]; then
    log "CI green. Waiting 120s for reviews..."
    sleep 120
  fi

  FEEDBACK=$(collect_feedback "$PR_NUM")

  # No feedback + CI green = done
  if [ -z "$FEEDBACK" ] && [ "$CI_RESULT" = "success" ]; then
    log "CI green + no review feedback. PR #$PR_NUM ready to merge."
    exit 0
  fi

  # Build fix prompt — no feedback but CI failed
  if [ -z "$FEEDBACK" ]; then
    FEEDBACK="## CI Failed
CI failed but no detailed logs captured. Run locally:
npx tsc --noEmit && npm test && npm run build
Fix any errors you find."
  fi

  # ── Resume the SAME agent to fix ──
  FIX_PROMPT="Your PR #$PR_NUM has feedback that must be addressed (round $ROUND/$MAX_ROUNDS).

$FEEDBACK

Fix EVERY issue. Run quality gates before committing:
npx tsc --noEmit && npm test && npm run build
Then: git add -A && git commit -m 'fix: address feedback round $ROUND for #$ISSUE'
Do NOT push."

  log "Resuming agent for fix round $ROUND"
  cd "$WT" || exit 0
  run_agent "$FIX_PROMPT"

  # Push the fix
  cd "$WT" || exit 0
  # Push raw commits first (safety net — work is on remote even if rebase fails)
  git push origin "$BRANCH" --force-with-lease 2>/dev/null
  # Then rebase for clean history
  git fetch origin main 2>/dev/null
  git rebase origin/main 2>/dev/null || { git rebase --abort 2>/dev/null; log "Rebase conflict, raw commits preserved on remote"; }
  # Push rebased version
  git push origin "$BRANCH" --force-with-lease 2>/dev/null || { log "Push failed after rebase"; }
  log "Fix pushed (round $ROUND), looping back to wait for CI"
done

log "WARN: PR #$PR_NUM not green after $MAX_ROUNDS rounds. Recording blocker."
echo "- [ ] PR #$PR_NUM (#$ISSUE): failed $MAX_ROUNDS fix rounds — needs human review" >> "$WT/.llm/BLOCKERS.md" 2>/dev/null
git add .llm/BLOCKERS.md 2>/dev/null && git commit -m "chore: record blocker for #$ISSUE" 2>/dev/null
git push origin "$BRANCH" --force-with-lease 2>/dev/null
WEOF
chmod +x "$WT/run-agent.sh"

# Launch
nohup bash "$WT/run-agent.sh" "$WT" "$TOOL" "$ISSUE_NUM" "$TITLE" > "/tmp/daw-worktrees/agent-$ISSUE_NUM.$TOOL.log" 2>&1 &
echo "$TOOL-$ISSUE_NUM: PID $!"
