# Sprint 06 — Onboarding, Library, and Accessibility

## User Stories

- As a new user, I want the first-run path to get me to music in under 30 seconds, so that ACE-Step feels AI-native instead of empty.
- As a creator, I want a modern sample browser with preview, search, and drag-to-timeline, so that discovery stays inside the app.
- As a keyboard or assistive-tech user, I want the DAW surface to be navigable and legible, so that accessibility is built into the core experience.

## Problem

- Issues `#970 #971 #975` all affect first impression and trust. Today ACE-Step has useful starter pieces, but they are fragmented and do not yet form a guided, accessible creation flow.

## Root Cause

- `src/components/dialogs/NewProjectDialog.tsx:89-152` and `src/components/dialogs/NewProjectDialog.tsx:207-245` provide templates and demo starters, but there is no first-run path selector, progress tracking, or contextual help system.
- `src/components/assets/LoopBrowser.tsx:74-191` supports categories, search, preview, and drag payloads, but it is still a loop library rather than a full sample browser with BPM/key metadata, favorites collections, recent items, or AI sample generation.
- `src/components/ui/Knob.tsx:137-210` and `src/components/mixer/VerticalFader.tsx:110-127` expose partial ARIA but omit `aria-valuetext`, value announcements, and shared accessibility primitives.
- `rg` coverage shows almost no reduced-motion, high-contrast, color-blind, skip-link, or focus-trap infrastructure beyond isolated `aria-live` regions.

## Solution

### Deliverables

- Build a first-run shell with three entry paths: generate, template, blank.
- Promote Loop Browser into a sample browser service with metadata, favorites, recents, preview sync, and AI sample generation entry points.
- Standardize accessible control primitives, skip links, reduced-motion handling, and dialog focus management.

### Issue Map

- `#970` first-run onboarding
- `#971` sample browser
- `#975` accessibility

### Proposed PR Slices

1. `feat: add accessible control primitives and navigation affordances`
   - slider ARIA, skip links, reduced motion, focus management
2. `feat: add sample browser metadata, preview sync, and collections`
   - extend current loop library into a real browser
3. `feat: add AI-first onboarding and contextual quick help`
   - welcome dialog, template path, help panel, shortcut overlay

## Verification

- `npx tsc --noEmit`
- `npm run build`
- `npx vitest run tests/unit/statusBarControls.test.ts tests/unit/StatusBar.test.tsx`
- add new unit coverage:
  - accessible slider attributes
  - sample browser filtering and favorites
  - first-run state gating
- browser workflows:
  - first launch from clean storage
  - choose "Generate a Song", complete quick-start
  - preview and drag a sample to timeline
  - complete the same key actions with keyboard-only navigation

## Files To Touch

- `docs/plans/sprint-06-onboarding-library-accessibility.md`
- `src/components/dialogs/NewProjectDialog.tsx`
- `src/components/assets/LoopBrowser.tsx`
- `src/components/assets/LoopBrowserItems.tsx`
- `src/components/ui/Knob.tsx`
- `src/components/mixer/VerticalFader.tsx`
- `src/components/ui/DualRangeSlider.tsx`
- `src/store/uiStore.ts`
- `src/index.css`
- `src/App.tsx`
- `tests/e2e/`
- `tests/unit/`
