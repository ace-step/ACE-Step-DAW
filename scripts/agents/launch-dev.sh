#!/bin/bash
# Launch a coding agent. Usage: launch-dev.sh <issue> <codex|claude>
ISSUE_NUM=$1
TOOL=${2:-"codex"}
REPO="ace-step/ACE-Step-DAW"
DAW="/Users/junmingong/.openclaw/workspace/acestep-daw"
WT="/tmp/daw-worktrees/agent-$ISSUE_NUM"
LOCKDIR="/tmp/daw-claude-launch.lock"
MAX_CLAUDE=3

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
cd "$WT" || exit 1
PROMPT=$(cat "$WT/agent-prompt.txt")

if [ "$TOOL" = "codex" ]; then
  codex exec -C "$WT" -s danger-full-access "$PROMPT"
else
  # Retry loop: if Claude returns 403, wait and retry up to 3 times
  MAX_RETRIES=3
  RETRY=0
  while [ $RETRY -lt $MAX_RETRIES ]; do
    OUTPUT=$(~/.local/bin/claude --print --permission-mode bypassPermissions --fallback-model sonnet "$PROMPT" 2>&1)
    EXIT_CODE=$?
    if echo "$OUTPUT" | grep -qi "403.*forbidden\|Request not allowed\|authentication_failed"; then
      RETRY=$((RETRY + 1))
      WAIT=$((RETRY * 15))
      echo "[$(date)] Claude 403 for #$ISSUE, retry $RETRY/$MAX_RETRIES in ${WAIT}s" >> /tmp/pm-activity.log
      sleep $WAIT
    else
      echo "$OUTPUT"
      break
    fi
  done
  if [ $RETRY -ge $MAX_RETRIES ]; then
    echo "[$(date)] Claude failed $MAX_RETRIES times for #$ISSUE, falling back to Codex" >> /tmp/pm-activity.log
    codex exec -C "$WT" -s danger-full-access "$PROMPT"
  fi
fi

# Post-agent: verify + rebase + push + PR
cd "$WT" || exit 0
AHEAD=$(git rev-list origin/main..HEAD --count 2>/dev/null)
[ "$AHEAD" = "0" ] && echo "No commits" && exit 0
npm run build 2>/dev/null || exit 0
git fetch origin main 2>/dev/null
git rebase origin/main 2>/dev/null || { git rebase --abort 2>/dev/null; exit 0; }
git push origin "fix/issue-$ISSUE" --force-with-lease 2>/dev/null || exit 0
gh pr create --repo "$REPO" --title "feat: #$ISSUE — $TITLE" --body "Closes #$ISSUE" --base main --head "fix/issue-$ISSUE" 2>/dev/null
WEOF
chmod +x "$WT/run-agent.sh"

# Launch
nohup bash "$WT/run-agent.sh" "$WT" "$TOOL" "$ISSUE_NUM" "$TITLE" > "/tmp/daw-worktrees/agent-$ISSUE_NUM.$TOOL.log" 2>&1 &
echo "$TOOL-$ISSUE_NUM: PID $!"
