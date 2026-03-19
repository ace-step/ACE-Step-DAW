# First-Run Onboarding Research

Date: 2026-03-19
Issue: #328

## Problem

ACE-Step already documents onboarding expectations in the design guide, but the shipped app still starts with an empty workspace plus the generic new-project dialog. That misses the intended genre-template, density-tier, tutorial, and contextual-tip flow.

## Competitive Notes

### GarageBand

- Template-based onboarding is explicit and low-friction.
- The product does not ask the user to understand the entire DAW before making sound.
- The first-run flow narrows the surface area and gets the user into a meaningful starter session quickly.

### FL Studio

- Demo projects are part of the learning loop, not a separate documentation exercise.
- Rich tooltip behavior helps users learn controls in context without leaving the app.
- First-run exploration is supported by immediate examples instead of a blank canvas.

### ACE-Step Design References

- `docs/design/UX_IMPROVEMENT_CHECKLIST.md`
  - Genre template selection
  - Complexity tier
  - 5-step interactive tutorial
  - Contextual tips
  - Demo projects
- `docs/design/INTERACTION_DESIGN_GUIDE.md`
  - Template-based onboarding per genre
  - Demo projects showing different genres
  - 5-step overlay tutorial
  - Contextual tips persisted in local storage

## Implementation Takeaways

- First launch should open into a full-screen onboarding layer before the default new-project dialog.
- The flow should offer both:
  - a fresh template path
  - a demo-project path
- Complexity tier must produce visible UI differences immediately, not just store metadata.
- The tutorial should point at real in-app controls, especially timeline, transport, genr, mixer, and help.
- Contextual tips should be attached to discoverable UI targets and persist after dismissal.
