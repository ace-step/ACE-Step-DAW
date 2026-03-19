#!/bin/bash
# Refactorer — Code quality maintenance
# Runs in an isolated worktree to avoid disrupting other agents.
set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="ace-step/ACE-Step-DAW"

# Create isolated worktree (never touches the main checkout)
source "$SCRIPT_DIR/ensure-worktree.sh" "refactorer"
cd "$WT"
git checkout -B refactor/cleanup origin/main 2>/dev/null

~/.local/bin/claude --print --permission-mode bypassPermissions \
  "You are the Refactorer for ACE-Step DAW.
Your working directory is $WT (an isolated worktree). Do NOT cd elsewhere.

Tasks:
1. Find oversized files: find src/components -name '*.tsx' -exec wc -l {} + | sort -rn | head -10
2. Any file > 600 lines → extract sub-components
3. Find TypeScript 'any' types: grep -rn ': any\|as any' src/ --include='*.ts' --include='*.tsx'
4. Fix any found
5. Check for dead code, unused imports
6. Run: npm run build && npx vitest run tests/unit/
7. If you made changes: commit, push, create PR on refactor/cleanup branch

Quality targets:
- 0 files > 600 lines
- 0 'any' types
- 0 unused imports

Create PR via gh pr create --repo $REPO. Request copilot review."

# Cleanup
cd /tmp && rm -rf "$WT"
git -C /Users/junmingong/.openclaw/workspace/acestep-daw worktree prune 2>/dev/null
