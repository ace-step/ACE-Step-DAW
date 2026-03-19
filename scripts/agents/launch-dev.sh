#!/bin/bash
set -e
ISSUE_NUM=$1
TOOL=${2:-"codex"}
REPO="ace-step/ACE-Step-DAW"
DAW="/Users/junmingong/.openclaw/workspace/acestep-daw"
WT="/tmp/daw-worktrees/agent-$ISSUE_NUM"

TITLE=$(gh issue view $ISSUE_NUM --repo $REPO --json title --jq .title 2>/dev/null)
BODY=$(gh issue view $ISSUE_NUM --repo $REPO --json body --jq .body 2>/dev/null | head -80)

# ── ALWAYS start fresh from latest main ──
# Safe cleanup: only remove if path is under /tmp/daw-worktrees/
if [ -n "$WT" ] && [[ "$WT" == /tmp/daw-worktrees/* ]]; then
  rm -rf "$WT"
fi
cd "$DAW"
git fetch origin main 2>/dev/null
git worktree prune 2>/dev/null
git worktree add "$WT" origin/main --detach 2>/dev/null
cd "$WT"
git checkout -B "fix/issue-$ISSUE_NUM" origin/main 2>/dev/null

CONTEXT=$(cat "$DAW/scripts/agents/AGENT_CONTEXT.md" 2>/dev/null)

PROMPT="$CONTEXT
---
IMPLEMENT ISSUE #$ISSUE_NUM: $TITLE
Details: $BODY

STEPS:
1. You are on branch fix/issue-$ISSUE_NUM based on LATEST origin/main
2. Implement the feature/fix
3. npx tsc --noEmit && npm run build && npx vitest run tests/unit/
4. git -c user.name=ChuxiJ -c user.email=junmin@acestudio.ai add -A && git commit -m 'feat: resolve #$ISSUE_NUM — $TITLE'
5. git push origin fix/issue-$ISSUE_NUM --force
6. gh pr create --repo $REPO --title 'feat: #$ISSUE_NUM — $TITLE' --body 'Closes #$ISSUE_NUM' --base main --head fix/issue-$ISSUE_NUM || true
7. If push conflicts: git fetch origin main && git rebase origin/main && fix && push again"

if [ "$TOOL" = "codex" ]; then
  nohup codex exec -C "$WT" -s danger-full-access "$PROMPT" > "/tmp/daw-worktrees/agent-$ISSUE_NUM.codex.log" 2>&1 &
else
  nohup "$HOME/.local/bin/claude" --print --permission-mode bypassPermissions "$PROMPT" > "/tmp/daw-worktrees/agent-$ISSUE_NUM.claude.log" 2>&1 &
fi
echo "$TOOL-$ISSUE_NUM: PID $!"
