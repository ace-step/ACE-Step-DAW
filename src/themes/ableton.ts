import type { ThemeDefinition } from './themeTokens';

/**
 * Ableton Live 12 — Dark theme inspired.
 *
 * Sourced from Ableton's .ask theme XML parameters (hex format, Live 12+).
 *
 * Core philosophy: Brutalist minimalism. Near-zero depth hierarchy — no
 * gradients, no shadows, everything lives on the same visual plane.
 * Deliberately low contrast between adjacent elements creates a unified,
 * calm workspace. Grid lines are barely visible (alpha ~0x19 = 10%).
 *
 * Key Ableton parameters mapped to our tokens:
 *   Desktop (#22242a)            → daw-bg
 *   SurfaceArea (#1d1f23)        → daw-surface
 *   SurfaceBackground (#2f3138)  → daw-surface-2
 *   ControlBackground (#3e4045)  → daw-surface-3
 *   ControlForeground (#e6e6e6)  → (text white)
 *   ChosenDefault (#f7a738)      → daw-accent (Ableton's signature amber/orange)
 *   TransportOffBackground (#282828) → transport area
 *   RetroDisplayBackground (#1e1e1e) → display panels
 *   ArrangementRulerMarkings (#949494) → ruler text
 *   ArrangerGridTiles (#0a0a0a19)    → grid (10% opacity = barely visible)
 *   DisplayBackground (#282828)      → display bg
 *   MeterBackground (#1e1e1e)        → meter bg
 */
export const abletonTheme: ThemeDefinition = {
  id: 'ableton',
  name: 'Ableton Live',
  description: 'Brutalist minimalism — flat charcoal with amber accents',
  tokens: {
    // Desktop = deepest background. Slightly blue-shifted dark (#22242a)
    'daw-bg': '#22242a',
    // SurfaceArea = panel backgrounds, slightly darker than SurfaceBackground
    'daw-surface': '#1d1f23',
    // SurfaceBackground = browser bar, detail view, tree column heads
    'daw-surface-2': '#2f3138',
    // ControlBackground = knobs, sliders, control surfaces
    'daw-surface-3': '#3e4045',
    // ControlContrastFrame = subtle borders between elements
    'daw-border': '#3f4446',
    // Near-black for strong separation
    'daw-border-strong': '#141414',
    // SurfaceHighlight = hover states on surfaces
    'daw-hover': '#40434b',
    'daw-hover-subtle': '#373a41',
    // ArrangementRulerMarkings color for muted text
    'daw-text-muted': '#949494',
    // ChosenDefault = Ableton's iconic amber/gold accent
    'daw-accent': '#f7a738',
    // Slightly brighter amber for hover
    'daw-accent-hover': '#faca88',
    // Ableton playhead is a thin white line
    'daw-playhead': '#e6e6e6',
    // DetailViewBackground for header rows
    'daw-arrangement-header-bg': '#373a41',
    // DrumRackScroller1 for grouped rows
    'daw-arrangement-group-bg': '#40434b',
    // Desktop-derived empty lane
    'daw-arrangement-empty-lane-bg': '#1d1f23',
    // Subtle separator from ControlContrastFrame
    'daw-arrangement-separator': '#3f4446',
    // Grid lines: Ableton uses very low opacity (#0a0a0a19 = 10% alpha)
    // We translate to solid equivalents against the #22242a background
    'daw-grid-bar': '#484b52',
    'daw-grid-beat': '#33363d',
    'daw-grid-eighth': '#292c32',
    'daw-grid-sub': '#262930',
    // StandbySelectionBackground for selected track
    'daw-track-selected': '#545a5d',
    // Clip colors — Ableton uses warm, slightly muted clip colors
    'daw-region-audio': '#5a9fd4',
    'daw-region-midi': '#00ff81',
    'daw-region-drummer': '#ffb532',
    'daw-region-sample': '#6dd7ff',
    // ScrollbarInnerHandle
    'daw-scrollbar': '#828282',
    'daw-scrollbar-hover': '#757575',
    // PotiNeedle color for slider thumb (amber to match accent)
    'daw-slider-thumb': '#f9cd90',
    'daw-slider-thumb-hover': '#f7a738',
    // Focus ring matches accent
    'daw-focus-ring': 'rgba(247, 167, 56, 0.5)',
  },
};
