#!/bin/bash
# Researcher — Competitive gap analysis
set -e
cd /Users/junmingong/.openclaw/workspace/acestep-daw
~/.local/bin/claude --print --permission-mode bypassPermissions \
  "You are a DAW researcher. Compare ACE-Step DAW with Ableton/Logic/FL Studio.
  1. Read our features: cat README.md
  2. Read existing research: ls docs/research-notes/
  3. Identify 5 features we're still missing that competitors have
  4. Write a brief gap report to docs/research-notes/competitive-gap-$(date +%Y%m%d).md
  5. For each gap, create a GitHub Issue: gh issue create --repo ace-step/ACE-Step-DAW --title 'feat: ...' --label 'role:developer,priority:P1'
  6. Print summary"
