# Feature Plan: First-Run Onboarding With genr

Issue: #328

## 1. Problem

ACE-Step has onboarding guidance in the design docs, but the product still drops first-time users into an empty DAW plus the generic new-project dialog. That misses the issue scope for starter templates, complexity tiers, a skippable tutorial, contextual tips, and immediately explorable demo sessions.

## 2. Root Cause

- `src/components/layout/AppShell.tsx` only checks whether a project exists and then opens `NewProjectDialog`.
- `src/store/uiStore.ts` persists general layout state, but it has no onboarding lifecycle, no complexity-tier defaults, and no persistent tip-dismissal model.
- The toolbar has generation shortcuts, but no explicit `genr` entry point for first-run teaching.
- The app has project-template support in `src/store/projectStore.ts`, but there is no built-in onboarding catalog that turns it into a guided first-run experience.

## 3. Solution

### 3a. Add onboarding state and density-tier defaults

- Extend `src/store/uiStore.ts` with:
  - first-run visibility state
  - onboarding completion / skip persistence
  - workspace complexity persistence
  - tutorial progress
  - dismissed contextual tips
- Add an `applyWorkspaceComplexity(...)` action that changes visible defaults immediately.

### 3b. Add starter catalog for templates and demo sessions

- Add `src/data/onboardingCatalog.ts`.
- Define:
  - built-in genre templates
  - built-in demo projects
  - tutorial steps
  - contextual tips

### 3c. Add first-run UI and tutorial overlays

- Add `src/components/onboarding/FirstRunOnboarding.tsx`.
- Add `src/components/onboarding/GuidedTutorialOverlay.tsx`.
- Add `src/components/onboarding/ContextualTips.tsx`.
- Mount them from `src/components/layout/AppShell.tsx`.

### 3d. Make genr part of the visible first-run path

- Add a dedicated `genr` toolbar button in `src/components/layout/Toolbar.tsx`.
- Expose stable onboarding targets on toolbar and timeline elements so the tutorial and agent tests can point at real UI.

### 3e. Verify with tests

- Add unit coverage for onboarding state transitions and complexity-tier defaults.
- Add Playwright coverage for:
  - first launch showing onboarding
  - starting from a demo/template without manual setup
  - persistent tip dismissal across reload

## 4. Verification

- `npx tsc --noEmit`
- `npm test`
- `npm run build`
- `npx playwright test tests/e2e/onboarding.spec.ts`

User-story verification:

- As a new user, I want to start from a genre template or demo project, so that I am not dropped into an empty DAW.
- As a user, I want to choose a simple, standard, or advanced workspace, so that the visible defaults match my experience level.
- As a user, I want a skippable 5-step tutorial and dismissible contextual tips, so that I can learn the DAW in context and never see the same tip again once dismissed.

## 5. Files To Touch

- `docs/research-notes/first-run-onboarding-competitive-research-20260319.md`
- `docs/plans/feat-first-run-onboarding-genr.md`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/Toolbar.tsx`
- `src/components/timeline/Timeline.tsx`
- `src/components/onboarding/FirstRunOnboarding.tsx`
- `src/components/onboarding/GuidedTutorialOverlay.tsx`
- `src/components/onboarding/ContextualTips.tsx`
- `src/data/onboardingCatalog.ts`
- `src/hooks/useKeyboardShortcuts.ts`
- `src/store/uiStore.ts`
- `tests/e2e/onboarding.spec.ts`
- `tests/unit/onboardingStore.test.ts`
