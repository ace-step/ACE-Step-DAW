#!/bin/bash
# Project Manager — Wake, decide, dispatch, EXIT
# Uses Codex for intelligence (exits when done, doesn't linger)
set -e
cd /Users/junmingong/.openclaw/workspace/acestep-daw
REPO="ace-step/ACE-Step-DAW"

# Gather state (pure bash, fast)
ISSUES=$(gh issue list --repo $REPO --state open --json number,title,labels --jq '.' 2>/dev/null)
PRS=$(gh pr list --repo $REPO --state open --json number,title,isDraft,mergeable,statusCheckRollup --jq '.' 2>/dev/null)
CC=$(ps aux | grep 'claude.*print' | grep -v grep | wc -l | tr -d ' ')
CX=$(ps aux | grep 'codex exec' | grep -v grep | wc -l | tr -d ' ')

# One-shot Codex decision — it will think, act, then EXIT
codex exec -s danger-full-access "You are the PM for ACE-Step DAW. Make decisions and execute them NOW. Then exit.

STATE:
- Open issues: $ISSUES
- Open PRs: $PRS
- Claude Code running: $CC
- Codex running: $CX

DO THESE IN ORDER, THEN EXIT:

1. MERGE: For each non-draft, mergeable PR with all CI checks passing:
   gh pr merge NUMBER --squash --admin --repo $REPO

2. BALANCE: If there are unworked issues and capacity available:
   - Codex slots = 10 - $CX available
   - Claude Code slots = 5 - $CC available  
   - Prefer Codex (cheaper). Launch via:
     codex exec -s danger-full-access 'cd /tmp/daw-worktrees/agent-ISSUE && git fetch origin && git checkout -B fix/issue-ISSUE origin/main && [implement] && git push && gh pr create' &
   - Only use Claude Code if Codex full

3. CONFLICTS: If PR is conflicting, rebase it.

4. EXIT immediately after dispatching. Do NOT stay running."
