# Testing Requirements

> Auto-loaded for all agents. Non-negotiable.

## Mandatory Test Coverage

- Every new feature MUST include unit tests (+ E2E if UI-facing)
- Every bug fix MUST include a regression test
- Run `npm test` before AND after code changes
- Never move on with red tests — fix immediately

## Test Quality

- Never write tests that only assert truthiness — assert specific values
- Tests assert behavior, not implementation details
- For interactive features, write adversarial test cases in TDD Red phase:
  - Weird BPMs, rapid input, undo immediately after action, drag during playback
- Edge cases covered: empty state, error state, boundary values

## UI Changes

- UI changes require visual proof: screenshot before/after
- Check responsive viewports (desktop 1920, tablet 1024, mobile 390)
- Never merge UI changes without visual verification
- Run mechanical design checks (no hardcoded colors, correct density, surface hierarchy)
