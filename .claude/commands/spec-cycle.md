---
name: "Spec Cycle"
description: Full spec-driven development cycle — propose → decompose → dispatch → verify → archive
category: Workflow
tags: [workflow, openspec, pipeline]
---

Full spec-driven development cycle: from idea to merged code via formal specs.

**Input**: A feature name or description (e.g., `/spec-cycle add-mixer-eq-band`).

**Steps**

1. **Phase 0 — Propose (spec)**

   Run `/opsx:propose "<name>"` to create the formal specification:
   - `proposal.md` — what and why
   - `specs/` — Given/When/Then behavior contracts
   - `design.md` — technical approach
   - `tasks.md` — implementation steps

   Wait for all artifacts to be complete before proceeding.

2. **Phase 1 — Decompose (spec → issues)**

   Run the decomposition script:
   ```bash
   bash scripts/agents/spec-to-issues.sh "<name>"
   ```

   This creates one GitHub Issue per task from `tasks.md`, with:
   - Given/When/Then scenarios from specs in the issue body
   - Label `spec:<name>` for tracking
   - Standard acceptance criteria

   Show: how many issues were created, their numbers.

3. **Phase 2 — Dispatch + Review (automatic with gates)**

   Issues are automatically picked up by `pm-auto.sh` → `sprint-runner.sh`.
   Monitor progress at: http://127.0.0.1:5175 (Agent Dashboard).

   Show the user the dashboard URL and suggest:
   ```
   npm run dashboard  # Start if not already running
   ```

   **Review gate** (per AGENTS.md Step 5): Each PR must pass before merge:
   - CI passes (type check + tests + build)
   - GitHub Copilot automatic review: check via `gh pr view <num> --json reviews`
   - Codex independent review: run `/codex review`, post findings as PR comment
   - Both reviewers' feedback must be addressed before merge

4. **Phase 3 — Verify (spec coverage)**

   After all issues are closed and PRs merged, verify spec coverage:

   Run `@tester` with the change name to check MUST/SHALL coverage:
   - Read the actual spec files from `openspec/changes/<name>/specs/`
   - Extract all MUST/SHALL requirements
   - Search test files for corresponding test cases
   - Report any uncovered requirements as spec gaps

   If any MUST/SHALL requirements are uncovered, create additional issues.
   Only proceed to Phase 4 when all requirements have passing tests.

5. **Phase 4 — Archive**

   Run `/opsx:archive "<name>"` to:
   - Sync specs to `openspec/specs/` (tracked in git)
   - Archive the change

**Output**

Show a progress summary at each phase transition:
```
## Spec Cycle: <name>

Phase 0 (Propose):  ✓ 4 artifacts created
Phase 1 (Decompose): ✓ 6 issues created (#A, #B, #C, #D, #E, #F)
Phase 2 (Dispatch):  In progress — 3/6 complete
Phase 3 (Verify):    Pending
Phase 4 (Archive):   Pending
```

**Guardrails**
- Phase 0 is interactive — wait for user to review and approve specs
- Phase 1 is automatic — creates issues immediately
- Phase 2 is hands-off — agents work autonomously
- Phase 3 requires human judgment — verify spec coverage
- Phase 4 is the final step — only after all work is verified
- If any phase fails, stop and report — don't continue blindly
