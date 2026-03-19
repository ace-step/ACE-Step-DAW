#!/bin/bash
# Project Manager — Wake, see everything, decide, dispatch, EXIT
set -e
cd /Users/junmingong/.openclaw/workspace/acestep-daw
REPO="ace-step/ACE-Step-DAW"

# ── Gather FULL team status ──

# Issues
ISSUES=$(gh issue list --repo $REPO --state open --limit 30 --json number,title,labels --jq '[.[] | {num:.number, title:.title[:50], labels:[.labels[].name]}]' 2>/dev/null)

# PRs + their CI status
PRS=$(gh pr list --repo $REPO --state open --limit 20 --json number,title,isDraft,mergeable,headRefName,statusCheckRollup --jq '[.[] | {num:.number, title:.title[:40], draft:.isDraft, merge:.mergeable, checks:[.statusCheckRollup[] | "\(.name):\(.conclusion // "pending")"]}]' 2>/dev/null)

# Running agents — WHO is doing WHAT
CC_DETAIL=$(ps aux | grep -E 'claude.*(--print|bypassPermissions|dangerously)' | grep -v grep | awk '{for(i=11;i<=NF;i++) printf "%s ",$i; print ""}' | grep -oE 'issue.#[0-9]+|Issue #[0-9]+|#[0-9]+|issue-[0-9]+' | sort -u | tr '\n' ',' | sed 's/,$//')
CX_DETAIL=$(ps aux | grep 'codex exec' | grep -v grep | awk '{for(i=11;i<=NF;i++) printf "%s ",$i; print ""}' | grep -oE 'issue-[0-9]+|#[0-9]+' | sort -u | tr '\n' ',' | sed 's/,$//')
CC_COUNT=$(ps aux | grep -E 'claude.*(--print|bypassPermissions|dangerously)' | grep -v grep | wc -l | tr -d ' ')
CX_COUNT=$(ps aux | grep 'codex exec' | grep -v grep | wc -l | tr -d ' ')

# Recent merges
RECENT=$(gh pr list --repo $REPO --state merged --limit 5 --json number,title,mergedAt --jq '[.[] | "\(.number): \(.title[:40])"]' 2>/dev/null)

# One-shot Codex decision
codex exec -s danger-full-access "You are the Project Manager. See the full team status below. Make decisions, execute, EXIT.

═══ TEAM STATUS ═══

OPEN ISSUES (backlog):
$ISSUES

OPEN PRs (pipeline):
$PRS

RUNNING AGENTS:
- Claude Code CLI: $CC_COUNT running → working on: $CC_DETAIL
- Codex CLI: $CX_COUNT running → working on: $CX_DETAIL
- Max capacity: Claude Code 3, Codex 10

RECENTLY MERGED:
$RECENT

═══ YOUR DECISIONS ═══

1. MERGE: For each non-draft PR where all checks pass and mergeable=MERGEABLE:
   gh pr merge NUMBER --squash --admin --repo $REPO

2. REBASE: For CONFLICTING PRs, checkout branch, rebase, push.

3. STAFF: Look at which issues already have agents vs which don't.
   - DON'T assign agents to issues that already have one working
   - Prefer Codex (cheaper): codex exec -s danger-full-access 'cd /tmp/daw-worktrees/agent-ISSUE && ...' &
   - Only use Claude Code if Codex is at 10

4. BALANCE: If Claude Code >= 3, don't add more. If Codex < 10 and there are unworked issues, add Codex.

5. EXIT when done. Print summary of what you did."
