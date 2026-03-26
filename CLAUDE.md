# ACE-Step DAW — Agent Instructions

> This file is automatically loaded by Claude Code. All agents MUST follow AGENTS.md as well.

## Tech Stack

React 19 + TypeScript 5.7 + Vite 6 + Zustand 5 + Tone.js + Tailwind CSS v4

## ⛔ Issue-First Workflow (BLOCKING — do this BEFORE any code)

> **STOP.** Before writing ANY code, creating ANY branch, or running ANY tests — you MUST create a GitHub issue first. This is not optional. This is not skippable. Violating this rule wastes the team's time.

### Sequence (every step blocks the next)

1. **Create GitHub issue** via `gh issue create`
   - Title and body MUST be in **English** regardless of conversation language
   - Title starts with `feat:`, `fix:`, `docs:`, `refactor:`, or `chore:`
   - Include acceptance criteria as a markdown checklist
   - Use label: `bug`, `enhancement`, `docs`, or `refactor`
2. **Create branch** named `feat/issue-NUMBER` or `fix/issue-NUMBER`
3. **Implement** following TDD cycle and quality gates
4. **Create PR** with `Closes #NUMBER` in the body
5. **Report** the issue URL and PR URL back to the user

### When to Skip (only these 3 cases)

- Pure questions / explanations (no code change needed)
- Trivial typo fixes (< 3 lines changed, single file)
- Work already tracked by an existing issue (reference it instead)

**When in doubt, create the issue.** It takes 10 seconds. Skipping it and fixing later takes much longer.

## Commands

```bash
npm run dev          # Start dev server (http://127.0.0.1:5174)
npm test             # Run Vitest unit tests
npm run test:watch   # Run Vitest in watch mode
npm run test:e2e     # Run Playwright E2E tests
npm run test:all     # Run unit + E2E tests
npm run test:coverage # Unit tests with coverage report
npm run build        # TypeScript check + Vite production build
npx tsc --noEmit     # Type check only (no output)
```

## Quality Gates (must ALL pass before any commit)

1. `npx tsc --noEmit` — 0 type errors
2. `npm test` — all unit tests pass
3. `npm run build` — succeeds with 0 errors
4. **For UI changes**: start dev server, verify visually with preview tools — never claim a UI feature works without seeing it

## TDD Cycle (mandatory for all code changes)

1. **Red**: Write a failing test that describes the desired behavior
2. **Green**: Write the minimum code to make the test pass
3. **Refactor**: Clean up while keeping tests green
4. **Commit**: `git commit` with conventional commit message

## Agentic Work Discipline

### Done Criteria (before coding features touching 3+ files)
Write a checklist in `.llm/todo.md` before coding. State what must be true when done — specific, testable, no vibes. Include edge cases (non-standard BPMs, undo, keyboard path, scroll offsets). Each item must be verifiable by a test, screenshot, or store assertion — not "I looked at it."

### External Evaluation Rule
Never self-assess completion. Run `@tester` or `/qa` before every commit — its output is the gate, not your judgment. Do not say "looks good" or "works correctly" about your own code.

### Context Anxiety Checklist
If you notice yourself doing any of these, STOP and compact or start a new session:
- Re-reading files you already read this session
- Adding defensive checks "just in case"
- Generating code that duplicates existing utilities
- Losing track of which files you've modified
- Rushing to commit with TODOs or stubs ("will finish later")
- Skipping tests or visual verification due to context pressure

## Autonomous Work Rules

- ALWAYS run `npm test` before AND after code changes
- Every new feature MUST include unit tests (+ E2E test if UI-facing)
- Every bug fix MUST include a regression test that fails without the fix
- If tests fail after your change, fix immediately — never move on with red tests
- Record blockers to `.llm/BLOCKERS.md` and continue with the next task
- After completing a logical unit of work, commit immediately
- Use `@do-todo` agent for individual tasks to keep main context clean
- Use `@tester` agent after each task to run full regression — this is the external evaluator, not optional
- Never write tests that only assert truthiness (`toBeTruthy`, `toBeDefined`) — assert specific values
- For features with user interaction, write adversarial test cases in TDD Red phase (weird BPMs, rapid input, undo immediately after action, drag during playback)

## When Compacting, Always Preserve

- The full list of modified files and their paths
- Current task from `.llm/todo.md` and its progress
- Test results (which passed, which failed)
- Any blockers recorded in `.llm/BLOCKERS.md`

## Store API (for programmatic testing and E2E)

```js
// Read state
window.__store.getState().project.tracks

// Add track
window.__store.getState().addTrack('stems' | 'sample' | 'sequencer' | 'pianoroll')

// Add MIDI note
window.__store.getState().addMidiNote(clipId, {
  pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8
})

// Toggle sequencer step
window.__store.getState().toggleSequencerStep(trackId, rowId, stepIndex)

// Update project settings
window.__store.getState().updateProjectSettings({ bpm: 140 })
```

## Project Structure

- `src/store/` — Zustand stores (projectStore, transportStore, generationStore, uiStore)
- `src/engine/` — Audio engine (Tone.js wrappers)
- `src/services/` — Business logic (API, generation pipeline, storage)
- `src/components/` — React UI components
- `src/hooks/` — React hooks
- `src/utils/` — Pure utility functions
- `src/types/` — TypeScript interfaces
- `tests/e2e/` — Playwright E2E tests
- `.llm/todo.md` — Agent task list
- `.llm/BLOCKERS.md` — Issues needing human input

## DAW Interaction Design Standards

> Every UI component MUST follow these interaction patterns. Reference this section when writing any component that handles user interaction.

### Timeline & Clip Interactions
- **Snap to grid**: All drag operations snap to beat/bar grid by default. Hold Alt for free movement.
- **Zoom anchor**: Zoom (Cmd+scroll) anchors to mouse cursor position, not center.
- **Multi-select drag**: Shift+click for additive select, Cmd+click for toggle. Dragging multiple clips maintains relative positions.
- **Ghost preview**: Show a semi-transparent ghost at the snap-to position during drag, BEFORE drop.
- **Cross-track drag**: Clips can be dragged between tracks. Show blue highlight on valid target lanes, red on invalid.
- **Clip resize**: Left/right edges are resize handles (6px). Cursor changes to `col-resize`. Hold Alt for non-snapped resize.

### Knobs, Sliders & Controls
- **Vertical drag for knobs**: Map vertical mouse movement to value changes (UP = increase). Use pointer lock to prevent cursor hitting screen edge.
- **Double-click to reset**: Double-clicking any knob/slider resets to default value.
- **Right-click for precision**: Right-click opens a text input for exact value entry.
- **Scroll to adjust**: Mouse wheel on a focused knob/slider adjusts by fine increments.
- **Visual feedback**: All value changes must reflect in under 100ms with smooth visual transitions.

### Keyboard-First Design
- **Every action is keyboard-accessible**: If a mouse action exists, a keyboard shortcut or tab-navigable path must exist too.
- **Transport always responds**: Space=play/pause, Enter=stop/return-to-start — works regardless of focus (unless in a text input).
- **No shortcut conflicts**: Check `src/components/dialogs/KeyboardShortcutsDialog.tsx` for existing mappings before adding new ones.
- **Modifier conventions**: Cmd/Ctrl = primary action, Shift = additive/extend, Alt = bypass snap/free mode, Cmd+Shift = alternative variant.

### Feedback & Responsiveness
- **< 100ms**: Visual feedback for any user action (click, drag start, hover state change).
- **< 16ms**: Audio parameter changes (volume, pan) must update within one animation frame.
- **Progress indication**: Any operation > 500ms shows a spinner or progress bar.
- **Toast notifications**: Use `useToast()` for success/error/info messages. Auto-dismiss after 3s for success, persist for errors.

### Progressive Disclosure
- **Default = simple**: New users see a clean, uncluttered interface. Advanced features behind toggles/menus.
- **Right-click for power**: Context menus reveal advanced options without cluttering the main UI.
- **Hover for details**: Show tooltips with keyboard shortcut hints after 500ms hover delay.
- **Panel toggles**: All panels (mixer, library, effects) toggle with single-key shortcuts.

### Drag-and-Drop Rules
- **Always provide drag feedback**: Source element shows visual change (opacity, border), cursor changes.
- **Valid/invalid zones**: Clearly indicate where drops are accepted (glow/highlight) vs rejected (no-drop cursor).
- **Cancel support**: Escape during drag cancels and returns to original state.
- **data-* attributes**: All drag targets must have `data-track-id`, `data-clip-id` for both E2E testing and agent interaction.

### Agent-Friendly Design
- **Every UI action = store action**: Every feature must work via `window.__store.getState().actionName()`.
- **State is truth**: UI always derives from Zustand store state. No local state for anything an agent might need.
- **Error messages are actionable**: "Track 'xyz' not found" instead of "Error occurred".
- **Undo everything**: Every user/agent action pushes to history via `_pushHistory()`.

### Color & Visual Language
- **Track colors**: Each track has a unique color (from palette). Used on: left strip, clip backgrounds, waveforms, mixer channel.
- **State indicators**: Green = active/armed, Red = recording/error, Yellow = warning/caution, Blue = selected/focused.
- **Contrast**: All text must meet WCAG AA (4.5:1 ratio) against dark backgrounds.
- **Color-blind safe**: Never use color alone to convey meaning — always pair with shape/icon/label.

## Recommended Claude Code Skills

When using Claude Code on this project, install these skills for better UX output:

```bash
# Layer 1: Interaction design foundations
/plugin install bencium-innovative-ux-designer@bencium-marketplace  # Drag/drop, feedback, direct manipulation
/plugin install interface-design                                      # Design decision memory & consistency

# Layer 2: Quality assurance
/plugin install frontend-design                                       # Anthropic official — visual quality
/plugin install web-design-guidelines                                 # 100+ rule UX audit (Vercel)

# Layer 3: Process support
/plugin install designer-skills                                       # State machines, gestures, feedback design
```

## Git Conventions

- Branch: `feat/v0.0.X-xxx`, `fix/v0.0.X-xxx`, `test/v0.0.X-xxx`
- Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`
- Identity: `user.name: ChuxiJ`, `user.email: junmin@acestudio.ai`
- Never push directly to main — always use PR workflow
- Never merge a PR before CI passes — check CI status first, fix if red
- If CI fails: understand root cause → add fix commit → wait for green → then merge

## gstack

Use the `/browse` skill from gstack for **all web browsing**. Never use `mcp__Claude_in_Chrome__*` tools.

Available skills:
- `/office-hours` — Office hours
- `/plan-ceo-review` — Plan CEO review
- `/plan-eng-review` — Plan engineering review
- `/plan-design-review` — Plan design review
- `/design-consultation` — Design consultation
- `/review` — Code review
- `/ship` — Ship changes
- `/browse` — Web browsing (use this instead of Chrome MCP tools)
- `/qa` — QA testing
- `/qa-only` — QA only
- `/design-review` — Design review
- `/setup-browser-cookies` — Setup browser cookies
- `/retro` — Retrospective
- `/investigate` — Investigate issues
- `/document-release` — Document a release
- `/codex` — Codex mode
- `/careful` — Careful mode
- `/freeze` — Freeze changes
- `/guard` — Guard mode
- `/unfreeze` — Unfreeze changes
- `/gstack-upgrade` — Upgrade gstack
