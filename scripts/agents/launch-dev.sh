#!/bin/bash
# Launch a developer agent with full project context
# Usage: bash scripts/agents/launch-dev.sh <issue-number> <worktree-path> <tool: claude|codex>
set -e
ISSUE_NUM=$1
WT=${2:-"/tmp/daw-worktrees/agent-$(date +%s)"}
TOOL=${3:-"claude"}
REPO="ace-step/ACE-Step-DAW"

# Get issue details
TITLE=$(gh issue view $ISSUE_NUM --repo $REPO --json title --jq .title 2>/dev/null)
BODY=$(gh issue view $ISSUE_NUM --repo $REPO --json body --jq .body 2>/dev/null | head -80)
CONTEXT=$(cat /Users/junmingong/.openclaw/workspace/acestep-daw/scripts/agents/AGENT_CONTEXT.md)

# Ensure worktree exists
cd /Users/junmingong/.openclaw/workspace/acestep-daw
if [ ! -d "$WT" ]; then
  git worktree add "$WT" origin/main --detach 2>/dev/null
fi

PROMPT="$CONTEXT

---

IMPLEMENT ISSUE #$ISSUE_NUM: $TITLE

Details: $BODY

STEPS:
1. cd $WT && git fetch origin && git checkout -B fix/issue-$ISSUE_NUM origin/main
2. Read CLAUDE.md for interaction design standards
3. Implement the feature following all standards
4. npm run build && npx vitest run tests/unit/
5. git -c user.name=ChuxiJ -c user.email=junmin@acestudio.ai add -A && git commit -m 'feat: resolve #$ISSUE_NUM — $TITLE'
6. git push origin fix/issue-$ISSUE_NUM --force
7. gh pr create --repo $REPO --title 'feat: #$ISSUE_NUM — $TITLE' --body 'Closes #$ISSUE_NUM' --base main --head fix/issue-$ISSUE_NUM"

if [ "$TOOL" = "codex" ]; then
  codex exec -s danger-full-access "$PROMPT" &
else
  ~/.local/bin/claude --print --permission-mode bypassPermissions --allowedTools 'Edit,Write,Read,Bash' "$PROMPT" &
fi
echo "Launched $TOOL for #$ISSUE_NUM (PID $!)"
