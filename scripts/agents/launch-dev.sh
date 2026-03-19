#!/bin/bash
# Launch a coding agent. Usage: launch-dev.sh <issue> <codex|claude>
ISSUE_NUM=$1
TOOL=${2:-"codex"}
REPO="ace-step/ACE-Step-DAW"
DAW="/Users/junmingong/.openclaw/workspace/acestep-daw"
WT="/tmp/daw-worktrees/agent-$ISSUE_NUM"

# Skip if already running
ps aux | grep -E "claude.*print|node.*codex exec" | grep -v grep | grep -q "issue-$ISSUE_NUM" && echo "SKIP: #$ISSUE_NUM already running" && exit 0

# Get issue info (with timeout)
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
WT="$1"; TOOL="$2"; ISSUE="$3"; REPO="ace-step/ACE-Step-DAW"
cd "$WT" || exit 1
PROMPT=$(cat "$WT/agent-prompt.txt")

if [ "$TOOL" = "codex" ]; then
  codex exec -C "$WT" -s danger-full-access "$PROMPT"
else
  ~/.local/bin/claude --print --permission-mode bypassPermissions "$PROMPT"
fi

# Post-agent: verify + rebase + push + PR
cd "$WT" || exit 0
AHEAD=$(git rev-list origin/main..HEAD --count 2>/dev/null)
[ "$AHEAD" = "0" ] && echo "No commits" && exit 0
npm run build 2>/dev/null || exit 0
git fetch origin main 2>/dev/null
git rebase origin/main 2>/dev/null || { git rebase --abort 2>/dev/null; exit 0; }
git push origin "fix/issue-$ISSUE" --force-with-lease 2>/dev/null || exit 0
gh pr create --repo "$REPO" --title "feat: #$ISSUE" --body "Closes #$ISSUE" --base main --head "fix/issue-$ISSUE" 2>/dev/null
WEOF
chmod +x "$WT/run-agent.sh"

# Launch
nohup bash "$WT/run-agent.sh" "$WT" "$TOOL" "$ISSUE_NUM" > "/tmp/daw-worktrees/agent-$ISSUE_NUM.$TOOL.log" 2>&1 &
echo "$TOOL-$ISSUE_NUM: PID $!"
