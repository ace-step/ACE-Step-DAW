#!/bin/bash
set -e
ISSUE_NUM=$1
TOOL=${2:-"codex"}
REPO="ace-step/ACE-Step-DAW"
DAW="/Users/junmingong/.openclaw/workspace/acestep-daw"
WT="/tmp/daw-worktrees/agent-$ISSUE_NUM"

TITLE=$(gh issue view $ISSUE_NUM --repo $REPO --json title --jq .title 2>/dev/null)
BODY=$(gh issue view $ISSUE_NUM --repo $REPO --json body --jq .body 2>/dev/null | head -80)

# ── STEP A: Fresh worktree from latest main (BASH enforced, not prompt) ──
if [ -n "$WT" ] && [[ "$WT" == /tmp/daw-worktrees/* ]]; then
  rm -rf "$WT"
fi
cd "$DAW"
git fetch origin main 2>/dev/null
git worktree prune 2>/dev/null
# Delete stale branch if exists
git branch -D "fix/issue-$ISSUE_NUM" 2>/dev/null || true
# Create worktree — if fails, abort with error
git worktree add "$WT" origin/main --detach 2>/dev/null || {
  echo "ERROR: failed to create worktree for #$ISSUE_NUM" >> /tmp/pm-activity.log
  exit 1
}
cd "$WT" || exit 1
git checkout -B "fix/issue-$ISSUE_NUM" origin/main 2>/dev/null || exit 1

CONTEXT=$(cat "$DAW/scripts/agents/AGENT_CONTEXT.md" 2>/dev/null)

# ── STEP B: Agent does the coding (prompt) ──
PROMPT="$CONTEXT
---
IMPLEMENT ISSUE #$ISSUE_NUM: $TITLE
Details: $BODY

You are on branch fix/issue-$ISSUE_NUM based on LATEST origin/main.
Implement the feature/fix. Then:
1. npx tsc --noEmit && npm run build && npx vitest run tests/unit/
2. git add -A && git commit -m 'feat: resolve #$ISSUE_NUM — $TITLE'
3. Done. Do NOT push or create PR — the wrapper script handles that."

# ── STEP C: Wrapper handles push + rebase + PR (BASH enforced) ──
# This runs AFTER the agent exits, guaranteeing rebase happens
WRAPPER="#!/bin/bash
cd $WT

# Run the coding agent
if [ "$TOOL" = 'codex' ]; then
  timeout 1800 codex exec -C $WT -s danger-full-access \"$PROMPT\"
else
  timeout 1800 $HOME/.local/bin/claude --print --permission-mode bypassPermissions \"$PROMPT\"
fi

# ── Safety checks before push ──
cd $WT

# Check: did the agent actually commit anything?
COMMITS_AHEAD=\$(git rev-list origin/main..HEAD --count 2>/dev/null)
if [ "\$COMMITS_AHEAD" = "0" ] || [ -z "\$COMMITS_AHEAD" ]; then
  echo 'SKIP: agent produced no commits, nothing to push'
  exit 0
fi

# Check: does it build?
npm run build 2>/dev/null || {
  echo 'WARN: build failed, skipping push'
  exit 0
}

# Check: did agent write tests? (SOP requires TDD)
NEW_TEST_FILES=$(git diff --name-only origin/main | grep -c 'test\.ts\|spec\.ts' || true)
if [ "$NEW_TEST_FILES" = "0" ]; then
  echo 'NOTE: no new test files — SOP recommends TDD'
fi

# ENFORCED: rebase onto latest main
git fetch origin main 2>/dev/null
git rebase origin/main 2>/dev/null || {
  # Rebase conflict — let it stay, PM will detect and dispatch a fixer
  git rebase --abort 2>/dev/null
  echo 'WARN: rebase conflict, leaving for PM to handle'
  exit 0
}

# ENFORCED: push (force-with-lease to not overwrite others)
git -c user.name=ChuxiJ -c user.email=junmin@acestudio.ai push origin fix/issue-$ISSUE_NUM --force-with-lease 2>/dev/null || {
  echo 'WARN: push failed (force-with-lease rejected)'
  exit 0
}

# ENFORCED: create PR
gh pr create --repo $REPO --title 'feat: #$ISSUE_NUM — $TITLE' --body 'Closes #$ISSUE_NUM' --base main --head fix/issue-$ISSUE_NUM 2>/dev/null || true
"

echo "$WRAPPER" > "$WT/run-agent.sh"
chmod +x "$WT/run-agent.sh"
nohup bash "$WT/run-agent.sh" > "/tmp/daw-worktrees/agent-$ISSUE_NUM.${TOOL}.log" 2>&1 &
echo "$TOOL-$ISSUE_NUM: PID $!"
