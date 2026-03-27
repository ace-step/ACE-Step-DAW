# Research Backlog Themed Sprint Roadmap (#942-#975)

## Scope

- Sources:
  - `origin/claude/research-daw-synths-KU2At:.llm/research/*`
  - GitHub issues `#942-#975`
  - current `main` code synced on 2026-03-27
- Goal:
  - convert the research backlog into theme-based sprints
  - sequence work around shared engine and store dependencies
  - keep implementation reviewable through small, testable PRs

## Planning Principles

- Ship data model and engine primitives before surface-level UI.
- Preserve dual-surface parity: every sprint must add or extend `window.__store` actions in addition to visual controls.
- Prefer PR slices that touch one interaction family at a time and land with browser-testable workflows.
- Keep dark-theme quality, keyboard access, and agent automation coverage in every sprint, not only at the end.
- Treat issues `#970`, `#974`, and `#975` as trust multipliers: they improve first-run confidence and should progress in parallel with core audio work.

## Dependency Summary

| Sprint | Theme | Issues | Depends On | Planned PRs |
|---|---|---|---|---|
| 01 | Synth Foundation | `#942 #943 #944 #945 #946 #953 #964` | none | 4 |
| 02 | Sampling, Drum Rack, and Render Pipeline | `#948 #949 #950 #951 #952 #958 #961` | 01 | 4 |
| 03 | Mixer, Device Graph, and Routing | `#957 #959 #965 #969` | 01 | 4 |
| 04 | MIDI, Rhythm, and Automation Editors | `#967 #968 #973` | 01, 03 | 3 |
| 05 | Arrangement and Recording Workflows | `#966 #972` | 02, 04 | 3 |
| 06 | Onboarding, Library, and Accessibility | `#970 #971 #975` | none | 3 |
| 07 | Collaboration, Cloud, and Project Lifecycle | `#974` | 06 | 4 |
| 08 | Advanced Sound Design Lab | `#947 #954 #955 #956 #960 #962 #963` | 01, 02, 03 | 4 |

## Execution Lanes

### Lane A — Audio Platform

- Sprint 01
- Sprint 02
- Sprint 03
- Sprint 08

### Lane B — Editing Workflows

- Sprint 04
- Sprint 05

### Lane C — Experience and Trust

- Sprint 06
- Sprint 07

## Recommended Order

1. Land Sprint 01 first to replace preset-only instrument assumptions with a real instrument state model.
2. Start Sprint 06 in parallel once Sprint 01 is underway, because onboarding/accessibility mostly avoids audio-engine conflict.
3. Run Sprint 02 and Sprint 03 after Sprint 01 because both need richer instrument and effect schemas.
4. Start Sprint 04 once Sprint 03 has automation-arm and device parameter hooks available.
5. Start Sprint 05 after Sprint 02 and Sprint 04 so recording, comping, and clip operations share the new render and editor primitives.
6. Start Sprint 07 after Sprint 06 so first-run and project-library UX do not diverge from cloud and share-player flows.
7. Keep Sprint 08 last because it depends on the synth, sampler, routing, and modulation foundations from Sprints 01-03.

## Branch and PR Conventions

- Sprint branches:
  - `feat/v0.0.x-sprint-01-synth-foundation`
  - `feat/v0.0.x-sprint-02-sampling-drum-render`
  - `feat/v0.0.x-sprint-03-mixer-device-routing`
  - `feat/v0.0.x-sprint-04-midi-rhythm-automation`
  - `feat/v0.0.x-sprint-05-arrangement-recording`
  - `feat/v0.0.x-sprint-06-onboarding-library-accessibility`
  - `feat/v0.0.x-sprint-07-collaboration-cloud`
  - `feat/v0.0.x-sprint-08-advanced-sound-design`
- PR naming:
  - `feat: sprint 01 PR1 instrument state model`
  - `feat: sprint 03 PR2 device chain UX`
  - `feat: sprint 06 PR1 accessible control primitives`

## Done Criteria For Every Sprint

- `npx tsc --noEmit`
- `npm run build`
- targeted Vitest coverage for the new engine/store surface
- at least one browser workflow covering human interaction and one `window.__store` workflow covering agent interaction
- no new console noise outside explicit error handlers
- updated docs/plans for any scope change discovered during implementation

## Sprint Documents

- [Sprint 01 — Synth Foundation](./sprint-01-synth-foundation.md)
- [Sprint 02 — Sampling, Drum Rack, and Render Pipeline](./sprint-02-sampling-drum-render.md)
- [Sprint 03 — Mixer, Device Graph, and Routing](./sprint-03-mixer-device-routing.md)
- [Sprint 04 — MIDI, Rhythm, and Automation Editors](./sprint-04-midi-rhythm-automation.md)
- [Sprint 05 — Arrangement and Recording Workflows](./sprint-05-arrangement-recording.md)
- [Sprint 06 — Onboarding, Library, and Accessibility](./sprint-06-onboarding-library-accessibility.md)
- [Sprint 07 — Collaboration, Cloud, and Project Lifecycle](./sprint-07-collaboration-cloud.md)
- [Sprint 08 — Advanced Sound Design Lab](./sprint-08-advanced-sound-design.md)
