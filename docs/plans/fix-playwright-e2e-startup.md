# Fix Playwright E2E Startup Regression

## User Stories

As a developer, I want `npx playwright test tests/e2e/` to launch the DAW on an isolated local port, so that e2e runs are deterministic even when another local dev server is already running.

As an AI agent, I want the Playwright `webServer` lifecycle to own the app process it tests, so that CLI-driven verification does not accidentally reuse an unrelated process and fail before any workflow assertions run.

## Problem

Issue [#315](https://github.com/ace-step/ACE-Step-DAW/issues/315) reports that the Playwright regression suite exits with `ERR_CONNECTION_REFUSED` at `http://127.0.0.1:5274/` before any e2e assertions execute.

## Root Cause

[`playwright.config.ts`](/tmp/daw-worktrees/agent-315/playwright.config.ts) only injected `NO_PROXY` into the child `webServer` process. Playwright checks whether `http://127.0.0.1:5274/` is already available before it starts that child process, and that parent-side check was still running through the local HTTP proxy configured in the shell environment. The proxy returned `400`, which Playwright treated as "server available", so it skipped starting the DAW and the specs later failed on `page.goto('/')` with `ERR_CONNECTION_REFUSED`.

## Solution

Update [`playwright.config.ts`](/tmp/daw-worktrees/agent-315/playwright.config.ts) to:

1. Normalize loopback bypass entries into `NO_PROXY`, `no_proxy`, and `GLOBAL_AGENT_NO_PROXY` before Playwright evaluates `webServer` availability.
2. Keep `127.0.0.1` / `localhost` requests on the local machine instead of sending them to the configured HTTP proxy.
3. Use a deterministic worktree-specific e2e port when `E2E_PORT` is not explicitly set, so concurrent local worktrees do not fight over the same Playwright/Vite port.
4. Disable `reuseExistingServer` so Playwright always owns the server lifecycle for regression runs.

## Verification

1. `npm run build`
2. `npx playwright test tests/e2e/project-lifecycle.spec.ts --reporter=line`
3. `npx playwright test tests/e2e/ --reporter=line`

## Files To Touch

- [`playwright.config.ts`](/tmp/daw-worktrees/agent-315/playwright.config.ts)
- [`docs/plans/fix-playwright-e2e-startup.md`](/tmp/daw-worktrees/agent-315/docs/plans/fix-playwright-e2e-startup.md)
