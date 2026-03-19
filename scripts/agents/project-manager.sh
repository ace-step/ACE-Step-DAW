#!/bin/bash
# Project Manager — Intelligent Agent Orchestrator
# Runs as a dedicated Claude Code CLI brain, not just a bash script
set -e
cd /Users/junmingong/.openclaw/workspace/acestep-daw
REPO="ace-step/ACE-Step-DAW"

# Gather state
OPEN_ISSUES=$(gh issue list --repo $REPO --state open --json number,title,labels --jq '.')
OPEN_PRS=$(gh pr list --repo $REPO --state open --json number,title,isDraft,mergeable,statusCheckRollup --jq '.')
RECENT_MERGED=$(gh pr list --repo $REPO --state merged --limit 5 --json number,title,mergedAt --jq '.')
RUNNING_CLI=$(ps aux | grep 'claude.*print' | grep -v grep | wc -l | tr -d ' ')

# Launch the PM brain as Claude Code CLI — it makes all decisions
~/.local/bin/claude --print --permission-mode bypassPermissions --allowedTools 'Edit,Write,Read,Bash,WebSearch,WebFetch' \
  "You are the Project Manager for ACE-Step DAW. You are the brain of the entire agent team.

Current state:
- Open issues: $OPEN_ISSUES
- Open PRs: $OPEN_PRS  
- Recently merged: $RECENT_MERGED
- Running CLI agents: $RUNNING_CLI

Your decisions:

1. MERGE ready PRs: For each non-draft PR where all CI checks pass and mergeable=MERGEABLE:
   gh pr merge NUMBER --squash --admin --repo $REPO

2. FIX failing PRs: For PRs with CI failures, checkout the branch, fix errors, push.

3. REBASE conflicting PRs: checkout branch, git rebase origin/main, fix conflicts, push --force-with-lease.

4. CLOSE duplicates: If multiple PRs solve the same issue, keep the best one.

5. BALANCE the team:
   - Count open issues vs running developers
   - If issues > developers * 2: launch more devs (print the commands)
   - If issues < 3: identify features we're missing vs Ableton/Logic, create new issues
   - If PRs waiting review > 3: prioritize reviewing over new development

6. QA direction: Check if recently merged PRs have QA tests. If not, create test issues.

7. Update docs/design/UX_IMPROVEMENT_CHECKLIST.md with completed items.

Make your decisions and execute them. Print a summary."

# Periodic: trigger refactorer (every ~20 PRs merged)
TOTAL_COMMITS=$(git rev-list --count HEAD)
if [ $((TOTAL_COMMITS % 20)) -eq 0 ]; then
  echo "DECISION: Triggering refactorer (every 20 commits)"
  bash scripts/agents/refactorer.sh &
fi

# Release evaluation: check if enough features accumulated
LAST_TAG=$(git tag -l 'v*' --sort=-v:refname | head -1)
if [ -n "$LAST_TAG" ]; then
  COMMITS_SINCE=$(git log ${LAST_TAG}..HEAD --oneline | wc -l | tr -d ' ')
  FEATS_SINCE=$(git log ${LAST_TAG}..HEAD --oneline --grep='feat:' | wc -l | tr -d ' ')
  echo "Since $LAST_TAG: $COMMITS_SINCE commits, $FEATS_SINCE features"
  if [ "$FEATS_SINCE" -ge 5 ]; then
    echo "DECISION: Enough features for release → launching Release Manager"
    bash scripts/agents/release-manager.sh &
  fi
fi
