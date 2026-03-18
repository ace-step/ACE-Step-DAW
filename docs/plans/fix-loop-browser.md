# Plan: Fix Loop Browser — Show 15 Built-in Loops

## Problem
The "Loop Browser (O)" toolbar button opens `AssetsPanel.tsx` which shows 0 items with tabs "All / ★ / AI / Imported". The real `LoopBrowser.tsx` component (which has 15 synthesized loops from `LoopLibrary.ts`) is never shown.

## Root Cause
In `src/components/layout/Toolbar.tsx` line 215-217:
```tsx
active={showAssetsPanel}
onClick={() => setShowAssetsPanel(!showAssetsPanel)}
title="Loop Browser (O)"
```
This toggles `showAssetsPanel` → renders `AssetsPanel.tsx` (empty asset manager with no loops).

Meanwhile, `LoopBrowser.tsx` uses `loopBrowserOpen` from uiStore, which nothing toggles.

Both components are rendered in `AppShell.tsx` lines 52-54:
```tsx
{project && <LoopBrowser />}
...
{project && <AssetsPanel />}
```

## Solution

### Option A (Recommended): Replace AssetsPanel with LoopBrowser
1. In `src/components/layout/Toolbar.tsx`:
   - Change the Loop Browser button to toggle `loopBrowserOpen` instead of `showAssetsPanel`
   - Import `toggleLoopBrowser` from uiStore

2. In `src/components/layout/AppShell.tsx`:
   - Keep `LoopBrowser` render (it already checks `loopBrowserOpen`)
   - Remove or hide `AssetsPanel` (it's empty and confusing)

### Changes Required

**File 1: `src/components/layout/Toolbar.tsx`**
- Line 64: Change `const showAssetsPanel = useUIStore(...)` → `const loopBrowserOpen = useUIStore((s) => s.loopBrowserOpen)`
- Line 215-217: Change to use `loopBrowserOpen` and `toggleLoopBrowser`
- Add import for `toggleLoopBrowser` if needed

**File 2: `src/components/layout/AppShell.tsx`**
- Remove `<AssetsPanel />` render (line 54)
- Remove import of AssetsPanel (line 18)

**File 3: Keyboard shortcut handler**
- Find where "O" key is handled and make sure it toggles `loopBrowserOpen`
- Check `src/hooks/useKeyboardShortcuts.ts` or wherever shortcuts are defined

### Verification
After fix:
1. Click "Loop Browser (O)" button
2. Should show the LoopBrowser panel with categories: All / Drums / Bass / Keys / Synth
3. Should list 15 loops: 808 Boom, Rock Steady, Shuffle Blues, etc.
4. Click a loop to preview (will synthesize via Tone.Offline)
5. Drag a loop to timeline to add it

### Build Check
- `npm run build` must pass with 0 errors
- No unused imports after removing AssetsPanel

## Files to Touch
- `src/components/layout/Toolbar.tsx`
- `src/components/layout/AppShell.tsx`
- `src/hooks/useKeyboardShortcuts.ts` (if shortcut wiring needed)
- Optionally delete `src/components/assets/AssetsPanel.tsx` if fully replaced
