# Fix Strudel AGPL Compliance

## User Stories

- As the ACE-Step DAW maintainer, I want the repository license to match the shipped Strudel integration, so that the project is not distributed under conflicting terms.
- As a hosted ACE-Step DAW user, I want a visible source and license notice, so that I can understand my rights and reach the corresponding source code for the running version.
- As an AI agent, I want the compliance path to be explicit in the repo, so that future Strudel work does not reintroduce MIT-only messaging by accident.

## Problem

- The repository currently declares `MIT` in `LICENSE` and `package.json`.
- The codebase directly bundles and executes multiple `@strudel/*` packages that are published as `AGPL-3.0-or-later`.
- The Strudel feature is integrated as in-process editor, runtime, store, and rendering code rather than as a clearly separate program.
- The app currently has no visible source/license notice for interactive use.

## Root Cause

- Strudel was integrated as a first-class product feature before the repository license strategy was updated.
- The shipping metadata still reflects the pre-Strudel MIT-only state.
- No repository-level plan existed for AGPL notice requirements in interactive/hosted use.

## Solution

- Document the license analysis and decision basis in `docs/research-notes/strudel-agpl-compliance.md`.
- Re-license the repository under `AGPL-3.0-or-later`.
- Update `package.json` and `README.md` so the project is no longer presented as MIT-only.
- Add a third-party notice file that calls out the bundled Strudel packages and upstream project.
- Add a visible source/license link to the interactive UI so hosted builds have an obvious legal notice entry point.

## Verification

- `npx tsc --noEmit`
- `npm test`
- `npm run build`
- Manual UI check: source/license link is visible in the running app footer/status area
- Manual repo check: `LICENSE`, `package.json`, and `README.md` all consistently report `AGPL-3.0-or-later`

## Files To Touch

- `docs/research-notes/strudel-agpl-compliance.md`
- `docs/plans/fix-strudel-agpl-compliance.md`
- `LICENSE`
- `package.json`
- `README.md`
- `THIRD_PARTY_NOTICES.md`
- `src/components/layout/StatusBar.tsx`
- status bar regression tests if needed
