#!/bin/bash
# Release Manager — Evaluate if ready to release, then tag + publish
# Runs in an isolated worktree to avoid disrupting other agents.
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="ace-step/ACE-Step-DAW"

# Create isolated worktree (never touches the main checkout)
source "$SCRIPT_DIR/ensure-worktree.sh" "release-manager"
cd "$WT"

~/.local/bin/claude --print --permission-mode bypassPermissions --allowedTools 'Edit,Write,Read,Bash' \
  "You are the Release Manager for ACE-Step DAW.
Your working directory is $WT (an isolated worktree on origin/main). Do NOT cd elsewhere.

1. Check current version: grep version package.json
2. Check last release tag: git tag -l 'v*' --sort=-v:refname | head -1
3. Count commits since last release: git log \$(git tag -l 'v*' --sort=-v:refname | head -1)..HEAD --oneline | wc -l
4. List features since last release: git log \$(git tag -l 'v*' --sort=-v:refname | head -1)..HEAD --oneline --grep='feat:'
5. List fixes since last release: git log \$(git tag -l 'v*' --sort=-v:refname | head -1)..HEAD --oneline --grep='fix:'

RELEASE CRITERIA (ALL must be true):
- At least 5 meaningful features or fixes since last release
- npm run build passes
- npx vitest run tests/unit/ all pass
- No P0 bugs open: gh issue list --repo $REPO --state open --label 'priority: P0'

VERSION RULE: Increment patch only. v0.0.9 → v0.0.10 (NOT v0.1.0)

If ready to release:
1. Determine new version (current patch + 1)
2. Update package.json version
3. Write CHANGELOG entry to CHANGELOG.md (create if needed)
4. Commit: git -c user.name=ChuxiJ -c user.email=junmin@acestudio.ai add -A && git commit -m 'release: vX.Y.Z'
5. Tag: git tag -a vX.Y.Z -m 'Release vX.Y.Z - [summary]'
6. Push: git push origin main --tags
7. Create GitHub Release: gh release create vX.Y.Z --repo $REPO --title 'vX.Y.Z' --notes-file CHANGELOG.md

If NOT ready: print what's missing and what needs to happen first."

# Safe worktree removal
safe_rm_worktree() {
  local dir="$1"
  if [[ -n "$dir" && "$dir" =~ ^/tmp/daw-worktrees/ ]]; then
    rm -rf "$dir"
  else
    echo "WARN: refusing to rm unsafe path: $dir" >> /tmp/pm-activity.log
  fi
}

# Cleanup
cd /tmp && safe_rm_worktree "$WT"
git -C "$DAW" worktree prune 2>/dev/null
