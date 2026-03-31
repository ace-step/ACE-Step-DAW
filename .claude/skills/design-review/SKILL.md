# Design Review Skill

> Systematic visual quality evaluation for UI changes. Compensates for the fundamental weakness
> of language models: they cannot "see" — so this skill uses a combination of mechanical code
> checks, comparison against existing hand-tuned components, and principled evaluation.
>
> **Load this skill for ANY PR that touches `src/components/`.**

## Core Philosophy

**The existing codebase is the gold standard.** The founder has hand-tuned core components
(TrackHeader, MixerPanel, PianoRoll, SequencerEditor, Toolbar, Knob, VerticalFader) to a
specific look and feel. Your job is to **harmonize** with that, not override it.

**Principles over prescriptions.** Read `.claude/references/design-patterns.md` for the full
principle set. Don't memorize pixel values — learn the patterns from existing code.

## When to Use

- **Mandatory**: Any change to `src/components/**/*.tsx`
- **Mandatory**: Any change to `src/themes/` or `src/index.css`
- **Recommended**: Any new UI feature
- **Recommended**: Before any release

## Phase 1: Study the Reference

Before evaluating ANY UI change, find the closest existing component:

| Building... | Study first |
|------------|-------------|
| Track UI | `src/components/tracks/TrackHeader.tsx` |
| Mixer/channel | `src/components/mixer/MixerPanel.tsx` |
| Transport/toolbar | `src/components/layout/Toolbar.tsx` |
| Note editing | `src/components/pianoroll/PianoRoll.tsx` |
| Pattern/step UI | `src/components/sequencer/SequencerEditor.tsx` |
| Rotary controls | `src/components/ui/Knob.tsx` |
| Faders/sliders | `src/components/mixer/VerticalFader.tsx` |
| Effects/device UI | `src/components/mixer/EffectCards.tsx` |

**Read the reference.** Note its:
- Padding and gap values
- Surface colors used (which `daw-*` tokens)
- Font sizes and families
- How it handles hover, selected, disabled states
- How dense or spacious it feels

Now ask: **Does the new/changed code match this reference's feel?**

## Phase 2: Automated Consistency Checks

These grep checks catch mechanical issues — things that break themes or violate the token system.

### 2.1 Design Token Usage

```bash
# Hardcoded hex colors in new/changed component files (should be 0 for new code)
grep -rn '#[0-9a-fA-F]\{3,8\}' [changed-files] | grep -v test | grep -v __tests__

# Hardcoded rgb/rgba
grep -rn 'rgb\(|rgba\(' [changed-files] | grep -v test

# Inline color styles
grep -rn "color:\s*['\"]#" [changed-files]
```

**Principle**: All colors come from theme tokens (`var(--daw-*)` or Tailwind `bg-daw-*`, `text-daw-*`, etc.)

**Exceptions** (don't flag these):
- Canvas rendering code (accesses tokens via JS)
- Meter gradient stops (`meter-colors.ts`)
- Hardcoded values in existing components (hand-tuned, don't touch)

### 2.2 Spacing Consistency

```bash
# Arbitrary pixel values in className (not inherently wrong, but worth reviewing)
grep -rn '\-\[.*px\]' [changed-files] | grep -v test
```

**Principle**: Prefer Tailwind spacing scale. But if the reference component uses an arbitrary value, match it rather than "fixing" it to the scale.

### 2.3 Font Usage

```bash
# Font family overrides (should be rare)
grep -rn 'font-family\|fontFamily' [changed-files]

# Check: numeric values should use font-mono
grep -rn 'font-sans' [changed-files] | grep -i 'bpm\|db\|time\|beat\|bar'
```

**Principle**: `font-sans` (Inter) for text, `font-mono` (JetBrains Mono) for numbers that users compare.

## Phase 3: Principle-Based Evaluation

For each principle, compare the changed code against the reference component.

### 3.1 Does it harmonize with adjacent components?

Open the reference component. Does the new code's spacing, sizing, and color usage feel like it
belongs in the same app? Or does it feel like it's from a different design system?

**Red flags**:
- Dramatically different padding from neighboring components
- Different font sizes for the same type of content
- Using borders where adjacent components use surface hierarchy (or vice versa)
- Using rounded corners where adjacent components use sharp (or vice versa)

### 3.2 Is the surface hierarchy correct?

```
daw-bg        → App background, gaps between panels
daw-surface   → Panel backgrounds
daw-surface-2 → Interactive items, cards
daw-surface-3 → Elevated elements, dropdowns, tooltips
```

**Check**: If the component is nested inside a panel, does it use a lighter surface than its parent?

### 3.3 Is accent color used for state, not decoration?

Accent color (`daw-accent`) communicates: selected, active, focused, playing.

**Check**: Every use of accent color in the new code — is it communicating state? Or is it decorative?

### 3.4 Are state colors correct?

- Green = active/armed
- Red = recording/error/destructive
- Yellow = solo/warning
- Blue (accent) = selected/focused

**Check**: If the component shows states, does it use the conventional colors?

### 3.5 Is the component appropriately dense?

DAW UI is denser than web UI. But the right density is what the existing components use.

**Check**: Compare padding/gaps to the reference. If they're wildly different, ask why.

## Phase 4: Screenshot Verification (for significant UI changes)

### 4.1 Start the dev server and visually verify

```bash
npm run dev
```

Navigate to the changed component. Check:
- [ ] Does it look like it belongs in this app?
- [ ] Is text readable against all backgrounds?
- [ ] Are interactive elements visually distinct from static elements?
- [ ] Does it degrade gracefully when data is missing (empty state)?

### 4.2 Theme spot-check

Switch to at least 2 themes:
```js
document.documentElement.setAttribute('data-theme', 'ableton')
document.documentElement.setAttribute('data-theme', 'logic-pro')
```

Check: Do hardcoded colors bleed through? Is hierarchy still visible?

## Phase 5: Competitive Awareness (for new features only)

For entirely new UI features (not modifications to existing ones):

### 5.1 Proactive Competitive Research

**Before evaluating**, use WebSearch to find how competitors handle this specific UI pattern:

```
Search: "[feature name] UI [Ableton / Logic Pro / FL Studio / Bitwig] 2025"
Search: "[feature name] best practices DAW UI design"
```

Look for:
- **Screenshots or videos** of how competitors implement this exact feature
- **User complaints** about competitor implementations (what to avoid)
- **Innovative approaches** from newer DAWs (Bitwig, BandLab) that break conventions

Document findings briefly:
```
Competitor research for [feature]:
- Ableton: [1 sentence on their approach]
- Logic: [1 sentence on their approach]
- Best insight: [the one thing we should learn from]
```

### 5.2 Reference Points

### How would Ableton approach this?
Ableton = brutalist minimalism. Functional color only. Maximum density. Strict grid.

### How would Logic Pro approach this?
Logic = Apple refinement. Subtle depth. Warm neutrals. Precise spacing.

### The ACE-Step balance
ACE-Step aims for Logic's refinement + Ableton's density + unique AI identity.

**Don't copy either verbatim.** Use them as reference points, then match the existing ACE-Step feel.

## Output Format

```markdown
## Design Review: [component/feature name]

### Reference Component Studied
[Which existing component did you compare against?]

### Automated Checks
| Check | Result | Notes |
|-------|--------|-------|
| Token compliance | PASS/FAIL | |
| Spacing consistency | PASS/INFO | |
| Font usage | PASS/FAIL | |

### Principle Evaluation
| Principle | Assessment |
|-----------|-----------|
| Harmonizes with existing | YES/NO — [details] |
| Surface hierarchy correct | YES/NO |
| Accent color for state only | YES/NO |
| State colors conventional | YES/NO |
| Density appropriate | YES/NO — compared to [reference] |

### Overall: PASS / NEEDS WORK
[Summary of key findings]
```

## What Agents Get Wrong (avoid these)

1. **"Fixing" hand-tuned design**: Changing existing spacing/colors to match an abstract ideal
2. **Over-spacing**: Web app padding (p-4 everywhere) in a DAW context
3. **Over-bordering**: Boxing everything instead of using surface hierarchy
4. **Accent abuse**: Making decorative elements accent-colored
5. **Decoration**: Adding shadows/gradients/animations that serve no function
6. **Ignoring the reference**: Building a component without first reading the closest existing one
7. **Seesaw optimization**: Changing A to fix B, then changing B back to fix A
