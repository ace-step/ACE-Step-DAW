# Session View Record-to-Arrangement Research

Date: 2026-03-19
Reference: Ableton Live 12 Session View and recording behavior

## Interaction details captured

- Session View is a non-linear clip grid organized by tracks and scenes.
- A scene launch should fire one clip per track column, while per-track stop remains independent.
- Visual feedback matters: launched clips need a clearly active state, and record-to-arrangement needs a persistent red status indicator rather than a transient toast only.
- The Arrangement bridge is the core workflow: performers improvise in Session, then capture the launched sequence into the linear timeline for editing.
- Track-level stop and global stop are both required because users often mute a single lane without collapsing the rest of the performance.
- Empty slots should remain visible so the user can understand scene alignment and where clips are missing.
- Keyboard-first navigation matters. `Tab` is the canonical Session/Arrangement toggle in Ableton and is the right baseline shortcut for ACE-Step as well.

## ACE-Step implementation decisions

- Reuse existing track clips as Session source material instead of introducing a second persistent clip model in this iteration.
- Expose Session launch state via `window.__transportStore` so agents can launch clips and scenes without pointer-driven interaction.
- Record-to-arrangement is implemented as launch-event capture plus arrangement clip duplication, which keeps the feature compatible with the existing clip and transport model.
