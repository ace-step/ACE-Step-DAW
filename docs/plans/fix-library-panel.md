# Fix Plan: Library Panel (Y shortcut)

## 1. What the Library Panel Should Show

The **Library panel** (toggled with **Y** shortcut or the leftmost toolbar button) is conceptually a
**left-side project asset browser** — similar to GarageBand's "Library" or Logic Pro's "Browser".
In this DAW context it should display:

- All **AI-generated clips** saved to the project's asset store (`project.assets`)
- All **imported/uploaded audio clips** saved to the asset store
- Each entry shows: mini waveform preview, prompt/name, track origin, duration, star status
- Filter tabs: All / Starred / AI-generated / Imported
- A search box to filter by prompt or track name
- Click-to-select (highlights the clip on the timeline)
- Star / remove buttons per asset

This is essentially the same content as the `AssetsPanel` component (which already exists and is
fully implemented). The Library (Y) and the Assets Panel appear to be the same concept under two
different names.

---

## 2. Current State

### 2a. Toolbar button — IMPLEMENTED (but broken)
**File:** `src/components/layout/Toolbar.tsx`, lines 66–87

```tsx
const showLibrary = useUIStore((s) => s.showLibrary);
const setShowLibrary = useUIStore((s) => s.setShowLibrary);
// ...
<ControlBarButton
  active={showLibrary}
  onClick={() => setShowLibrary(!showLibrary)}
  title="Library (Y)"
  disabled={!project}
>
```

The button exists, is wired up, and toggles `uiStore.showLibrary`. ✅

### 2b. `uiStore` state — IMPLEMENTED
**File:** `src/store/uiStore.ts`, lines 39, 90, 140, 222

```ts
showLibrary: boolean;          // line 39 (interface)
setShowLibrary: (v: boolean) => void;  // line 90 (interface)
showLibrary: false,            // line 140 (initial state)
setShowLibrary: (v) => set({ showLibrary: v }),  // line 222 (action)
```

State exists and updates correctly. ✅

### 2c. Keyboard shortcut — MISSING ❌
**File:** `src/hooks/useKeyboardShortcuts.ts`

The `Y` key / `KeyY` case is **completely absent** from the `switch (e.code)` block (lines ~185–265).
The toolbar tooltip says "Library (Y)" but pressing Y does nothing.

Also, the Keyboard Shortcuts dialog (`src/components/dialogs/KeyboardShortcutsDialog.tsx`) does **not**
list "Y → Library" in its Panels section (lines 55–62). Only X (Mixer), B (Smart Controls), O (Loop
Browser) are listed.

### 2d. Panel rendering in AppShell — MISSING ❌
**File:** `src/components/layout/AppShell.tsx`

`showLibrary` is **never read or used** in `AppShell`. No `<LibraryPanel />` or `<AssetsPanel />` is
rendered when `showLibrary` is true. There is no import of `AssetsPanel` either.

### 2e. AssetsPanel — FULLY IMPLEMENTED but disconnected
**File:** `src/components/assets/AssetsPanel.tsx`

`AssetsPanel` is a complete, working component. It:
- Reads `showAssetsPanel` from `uiStore` (not `showLibrary`)
- Has resize handle, search, filter tabs, asset list with waveform, star/delete actions
- Returns `null` when `showAssetsPanel` is false or no project

It is **not mounted anywhere in AppShell**. It reads `showAssetsPanel`, not `showLibrary`.

There are now **two separate boolean flags** for what is conceptually the same panel:
- `showLibrary` — controlled by Y shortcut + toolbar button
- `showAssetsPanel` — read by `AssetsPanel` but never set by anything in the current UI

---

## 3. Root Cause

The Library panel was partially wired up (store state + toolbar button) but the developer forgot to:
1. Mount the actual panel component in `AppShell`
2. Connect the correct store flag (`showLibrary` vs `showAssetsPanel`)
3. Add the `Y` keyboard shortcut handler
4. Add `Y → Library` to the keyboard shortcuts help dialog

The `AssetsPanel` component was built separately and uses a different flag (`showAssetsPanel`) that
was never tied to the Library button/shortcut. The two halves were never connected.

---

## 4. Exact Files and Lines to Change

### File 1: `src/components/layout/AppShell.tsx`

**What to change:** Import and mount `AssetsPanel`, placed inside the main flex row next to `TrackList`.

- **Add import** (around line 18, after other panel imports):
  ```tsx
  import { AssetsPanel } from '../assets/AssetsPanel';
  ```

- **Add render** (inside the `<div className="flex flex-1 min-h-0">` block, currently lines 52–55):
  ```tsx
  {project && <TrackList />}
  {project && <AssetsPanel />}   {/* ← ADD THIS */}
  {project && <LoopBrowser />}
  <Timeline />
  ```

  The Library panel should appear on the **left**, between `TrackList` and the rest. (Or right side —
  design decision; left matches GarageBand convention.)

---

### File 2: `src/components/assets/AssetsPanel.tsx`

**What to change:** Switch from reading `showAssetsPanel` to reading `showLibrary`.

- **Line 35** — change selector:
  ```tsx
  // BEFORE:
  const showAssetsPanel = useUIStore((s) => s.showAssetsPanel);
  // AFTER:
  const showLibrary = useUIStore((s) => s.showLibrary);
  ```

- **Line 37** — remove `assetsPanelWidth` / `setAssetsPanelWidth` if desired, or keep for resize
  (they can stay — the resize drag logic and width state still work fine).

- **Line 72** (guard clause) — change condition:
  ```tsx
  // BEFORE:
  if (!showAssetsPanel || !project) return null;
  // AFTER:
  if (!showLibrary || !project) return null;
  ```

- **Header label** (line ~100) — optionally rename from "Loop Browser" to "Library":
  ```tsx
  // BEFORE:
  <span className="...">Loop Browser</span>
  // AFTER:
  <span className="...">Library</span>
  ```

---

### File 3: `src/hooks/useKeyboardShortcuts.ts`

**What to change:** Add `KeyY` case to the non-mod shortcut switch block.

- **Location:** Inside the `switch (e.code)` block (around line 253, after the `KeyO` case).

  ```ts
  // Library toggle (Y)
  case 'KeyY':
    e.preventDefault();
    ui.setShowLibrary(!ui.showLibrary);
    break;
  ```

---

### File 4: `src/components/dialogs/KeyboardShortcutsDialog.tsx`

**What to change:** Add `Y → Library` entry to the Panels section.

- **Location:** Inside `SECTIONS`, in the `'Panels'` section rows array (around line 55–62):

  ```ts
  {
    title: 'Panels',
    rows: [
      { keys: ['Y'],  description: 'Toggle Library' },   // ← ADD
      { keys: ['X'],  description: 'Toggle Mixer' },
      { keys: ['B'],  description: 'Toggle Smart Controls' },
      { keys: ['O'],  description: 'Toggle Loop Browser' },
    ],
  },
  ```

---

## 5. Optional Cleanup (not required for fix)

- **`src/store/uiStore.ts`:** The `showAssetsPanel` and `setShowAssetsPanel` state/actions (lines 32,
  73, 134, 204) can be **removed** or **deprecated** once `AssetsPanel` is driven by `showLibrary`.
  If nothing else reads `showAssetsPanel`, remove it to avoid confusion.

- **`src/components/layout/Toolbar.tsx`:** Confirm `disabled={!project}` on the Library button
  (line 89) is intentional — looks correct as-is.

---

## 6. Implementation Steps (in order)

1. **Edit `AssetsPanel.tsx`** — switch `showAssetsPanel` → `showLibrary` (2 lines + optional label).
2. **Edit `AppShell.tsx`** — add `import { AssetsPanel }` and mount `{project && <AssetsPanel />}`
   in the correct position in the flex row.
3. **Edit `useKeyboardShortcuts.ts`** — add `case 'KeyY':` to the switch block.
4. **Edit `KeyboardShortcutsDialog.tsx`** — add `{ keys: ['Y'], description: 'Toggle Library' }`
   to the Panels section.
5. **(Optional) Clean up `uiStore.ts`** — remove dead `showAssetsPanel` + `setShowAssetsPanel` if
   nothing else uses them. Search codebase for `showAssetsPanel` first to verify.
6. **Test:** Press Y → Library opens. Press Y again → closes. Toolbar Library button toggles correctly.
   Panel shows AI clips, filter tabs work, search works, star/delete work.

---

## 7. Summary Table

| Component | File | Issue | Fix |
|---|---|---|---|
| Toolbar button | `Toolbar.tsx:85–87` | ✅ works | No change |
| Store state | `uiStore.ts:39,140,222` | ✅ works | No change (remove `showAssetsPanel` optional) |
| Y key shortcut | `useKeyboardShortcuts.ts` | ❌ missing | Add `case 'KeyY'` |
| Panel mounted | `AppShell.tsx` | ❌ missing | Import + render `AssetsPanel` |
| Panel flag | `AssetsPanel.tsx:35,72` | ❌ wrong flag | Change `showAssetsPanel` → `showLibrary` |
| Shortcut help | `KeyboardShortcutsDialog.tsx` | ❌ missing | Add Y → Library row |
