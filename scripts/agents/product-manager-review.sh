#!/bin/bash
# Product Manager — Review and accept completed work
set -e
cd /Users/junmingong/.openclaw/workspace/acestep-daw
~/.local/bin/claude --print --permission-mode bypassPermissions \
  "You are the Product Manager for ACE-Step DAW.
  1. Check recently merged PRs: gh pr list --repo ace-step/ACE-Step-DAW --state merged --limit 10
  2. For each, verify the feature works by reading the code changes
  3. Check if QA tests exist for it. If not, create an issue: gh issue create --title 'test: QA for [feature]' --label 'role:tester,priority:P1'
  4. Update docs/design/UX_IMPROVEMENT_CHECKLIST.md — mark completed items
  5. Read docs/research-notes/ for competitive gaps → create new feature issues
  6. Print summary of actions"
