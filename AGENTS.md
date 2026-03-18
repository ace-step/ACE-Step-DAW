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

## Red Lines (absolute prohibitions)

- ❌ Never push directly to main
- ❌ Never publish a release without deep-tested GIF demos
- ❌ Never code without competitive research (except hotfixes)
- ❌ Never skip browser testing before release
- ❌ Never push to personal fork (org repo only)
- ❌ Never use wrong git identity

---

_This document is the law. Violating any rule requires stopping and correcting before continuing._
