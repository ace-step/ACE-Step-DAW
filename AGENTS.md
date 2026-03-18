# AGENTS.md — ACE-Step DAW Development Rules

> All AI agents participating in development MUST follow this file.
> Repository: ace-step/ACE-Step-DAW

---

## Git Workflow (PR-driven, no exceptions)

### Branches
- `main` — Stable. **Only updated via PR merge.** Never push directly.
- `feat/v0.0.X-xxx` — Short-lived feature branch. Created from main, deleted after merge.
- `fix/v0.0.X-xxx` — Bug fix branch.
- `test/v0.0.X-system-test` — System test + refactor branch.

### Identity
- `user.name`: ChuxiJ
- `user.email`: junmin@acestudio.ai

### Commit Convention
- `feat: add Piano Roll MIDI editor with velocity lane`
- `fix: resolve track deletion memory leak in audio engine`
- `docs: add MIDI editing research from Ableton Live 12`
- `refactor: extract shared Canvas utils into canvasUtils.ts`
- `test: add system test round 3 for v0.0.15`
- `chore: update dependencies`

### Per-Version Workflow
```
git fetch origin && git checkout main && git pull --ff-only origin main
git checkout -b feat/v0.0.X-feature-name
→ Develop + test + fix (all within the same branch)
→ git push origin feat/v0.0.X-feature-name
→ Create PR → Codex reviews PR → merge
→ git checkout main && git pull --ff-only origin main
→ git tag -a v0.0.X -m "release notes" && git push origin main --tags
→ Create GitHub Release (with deep-tested GIF demos)
→ git push origin --delete feat/v0.0.X-feature-name
```

**Hotfix exception**: `fix/` branches may skip Step 1 (competitive research), but Steps 5-8 are mandatory.

### Release Standards (must meet ALL to publish)
- Detailed changelog (every feature + fix + changed file)
- Deep-tested GIF demos (full user workflows, not quick screenshots)
- Test coverage report (what was tested, what was found, what was fixed)
- Known issues list
- Next steps

---

## 9-Step Development Process (Steps 1-8 every version, Step 9 every 5 versions)

### Step 1: Competitive Deep Research 🔍
- Read competitor docs word-by-word at **interaction-detail level**
- Depth standard: parameter ranges, edge cases, visual feedback, shortcuts, error handling
- ❌ "Ableton has Group Tracks" — too shallow
- ✅ "Ableton Group Track: nestable, shows sub-clip overview when folded, Cmd+Click for multi-select, color applies to all sub-tracks, output routes to Group by default but can be overridden, can be used as pure folder" — deep enough
- Output: update `docs/research-notes/`

### Step 2: Agile Planning 📋
- Write specific dev tasks with competitive references
- Decide: copy from competitor / improve / skip
- Create feat branch

### Step 3: UI/UX Design Audit 🎨
- Design UI before coding
- Check colors, spacing, visual hierarchy, information density
- Compare against competitor screenshots

### Step 4: Coding (Three-Model Parallel) 💻
| Model | Role | When to use |
|-------|------|-------------|
| 🧠 Claude Opus (1M) | Planning / review / test analysis | Large context understanding |
| 🔧 Claude Code CLI | Precise coding / adaptation / refactoring | Deep context-aware coding |
| ⚡ Codex (gpt-5.4) | Bulk coding / PR review / testing | Fast execution |

**Key: Use idle agents in parallel. Never waste capacity.**

### Step 5: Code Review 🔬
- `npx tsc --noEmit` — must be 0 errors
- `npm run build` — must pass
- Scan (merge blockers, must be zero): unused imports, console.log (except error handlers), untyped `any`
- Code structure review

### Step 6: Browser Testing 🖥️
- Start dev server → open in browser
- Screenshot to verify UI rendering
- **Simulate full user workflows** (not just clicking around)
- Compare against competitors for gaps
- Fix bugs found **in the same branch**

### Step 7: Color Validation 🎨
- Dark theme consistency
- WCAG contrast standards
- DAW industry color conventions

### Step 8: PR + Review + Merge + Tag 📦
1. Push feat branch to `ace-step/ACE-Step-DAW`
2. Create PR (detailed description of changes)
3. Codex reviews PR (code quality + functional verification)
4. Approved → merge to main
5. Tag: `git tag -a v0.0.X -m "detailed release notes"` + push
6. Create GitHub Release (with deep-tested GIF demos)
7. Send Discord notification
8. Delete feat branch

### Step 9: Full System Test Every 5 Versions 🛡️
- Trigger: v0.0.15, v0.0.20, v0.0.25...
- Uses `test/` branch → PR → merge workflow
- Test checklist:
  - Cold start
  - Full user journey (create → AI generate → edit → mix → export)
  - Edge cases (extreme operations, empty states, large data)
  - Visual audit (screenshot comparison page by page)
  - Audio engine stability
  - Code quality scan + refactor

---

## Three-Model Strategy

| Model | Role | Budget |
|-------|------|--------|
| 🧠 Claude Opus (1M) | Research / planning / review / test analysis | Company API (conserve) |
| 🔧 Claude Code CLI | Precise coding / adaptation / refactoring | Personal free 6 months |
| ⚡ Codex (gpt-5.4) | Bulk coding / PR review / testing | Sponsored free 6 months |

---

## Design & UX Resources

- **Interaction Design Standards**: `CLAUDE.md` → "DAW Interaction Design Standards" section
- **Design Guide**: `docs/design/INTERACTION_DESIGN_GUIDE.md` (comprehensive product design guide)
- **UX Improvement Checklist**: `docs/design/UX_IMPROVEMENT_CHECKLIST.md` (prioritized actionable items)
- **Drag Testing Research**: `docs/research-notes/drag-testing-best-practices.md`
- **Mixer UX Gaps**: `docs/research-notes/mixer-ux-gaps.md`
- **Recording UX Gaps**: `docs/research-notes/recording-ux-gaps.md`

**Rule**: Every new component or feature must follow the interaction design standards in CLAUDE.md.

---

## Competitive Research Index

### Ableton Live 12
- Mixing: https://www.ableton.com/en/live-manual/12/mixing/
- MIDI: https://www.ableton.com/en/live-manual/12/editing-midi/
- Effects: https://www.ableton.com/en/live-manual/12/live-audio-effect-reference/
- Automation: https://www.ableton.com/en/live-manual/12/automation-and-editing-envelopes/
- Recording: https://www.ableton.com/en/live-manual/12/recording-new-clips/
- Browser: https://www.ableton.com/en/live-manual/12/working-with-the-browser/
- Routing: https://www.ableton.com/en/live-manual/12/routing-and-i-o/

### ACE-Step
- DAW: https://github.com/ace-step/ACE-Step-DAW
- API: https://github.com/ace-step/ACE-Step-1.5
- API Docs: docs/research-notes/ace-step-api-details.md

---

## Required Skills (install via `npx clawhub@latest install <name> --dir .claude/skills`)

Agents MUST read and follow the relevant skill before each step. Do not improvise — use best practices.

### Step 1 — Research
- `find-skill` — Search for additional skills on ClawHub if needed

### Step 2 — Planning
- `agile-toolkit` — Sprint planning, backlog management, estimation
- `task-development-workflow` — Task breakdown and dev workflow

### Step 3 — UI/UX Design
- `ui-ux-pro-max` — Visual hierarchy, cognitive load, navigation patterns
- `ui-ux-design` — Mobile-first design, WCAG 2.2, Tailwind + Shadcn
- `ui-audit` — Automated UI audit against UX principles
- `superdesign` — Modern UI best practices for landing pages and dashboards
- `distinctive-design-systems` — Design tokens, typography, layered surfaces

### Step 4 — Coding
- `react-expert` — React 18+ component architecture, hooks, performance
- `typescript-mastery` — Advanced TS patterns, branded types, generics
- `zustand-patterns` — Store design, slice factory, persist, testing
- `tailwind-v4-shadcn` — Tailwind v4 + shadcn/ui theming
- `software-architect` — Scalable systems, trade-offs, boundaries
- `clean-code-review` — Naming, functions, structure, anti-patterns

### Step 5 — Code Review
- `clean-code-review` — Pre-edit safety checks, coding standards

### Step 6-7 — Testing & Validation
- `test-master` — Unit, integration, E2E, coverage, performance testing
- `e2e-testing-patterns` — Playwright/Cypress patterns, flaky test elimination
- `happy-hues` — Color palette validation
- `ui-audit` — Accessibility and UX principle verification

### Step 8 — Release
- No specific skill (follow Git workflow in this document)

### ACE-Step Music Generation
- `acestep` — ACE-Step API for music generation
- `acestep-songwriting` — Lyrics and caption writing guide
- `acestep-lyrics-transcription` — Audio to timestamped lyrics
- `acestep-simplemv` — Music video rendering
- `acestep-thumbnail` — Cover art generation via Gemini

---

## Language Policy

- **All project files** (source code, comments, docs, commit messages, PR descriptions, release notes) **MUST be in English**.
- The only exception is `docs/research-notes/` which may contain bilingual content for competitive research from non-English sources.
- Conversations with the user may be in Chinese, but all output committed to the repo must be English.

---

## Agent-Usability Mandate (CLI-First, Agent-Friendly)

Every feature MUST be usable by both human users AND AI agents. This is not optional.

### What "CLI-First / Agent CLI化" Means
- **Every feature must be operable from the command line** — via `window.__store` API, keyboard shortcuts, or browser automation (Playwright MCP / OpenClaw browser).
- **Development itself is CLI-driven**: agents write plans, execute code, run builds, test via browser automation, commit, PR, merge — all without manual GUI steps.
- **Testing is CLI-driven**: agents open the app in a headless browser, interact via accessibility refs and store API, take screenshots, verify results programmatically.
- This applies to both the **product** (end users + agent users) and the **development process** (agents building + testing the product).

### Principles
1. **Expose state globally**: `window.__store` provides full Zustand store access. Agents call `getState()` to read, and store actions (e.g. `addMidiNote`, `toggleSequencerStep`) to write.
2. **ARIA labels on interactive elements**: Every clickable element (buttons, step cells, knobs, sliders) MUST have an `aria-label` or `role` so browser automation tools (Playwright MCP, OpenClaw browser) can discover and interact via accessibility tree refs.
3. **No canvas-only interactions**: If a feature relies on canvas click events (e.g. Piano Roll note drawing), provide an equivalent store API so agents can accomplish the same task programmatically.
4. **Reasonable defaults**: UI scroll positions, zoom levels, and panel states should open to the most useful position (e.g. Piano Roll opens centered on C4, not C8).
5. **Keyboard shortcuts for every action**: Every toolbar button and panel toggle must have a keyboard shortcut. Agents can send key events more reliably than coordinate clicks.

### Testing Standard
- ❌ "I opened the panel and it rendered" — too shallow (panel-level)
- ✅ "I programmed a basic rock beat: Kick 1/5/9/13, Snare 5/13, HH 8th notes via store API, verified each step activated" — deep enough (user-story level)
- Tests must cover **full user workflows**, not just UI rendering
- Every feature must be tested both as a human (click) AND as an agent (API/DOM)

### Agent API Cheat Sheet
```js
// Read project state
window.__store.getState().project.tracks

// Add MIDI note to a clip
window.__store.getState().addMidiNote(clipId, {
  pitch: 60,        // MIDI note number (C4)
  startBeat: 0,     // Beat position
  durationBeats: 1, // Length in beats
  velocity: 0.8     // 0-1
})

// Toggle a sequencer step
window.__store.getState().toggleSequencerStep(trackId, rowId, stepIndex)

// Change BPM
window.__store.getState().updateProjectSettings({ bpm: 140 })
```

---

## User Story Driven Development

All requirements, plans, implementations, and bug fixes MUST be written and tracked as user stories.

### Format
```
As a [human user / AI agent], I want to [action], so that [outcome].
```

### Examples
- ❌ "Fix Loop Browser" — too vague
- ✅ "As a user, I want to click Loop Browser (O) and see 15 built-in loops organized by category (Drums/Bass/Keys/Synth), so I can drag a loop onto my timeline" — actionable
- ✅ "As an agent, I want to call `window.__store.getState().addMidiNote(clipId, note)` and see the note appear in the Piano Roll, so I can compose melodies programmatically" — agent-oriented

### Plans Must Be Executable
Every plan document (`docs/plans/*.md`) must contain:
1. **Problem** — what's broken or missing (with evidence)
2. **Root Cause** — why it's happening (with file:line references)
3. **Solution** — exact changes needed (which files, which lines, what to change)
4. **Verification** — how to confirm the fix works (build check + user story test)
5. **Files to Touch** — explicit list

Plans are written by the orchestrator (Opus) and executed by coding agents (Codex / Claude Code).

---

## Skill Utilization Policy

The 23 skills listed in "Required Skills" are NOT decorations. They MUST be actively used.

### Rules
1. **Before every step, read the relevant skill's SKILL.md**. Don't improvise what a skill already covers.
2. **Cite the skill in your plan/commit** when its guidance shaped the implementation.
3. **Periodically audit skill usage** — if a skill hasn't been read in 3+ versions, review whether it's still relevant or needs replacement.

### Skill Combos (pre-packaged for common tasks)

| Task | Skills to Load Together |
|------|----------------------|
| **New UI Feature** | `react-expert` + `ui-ux-pro-max` + `zustand-patterns` + `tailwind-v4-shadcn` |
| **Code Review** | `clean-code-review` + `typescript-mastery` |
| **E2E Testing** | `e2e-testing-patterns` + `test-master` + `ui-audit` |
| **Design Audit** | `ui-ux-design` + `distinctive-design-systems` + `happy-hues` |
| **AI Music Feature** | `acestep` + `acestep-songwriting` + `software-architect` |
| **Architecture Refactor** | `software-architect` + `zustand-patterns` + `clean-code-review` |
| **Planning Sprint** | `agile-toolkit` + `task-development-workflow` |

When starting a task, load the relevant combo. Don't cherry-pick one skill and ignore the others.

### Quarterly Skill Review
Every 10 versions (v0.0.20, v0.0.30...), review all installed skills:
- Are they still up-to-date?
- Are there newer/better alternatives on ClawHub?
- Should any be replaced or new ones added?
- Run `npx clawhub@latest search <keyword>` to discover new skills.

---

## Red Lines (absolute prohibitions)

- ❌ Never push directly to main
- ❌ Never publish a release without deep-tested GIF demos
- ❌ Never code without competitive research (except hotfixes)
- ❌ Never skip browser testing before release
- ❌ Never push to personal fork (org repo only)
- ❌ Never use wrong git identity

---

_This document is the law. Violating any rule requires stopping and correcting before continuing._
