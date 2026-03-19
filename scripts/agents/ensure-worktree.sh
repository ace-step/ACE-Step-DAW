#!/bin/bash
# Create or refresh a disposable worktree for any agent role.
# Usage: source ensure-worktree.sh <role-name>
#   Sets WT to the worktree path. Caller should `cd "$WT"` after sourcing.
#
# This avoids `git reset --hard` on the shared main checkout, which destroys
# other agents' uncommitted work.

ROLE=${1:?"Usage: source ensure-worktree.sh <role-name>"}
DAW="/Users/junmingong/.openclaw/workspace/acestep-daw"
WT="/tmp/daw-worktrees/${ROLE}"

# Clean stale worktree
[ -d "$WT" ] && rm -rf "$WT"

cd "$DAW"
git fetch origin main 2>/dev/null
git worktree prune 2>/dev/null

# Create detached worktree at origin/main (never touches the main checkout)
git worktree add "$WT" origin/main --detach 2>/dev/null || {
  echo "ERROR: worktree creation failed for $ROLE" >&2
  exit 1
}

# Install node_modules via symlink (fast, avoids full npm install)
if [ -d "$DAW/node_modules" ] && [ ! -d "$WT/node_modules" ]; then
  ln -s "$DAW/node_modules" "$WT/node_modules" 2>/dev/null
fi

export WT
