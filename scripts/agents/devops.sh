#!/bin/bash
# DevOps Agent — Monitor CI health, optimize pipeline, fix infrastructure
set -e
cd /Users/junmingong/.openclaw/workspace/acestep-daw
REPO="ace-step/ACE-Step-DAW"

~/.local/bin/claude --print --permission-mode bypassPermissions \
  "You are the DevOps engineer for ACE-Step DAW.

1. Check recent CI runs: gh run list --repo $REPO --limit 10
2. Identify slow or failing jobs
3. For E2E tests: check if they're timing out, suggest optimizations
4. For flaky tests: identify patterns, fix or skip
5. Optimize: playwright.config.ts timeout, parallel workers, test selection
6. Fix any infrastructure issues blocking the pipeline
7. Ensure the self-hosted runner is healthy: ps aux | grep Runner

Goal: CI should complete in < 3 minutes. E2E should not block merges."
