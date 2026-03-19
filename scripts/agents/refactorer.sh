#!/bin/bash
# Refactorer — Code quality maintenance
set -e
cd /Users/junmingong/.openclaw/workspace/acestep-daw

~/.local/bin/claude --print --permission-mode bypassPermissions \
  "You are the Refactorer for ACE-Step DAW.

cd /Users/junmingong/.openclaw/workspace/acestep-daw && git fetch origin && git reset --hard origin/main

Tasks:
1. Find oversized files: find src/components -name '*.tsx' -exec wc -l {} + | sort -rn | head -10
2. Any file > 600 lines → extract sub-components
3. Find TypeScript 'any' types: grep -rn ': any\|as any' src/ --include='*.ts' --include='*.tsx'
4. Fix any found
5. Check for dead code, unused imports
6. Run: npm run build && npx vitest run tests/unit/
7. If you made changes: create PR on refactor/cleanup branch

Quality targets:
- 0 files > 600 lines
- 0 'any' types
- 0 unused imports

Create PR via gh pr create. Request copilot review."
