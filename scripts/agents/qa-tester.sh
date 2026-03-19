#!/bin/bash
# QA Tester — Dual mode: regression + feature-specific
# Runs in an isolated worktree to avoid disrupting other agents.
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="ace-step/ACE-Step-DAW"

MODE=${1:-"full"}  # "full" or "pr-specific"
PR_NUM=${2:-""}

# Create isolated worktree (never touches the main checkout)
source "$SCRIPT_DIR/ensure-worktree.sh" "qa-tester"
cd "$WT"

~/.local/bin/claude --print --permission-mode bypassPermissions \
  "You are QA for ACE-Step DAW. Mode: $MODE
Your working directory is $WT (an isolated worktree on origin/main). Do NOT cd elsewhere.

## If mode=full (scheduled regression):
1. npm run build — report any errors
2. npx vitest run tests/unit/ — report failures
3. npx playwright test tests/e2e/ — report failures
4. Check recently merged PRs: gh pr list --repo $REPO --state merged --limit 5
5. For each merged PR, verify the feature works (read code, run relevant test)
6. Create bug issues for any failures found

## If mode=pr-specific (triggered by new PR):
1. Review PR #$PR_NUM diff: gh pr diff $PR_NUM --repo $REPO
2. Understand what it changes
3. Run relevant tests
4. If the PR adds a feature, write a quick test for it
5. Comment on the PR with test results

For any bugs: gh issue create --repo $REPO --title 'bug: ...' --label 'priority:P0,role:developer'"

# Safe worktree removal
safe_rm_worktree() {
  local dir="$1"
  if [[ -n "$dir" && "$dir" =~ ^/tmp/daw-worktrees/ ]]; then
    rm -rf "$dir"
  else
    echo "WARN: refusing to rm unsafe path: $dir" >> /tmp/pm-activity.log
  fi
}

# Cleanup worktree after agent exits
cd /tmp && safe_rm_worktree "$WT"
git -C "$DAW" worktree prune 2>/dev/null
