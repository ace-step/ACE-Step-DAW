# Strudel AGPL Compliance Research for ACE-Step DAW

Date: 2026-03-24

## Problem

As the ACE-Step DAW maintainer, I want to understand whether the current Strudel integration can remain MIT-only, so that we can ship the feature legally.

As an AI agent, I want a repository-level compliance decision that is grounded in primary sources, so that implementation work does not proceed on a false licensing assumption.

## Current Repository Findings

The current repository directly bundles Strudel packages and executes them inside the ACE-Step DAW runtime:

- `package.json` declares `@strudel/codemirror`, `@strudel/core`, `@strudel/mini`, `@strudel/repl`, `@strudel/soundfonts`, `@strudel/tonal`, `@strudel/transpiler`, and `@strudel/webaudio`
- `src/engine/strudelEngine.ts` dynamically imports multiple `@strudel/*` modules and uses them to evaluate patterns, run playback, and render audio
- `src/components/strudel/StrudelEditor.tsx` loads Strudel editor/runtime modules directly into the React UI
- `src/store/projectStore.ts` persists Strudel track state and routes evaluation/freezing through store actions
- The repository still declares itself as `MIT` in both `package.json` and `LICENSE`

This is not a documentation-only reference to Strudel syntax. It is a direct code dependency and runtime integration.

## Primary-Source Research

### GNU AGPL v3

Relevant sections from the official GNU AGPL text:

- Section 1 says the Corresponding Source includes source for dynamically linked subprograms when the work is specifically designed to require them through intimate data communication or control flow.
- Section 5(c) says that when conveying a work based on the Program, the entire work must be licensed under the AGPL as a whole.
- Section 5(d) says interactive user interfaces must display Appropriate Legal Notices.
- Section 13 says users interacting remotely with a modified AGPL program must be offered access to the Corresponding Source of that version.

Engineering implication for ACE-Step:

- If ACE-Step DAW ships the current in-process Strudel integration, the safest compliance assumption is that the distributed app must be treated as an AGPL-covered combined work.
- If ACE-Step DAW is hosted for remote use, the deployment also needs a visible path to the corresponding source code.

### GNU GPL FAQ

The GNU GPL FAQ explains that dynamically linked modules or components with intimate communication and shared data structures are generally treated as a single combined program.

Engineering implication for ACE-Step:

- The current Strudel integration is much closer to a combined program than to a loose aggregate.
- Simply loading AGPL JavaScript packages at runtime does not create a clean isolation boundary by itself.

### Strudel Package Metadata

The npm registry metadata for the Strudel packages used here currently reports:

- `@strudel/core`: `AGPL-3.0-or-later`
- `@strudel/webaudio`: `AGPL-3.0-or-later`

The upstream repository linked by npm is `https://codeberg.org/uzu/strudel.git`.

Engineering implication for ACE-Step:

- The dependency graph itself already puts the repository on notice that the shipped integration is not permissively licensed.

## Compliance Options

### Option A: Re-license ACE-Step DAW under AGPL-3.0-or-later

This is the direct path if we want to keep the current Strudel integration architecture.

Required repository changes:

- Replace the MIT project license text
- Update `package.json` license metadata
- Update `README.md` so the project is not presented as MIT-only
- Preserve third-party attribution for Strudel
- Add a visible in-app source/license notice suitable for hosted deployments

Operational consequence:

- Future hosted builds must make Corresponding Source available to users interacting with the app over a network.

### Option B: Keep ACE-Step DAW MIT-only and remove direct Strudel integration

This is the safest path if product strategy requires a permissive repository.

Required repository changes:

- Remove bundled `@strudel/*` dependencies
- Remove the Strudel runtime/editor/store integration from shipped code
- Replace it with one of:
  - a clean-room implementation of similar ideas or syntax that does not copy Strudel code
  - a separately negotiated alternative license from the Strudel copyright holders

Operational consequence:

- This preserves permissive licensing, but it means the current Strudel feature cannot ship as-is.

### Option C: Keep MIT-only while continuing to bundle current Strudel packages

This is not recommended.

Why:

- The current integration is not a loose aggregate.
- The repository is currently advertising a licensing position that does not match the shipped dependency model.

## Recommendation

Recommend **Option A** if the product decision is to keep the existing Strudel feature.

Why this is the most practical path:

- It preserves already-built functionality
- It resolves the immediate mismatch between repository metadata and bundled dependencies
- It is much smaller in scope than a clean-room rewrite
- The maintainer has already stated that switching the project to AGPL is acceptable if required

## Boundary Cases To Avoid Misreading

- Reusing Strudel ideas or designing a compatible user-facing syntax is not the same thing as copying Strudel code.
- A separate service or tool boundary is only safer if it is genuinely independent; intimate communication or combined distribution can still pull the work back into combined-program analysis.
- Loading AGPL code in the browser from the same shipped app is not a reliable workaround for keeping the rest of the app MIT-only.

## Sources

- GNU AGPL v3 official text: https://www.gnu.org/licenses/agpl-3.0.en.html
- GNU GPL FAQ: https://www.gnu.org/licenses/gpl-faq.html
- `@strudel/core` npm metadata: https://www.npmjs.com/package/@strudel/core
- `@strudel/webaudio` npm metadata: https://www.npmjs.com/package/@strudel/webaudio
- Strudel upstream repository: https://codeberg.org/uzu/strudel

## Note

This research note is an engineering compliance summary, not legal advice. Final publication decisions should be reviewed with qualified legal counsel if ACE-Step DAW will be broadly distributed or commercially hosted.
