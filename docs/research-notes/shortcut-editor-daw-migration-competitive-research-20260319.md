# Shortcut Editor + DAW Migration Competitive Research

Date: 2026-03-19

## User stories

- As a migrating DAW user, I want shortcut presets that preserve familiar letter positions, so that I can move into ACE-Step without re-learning every muscle-memory path.
- As a browser-based DAW user, I want reserved browser shortcuts to be identified before they interrupt my session, so that I do not lose focus or unsaved work.

## Competitive observations

### Ableton Live 12

- Heavily relies on single-key transport (`Space`) and timeline editing keys (`E`, `B`, `0`, `Cmd/Ctrl+L`).
- The desktop app can safely use `Cmd/Ctrl+L` for loop because there is no browser address-bar conflict.
- Migration implication for ACE-Step browser DAW: preserve the letter target where possible, but avoid browser-reserved modifiers. `Shift+L` is a safer browser analogue than `Cmd/Ctrl+L`.

### Logic Pro

- Uses single-key transport and editing shortcuts extensively (`C` cycle, `R` record, `K` metronome, `X` mixer, `Y` library).
- The migration value is mostly in keeping the same letter, not in preserving every modifier stack.
- Browser implication: letter-only shortcuts migrate cleanly; project/file shortcuts need safe alternatives.

### FL Studio

- Uses function keys (`F8`, `F9`, `F11`) and modifier-heavy clip commands (`Ctrl/Cmd+B`, `Ctrl/Cmd+R`).
- Function-key mappings are naturally safer in the browser and make good migration anchors.

### Pro Tools

- Depends on single-letter editing (`B`, `R`, `T`) and function/numpad transport conventions (`F12`, numpad transport).
- Browser implication: single-letter edit actions can map well, but file/window commands should not reuse browser ownership.

## Product decisions for ACE-Step

- Ship migration presets that preserve the original action letters where reasonable.
- Flag or block browser-owned shortcuts before they are saved or imported.
- Provide browser-safe defaults for file/project actions (`Shift+N`, `Shift+O`, `Alt/Option+,`) so the web DAW remains operable without accidental browser takeovers.
- Keep import/export JSON-based so users can share or version-control shortcut layouts outside the app.
