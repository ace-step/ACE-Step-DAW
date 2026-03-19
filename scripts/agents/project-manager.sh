#!/bin/bash
# Project Manager — Dynamic Load Balancer
# Runs on self-hosted runner, triggered by events or scheduled
set -e
cd /Users/junmingong/.openclaw/workspace/acestep-daw
REPO="ace-step/ACE-Step-DAW"

echo "=== Project Manager Check $(date) ==="

# Count current state
OPEN_ISSUES=$(gh issue list --repo $REPO --state open --json number --jq length)
OPEN_PRS=$(gh pr list --repo $REPO --state open --json number --jq length)
RUNNING_CLI=$(ps aux | grep 'claude.*print' | grep -v grep | wc -l | tr -d ' ')

echo "Issues: $OPEN_ISSUES | PRs: $OPEN_PRS | CLI agents: $RUNNING_CLI"

# Dynamic load balancing
if [ "$OPEN_ISSUES" -lt 3 ]; then
  echo "DECISION: Issues low → launching PM + QA to create more"
  ~/.local/bin/claude --print --permission-mode bypassPermissions \
    "You are the Product Manager for ACE-Step DAW. Read docs/design/UX_IMPROVEMENT_CHECKLIST.md and docs/research-notes/. Create 5 new GitHub Issues for features we're missing compared to Ableton/Logic/FL Studio. Use labels: role:developer, priority:P1. Use gh issue create --repo ace-step/ACE-Step-DAW." &
  ~/.local/bin/claude --print --permission-mode bypassPermissions \
    "You are QA for ACE-Step DAW. Run npx playwright test and npm test. For any failures, create a bug issue: gh issue create --repo ace-step/ACE-Step-DAW --title 'bug: ...' --label 'role:developer,priority:P0'" &

elif [ "$OPEN_ISSUES" -gt 8 ] && [ "$RUNNING_CLI" -lt 3 ]; then
  echo "DECISION: Many issues, few devs → launching more developers"
  # Pick top 3 unworked issues
  ISSUES=$(gh issue list --repo $REPO --state open --label "role: developer" --json number,title --jq '.[0:3][] | "\(.number)|\(.title)"')
  echo "$ISSUES" | while IFS='|' read -r NUM TITLE; do
    [ -z "$NUM" ] && continue
    echo "  Launching dev for #$NUM: $TITLE"
    ~/.local/bin/claude --print --permission-mode bypassPermissions \
      "Implement issue #$NUM ($TITLE) in /Users/junmingong/.openclaw/workspace/acestep-daw. git fetch origin && git reset --hard origin/main. Build, test, create PR on fix/issue-$NUM branch. Use git identity ChuxiJ <junmin@acestudio.ai>." &
    sleep 2
  done

elif [ "$OPEN_PRS" -gt 5 ]; then
  echo "DECISION: Many PRs → launching reviewers"
  ~/.local/bin/claude --print --permission-mode bypassPermissions \
    "You are the PR Reviewer for ACE-Step DAW. Review and merge open PRs:
    gh pr list --repo ace-step/ACE-Step-DAW --state open --limit 10
    For each: check CI (gh pr checks), review diff (gh pr diff), merge if green (gh pr merge --squash --admin).
    For conflicts: rebase. For CI failures: fix and push." &

else
  echo "DECISION: Balanced — no action needed"
fi

echo "=== PM Check Done ==="
