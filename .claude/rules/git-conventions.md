# Git Conventions

> Auto-loaded for all agents. Non-negotiable.

## Branch Naming

- Feature: `feat/issue-NUMBER` or `feat/issue-NUMBER-short-desc`
- Bug fix: `fix/issue-NUMBER` or `fix/issue-NUMBER-short-desc`
- Legacy format also accepted: `feat/v0.0.X-xxx`, `fix/v0.0.X-xxx`

## Commit Messages

- Prefix: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Reference issue: `feat: add mixer panel (#123)` or `Closes #123` in body

## Identity

- `user.name: ChuxiJ`
- `user.email: junmin@acestudio.ai`

## PR Lifecycle Ownership

- Don't abandon PRs — handle CI failures, review comments, conflicts until merged
- Every PR body must contain `Closes #NUMBER` linking to the issue
- All project files, comments, and documentation must be in English
