# Sprint 07 — Collaboration, Cloud, and Project Lifecycle

## User Stories

- As a creator, I want projects to persist in the cloud with version history and share links, so that my work survives beyond one browser instance.
- As a collaborator, I want shared playback and later real-time sync to build on the same project model, so that collaboration does not fork into a separate product.
- As an AI agent, I want cloud and share actions to be explicit APIs, so that automated flows can publish, restore, and validate remote project state.

## Problem

- Issue `#974` is larger than one feature. It combines storage, sharing, project organization, version history, MIDI IO, and collaboration foundations. Shipping it safely requires a dedicated lifecycle sprint rather than scattered UI additions.

## Root Cause

- `src/services/cloudStorageService.ts:61-190` stores cloud projects in memory and shared projects in `localStorage`, which makes sharing local-only and non-persistent across environments.
- `src/store/collaborationStore.ts:12-74` tracks viewer mode, share token, and collaborator metadata, but has no backend session model, sync transport, or conflict state.
- `src/services/projectStorage.ts:14-119` is optimized for local IndexedDB project storage, not remote version history, folder organization, or shared ownership.
- `src/main.tsx:122-133` exposes sharing helpers for the local share API, but not a remote repository client or cloud action surface.

## Solution

### Deliverables

- Introduce a project repository abstraction with local and remote implementations.
- Add persistent remote save/load/list/version APIs and wire them into the collaboration store.
- Build a version timeline, hosted share-player load path, project organization metadata, and MIDI import/export integration.
- Define the real-time sync foundation as phase two on top of the same repository and session model.

### Issue Map

- `#974` collaboration and cloud workflow foundation

### Proposed PR Slices

1. `feat: add project repository abstraction and cloud API client`
2. `feat: add cloud save-load-version history UI`
3. `feat: add hosted share player and project organization metadata`
4. `feat: add collaboration session foundation for cursors and track locks`

## Verification

- `npx tsc --noEmit`
- `npm run build`
- `npx vitest run src/services/__tests__/aceStepApi.test.ts src/store/__tests__/projectStore.test.ts`
- add new unit coverage:
  - remote repository adapter behavior
  - version-history restore logic
  - share-token load flows
- browser workflows:
  - save project to cloud, refresh, restore it
  - publish a share page and open it in a clean session
  - restore an earlier version from the timeline

## Files To Touch

- `docs/plans/sprint-07-collaboration-cloud.md`
- `src/services/cloudStorageService.ts`
- `src/store/collaborationStore.ts`
- `src/services/projectStorage.ts`
- `src/services/projectSharingService.ts`
- `src/components/sharing/`
- `src/components/dialogs/ShareDialog.tsx`
- `src/components/dialogs/ProjectListDialog.tsx`
- `src/main.tsx`
- `src/store/projectStore.ts`
- `tests/e2e/`
- `src/services/__tests__/`
