#!/bin/bash
# Project Manager — Intelligent Brain (no hardcoded thresholds)
set -e
cd /Users/junmingong/.openclaw/workspace/acestep-daw
REPO="ace-step/ACE-Step-DAW"

# Gather all context
ISSUES=$(gh issue list --repo $REPO --state open --limit 30 --json number,title,labels,assignees 2>/dev/null)
PRS=$(gh pr list --repo $REPO --state open --limit 20 --json number,title,isDraft,mergeable,statusCheckRollup 2>/dev/null)
RECENT_MERGED=$(gh pr list --repo $REPO --state merged --limit 5 --json number,title 2>/dev/null)
RUNNING_CLI=$(ps aux | grep 'claude.*print' | grep -v grep | wc -l | tr -d ' ')
RECENT_LOG=$(git log --oneline -10 2>/dev/null)
LAST_TAG=$(git tag -l 'v*' --sort=-v:refname | head -1 2>/dev/null)

# Let the brain decide everything
~/.local/bin/claude --print --permission-mode bypassPermissions --allowedTools 'Edit,Write,Read,Bash' \
  "You are the Project Manager brain for ACE-Step DAW. Make ALL decisions yourself — no hardcoded rules.

CURRENT STATE:
- Open issues: $ISSUES
- Open PRs: $PRS
- Recently merged: $RECENT_MERGED
- Running CLI agents: $RUNNING_CLI
- Recent commits: $RECENT_LOG
- Last release tag: $LAST_TAG
- Claude Code CLI: up to 5 concurrent (launch via: ~/.local/bin/claude --print --permission-mode bypassPermissions "task..." &)
- Codex CLI: up to 5 concurrent (launch via: codex --yolo "task..." — NEEDS pty:true)
- Copilot: up to 5 concurrent (assign issues via: gh api repos/ace-step/ACE-Step-DAW/issues/NUMBER/assignees -f assignees[]=copilot-swe-agent[bot])
- RULE: Load balance across all 3 channels. Do not put all tasks on one channel.
- Repo: $REPO
- Workspace: /Users/junmingong/.openclaw/workspace/acestep-daw

YOUR RESPONSIBILITIES (in priority order):

1. MERGE: Check each open PR. If non-draft, CI all pass, mergeable — merge it now:
   gh pr merge NUMBER --squash --admin --repo $REPO

2. FIX: If a PR has conflicts, rebase it. If CI failed, figure out why.

3. STAFF: Look at open issues vs running CLI agents. Decide how many more to launch.
   Consider: are the issues simple (1 CLI enough) or complex (needs focused attention)?
   Are there bugs (P0) that need urgent attention vs features that can wait?
   To launch a dev: ~/.local/bin/claude --print --permission-mode bypassPermissions 'Implement issue #N ...' &

4. REVIEW: Check recently merged PRs. Do they have tests? If not, note it.

5. RELEASE: If enough meaningful work accumulated since last tag, consider triggering release.

6. HEALTH: Are too many CLI agents fighting over the same files? Should some be killed?

Think step by step. Explain your reasoning briefly. Then execute your decisions."
