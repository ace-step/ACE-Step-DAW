# DAW Design Patterns Reference

> Design principles for ACE-Step DAW UI. These are GUIDING PRINCIPLES, not rigid rules.
> The existing hand-tuned components are the **living gold standard** — when in doubt,
> match them, don't override them with abstract rules.

## Philosophy: Principles Over Prescriptions

**Why principles, not pixel specs:**
- Rigid rules create seesaw effects (one rule says "compact", another says "44px minimum" — agent oscillates)
- The founder has hand-tuned core components to a specific feel. That feel IS the spec.
- New components should **harmonize** with existing ones, not match an abstract spec sheet

**The golden rule**: Before building any UI component, **read the closest existing component first** and match its patterns. The codebase is the reference, not this document.

## Gold Standard Components (read these FIRST)

When building new UI, find the most similar existing component and study its patterns:

| Building... | Study this reference | File |
|------------|---------------------|------|
| Track-related UI | TrackHeader | `src/components/tracks/TrackHeader.tsx` |
| Mixer/channel strips | MixerPanel, SessionMixerStrip | `src/components/mixer/MixerPanel.tsx` |
| Transport/toolbar | Toolbar | `src/components/layout/Toolbar.tsx` |
| Note editing | PianoRoll, PianoRollCanvas | `src/components/pianoroll/PianoRoll.tsx` |
| Pattern/step UI | SequencerEditor, SequencerGrid | `src/components/sequencer/SequencerEditor.tsx` |
| Rotary controls | Knob, MiniKnob | `src/components/ui/Knob.tsx` |
| Faders/sliders | VerticalFader | `src/components/mixer/VerticalFader.tsx` |
| Effects/device UI | EffectCards, SmartControlsPanel | `src/components/mixer/EffectCards.tsx` |

**Workflow**: Read the reference → match its spacing, sizing, and color patterns → only deviate if you have a specific reason.

## Principle 1: Use the Theme System

The project has 5 themes with 42 CSS custom properties. **Never hardcode colors.**

```
Surface hierarchy:  daw-bg → daw-surface → daw-surface-2 → daw-surface-3
Borders:            daw-border (subtle), daw-border-strong (structural)
Text:               white/90 (primary), daw-text-muted (secondary), white/40 (tertiary)
Accent:             daw-accent (selection, active state, primary action)
Regions:            daw-region-audio, daw-region-midi, daw-region-drummer, daw-region-sample
State:              Green=active, Red=recording/error, Yellow=solo/warning, Blue=selected
```

**How to check**: Search your new code for hardcoded `#hex` values or `rgb()`. Each one should have a justification (canvas rendering, gradient stops) or be replaced with a theme token.

**Exception**: Existing components may have hardcoded values from before the theme system. Don't "fix" these unless asked — they're hand-tuned.

## Principle 2: Match the Existing Density

DAW UIs are dense by design — every pixel matters. But the right density is **whatever the existing components use**, not an abstract ideal.

**How to calibrate**: Open the reference component. Look at its padding, gaps, and margins. Match those. Don't add more whitespace "for clarity" — DAW users expect density. Don't remove whitespace "for compactness" — the current balance was chosen deliberately.

**Common mistake**: Agents add `p-4` (16px) padding everywhere because web conventions say "generous padding = good UX." In DAW UI, `p-4` is usually too much for controls. But don't blindly use `p-1` either — match what adjacent components do.

**The density test**: Does your new component feel like it belongs next to the existing components? Or does it feel like it's from a different app?

## Principle 3: Surface Hierarchy Creates Depth

Professional DAWs use 3-4 surface depth levels to create visual structure without explicit borders.

```
Deepest  → daw-bg         (spaces between panels, app background)
Mid-dark → daw-surface     (panel backgrounds)
Mid      → daw-surface-2   (interactive items, cards, list entries)
Elevated → daw-surface-3   (floating elements, dropdowns, tooltips)
```

**The principle**: Nested containers should differ in surface level. If a parent is `daw-surface`, children should be `daw-surface-2`. If everything is the same shade, there's no visual structure.

**Prefer surface contrast over borders**: Borders should be subtle separators, not boxes around every element. Study how `MixerPanel.tsx` and `TrackHeader.tsx` use surface levels.

## Principle 4: Accent Color is Precious

Accent color (`daw-accent`) should be reserved for communicating state: selected, active, focused, playing. If everything is blue, nothing is selected.

**The principle**: When adding accent color, ask "does this communicate STATE or is this decoration?" If decoration, use a neutral surface/border instead.

**State color conventions** (these ARE fixed — all DAWs use them):
- Green: Active / Armed / Enabled
- Red: Recording / Error / Destructive action
- Yellow/Amber: Solo / Warning / Caution
- Blue (accent): Selected / Focused
- Muted (opacity): Disabled / Bypassed / Inactive

## Principle 5: Typography Has Roles

- **Sans (Inter)**: UI labels, menus, track names — anything the user reads
- **Mono (JetBrains Mono)**: Numeric values (BPM, dB, time, note names) — anything the user compares

**The principle**: If a value will be scanned/compared across multiple instances (mixer levels, note pitches), use monospace so digits align. For everything else, use sans.

**Size hierarchy**: Use at most 3-4 font sizes per component. If you need more, the component is trying to do too much. Study the reference component's font sizing and match it.

## Principle 6: Animation is Functional, Not Decorative

Professional DAWs animate only to communicate state changes:
- Playhead movement (continuous, smooth)
- Recording pulse (communicates "recording is active")
- Value transitions (75ms color/opacity changes)
- Panel reveal (150ms slide, not longer)

**The principle**: If removing an animation wouldn't confuse the user, the animation shouldn't exist. No bounce, spring, or elastic effects — they feel toy-like in a pro tool.

## Principle 7: Cross-Theme Resilience

Every component must work across all 5 themes. The easiest way to break this is hardcoding colors.

**How to verify**: In the browser console:
```js
['ace-studio', 'ableton', 'logic-pro', 'fl-studio', 'pro-tools'].forEach(t =>
  document.documentElement.setAttribute('data-theme', t)
)
```

Cycle through and check: Is text readable? Does the hierarchy hold? Do state colors still communicate correctly?

## Principle 8: Respect What Exists

This is the most important principle for agents.

**The codebase has been hand-tuned.** When you encounter a design choice that seems "wrong" by abstract standards (e.g., "this padding is inconsistent" or "this color is hardcoded"), **do not change it** unless:
1. The user explicitly asks you to change it
2. It causes a visible bug (text unreadable, elements overlapping)
3. It breaks in a theme other than the default

**When something seems inconsistent**: It may be a deliberate design choice you don't understand. Ask before "fixing" it. The cost of a wrong "improvement" (seesaw effect, visual regression) is much higher than the cost of asking.

## Anti-Patterns (What Agents Get Wrong)

1. **Over-spacing**: Adding generous padding to "clean up" dense DAW UI
2. **Over-bordering**: Boxing elements with borders instead of using surface hierarchy
3. **Over-rounding**: Using `rounded-lg` or `rounded-xl` (most DAW UI uses sharp or `rounded-sm`)
4. **Accent abuse**: Making too many things blue/accent-colored
5. **Font size soup**: Using 5+ different font sizes in one component
6. **Decoration**: Adding shadows, gradients, or animations that serve no function
7. **Fixing what works**: "Improving" hand-tuned components that already look right
8. **Web conventions in DAW context**: Applying web app spacing/sizing to a tool that needs density
