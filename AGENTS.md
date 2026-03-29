# AGENTS.md — ACE-Step DAW Development Rules

> All AI agents MUST follow this file AND `CLAUDE.md`.
> Quality gates, TDD cycle, and git basics are in CLAUDE.md (single source of truth).
> This file covers: development process, competitive research, design resources, and red lines.

---

## Git Workflow (PR-driven, no exceptions)

### Branches
- `main` — Stable. **Only updated via PR merge.** Never push directly.
- **Manual branches**: `feat/v0.0.X-xxx`, `fix/v0.0.X-xxx`, `test/v0.0.X-system-test`
- **Automated branches**: `fix/issue-NUMBER` (created by `launch-dev.sh` per issue)

### Per-Version Workflow
```
git fetch origin && git checkout main && git pull --ff-only origin main
git checkout -b feat/v0.0.X-feature-name
→ Develop + test + fix → push → Create PR → review → merge
→ git tag -a v0.0.X -m "release notes" && git push origin main --tags
→ Create GitHub Release (with deep-tested GIF demos)
```

**Hotfix exception**: `fix/` branches may skip competitive research, but code review + testing are mandatory.

### Release Standards
- Detailed changelog (every feature + fix)
- Deep-tested GIF demos (full user workflows)
- Test coverage report
- Known issues list + next steps

---

## 9-Step Development Process

### Step 1: Competitive Deep Research
- Read competitor docs at **interaction-detail level** (parameter ranges, edge cases, shortcuts, error handling)
- Bad: "Ableton has Group Tracks"
- Good: "Ableton Group Track: nestable, shows sub-clip overview when folded, Cmd+Click for multi-select, color applies to all sub-tracks"
- Output: `docs/research-notes/`

### Step 2: Agile Planning
- Write dev tasks with competitive references
- Decide: copy / improve / skip per feature

### Step 3: UI/UX Design Audit
- Design UI before coding. Check colors, spacing, hierarchy, density
- Follow `.claude/references/interaction-design.md`

### Step 4: Coding (Three-Model Parallel)
| Model | Role |
|-------|------|
| Claude Opus (1M) | Planning, review, test analysis |
| Claude Code CLI | Precise coding, adaptation, refactoring |
| Codex | Bulk coding, PR review, testing |

### Step 5: Code Review
- Quality gates (see CLAUDE.md) + scan for: unused imports, console.log, untyped `any`

### Step 6: Browser Testing
- Full user workflows (not just clicking around). Compare against competitors.

### Step 7: Color Validation
- Dark theme consistency, WCAG contrast, DAW color conventions

### Step 8: PR + Review + Merge + Tag
- Push → PR → Copilot reviews → merge → tag → GitHub Release → Discord

### Step 9: Full System Test (every 5 versions)
- v0.0.15, v0.0.20, v0.0.25...
- Cold start, full user journey, edge cases, visual audit, audio stability

---

## Design & UX Resources

- **Interaction Design**: `.claude/references/interaction-design.md`
- **Design Guide**: `docs/design/INTERACTION_DESIGN_GUIDE.md`
- **UX Checklist**: `docs/design/UX_IMPROVEMENT_CHECKLIST.md`
- **Research Notes**: `docs/research-notes/` (drag testing, mixer UX gaps, recording UX gaps)

---

## Competitive Research Index

### Ableton Live 12
- [Mixing](https://www.ableton.com/en/live-manual/12/mixing/) | [MIDI](https://www.ableton.com/en/live-manual/12/editing-midi/) | [Effects](https://www.ableton.com/en/live-manual/12/live-audio-effect-reference/)
- [Automation](https://www.ableton.com/en/live-manual/12/automation-and-editing-envelopes/) | [Recording](https://www.ableton.com/en/live-manual/12/recording-new-clips/) | [Browser](https://www.ableton.com/en/live-manual/12/working-with-the-browser/) | [Routing](https://www.ableton.com/en/live-manual/12/routing-and-i-o/)

### ACE-Step
- [DAW Repo](https://github.com/ace-step/ACE-Step-DAW) | [API Repo](https://github.com/ace-step/ACE-Step-1.5) | API Docs: `docs/research-notes/ace-step-api-details.md`

---

## User Story Driven Development

### Format
```
As a [human user / AI agent], I want to [action], so that [outcome].
```

### Plans Must Be Executable
Every plan (`docs/plans/*.md`) must contain: Problem → Root Cause → Solution → Verification → Files to Touch.

---

## Language Policy

- All project files MUST be in English (source, comments, docs, commits, PRs, releases)
- Exception: `docs/research-notes/` may contain bilingual content
- Conversations may be in Chinese; all repo output must be English

---

## Red Lines (absolute prohibitions)

- Never push directly to main
- Never merge a PR before CI passes
- Never publish a release without deep-tested GIF demos
- Never code without competitive research (except hotfixes)
- Never skip browser testing before release
- Never push to personal fork (org repo only)
- Never use wrong git identity (ChuxiJ / junmin@acestudio.ai)
- Always check Copilot review feedback before merge

---

_This document is the law. Violating any rule requires stopping and correcting._
