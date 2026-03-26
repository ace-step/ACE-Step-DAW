import type { ThemeDefinition } from './themeTokens';

/**
 * Pro Tools — Dark theme inspired.
 *
 * Pro Tools' essence: The "studio console" look. Everything is deliberately
 * warm — greys have a brownish/olive tint that evokes physical mixing
 * consoles and outboard gear. This is the DAW designed for engineers who
 * stare at screens for 12+ hour sessions.
 *
 * Key characteristics:
 * 1) WARM greys — every grey has slight brown/olive bias (never blue/cool)
 *    Compare: Ableton #22242a (cool) vs Pro Tools #27261f (warm)
 * 2) Medium contrast — not as low as Ableton, not as high as FL Studio
 * 3) Conservative, no-nonsense aesthetic — no flashy colors
 * 4) Amber/gold accent — evokes vintage VU meter illumination
 * 5) Blue for playhead and selection — classic broadcast standard
 * 6) Meter colors follow broadcast standard: green → amber → red
 * 7) Text is warm white (#d4d0c8) not cool white (#e6e6e6)
 *
 * The warmth is the single most important trait. If a Pro Tools user
 * switches to this theme, the warm grey palette should immediately
 * feel like home — like sitting in front of a real mixing console.
 */
export const proToolsTheme: ThemeDefinition = {
  id: 'pro-tools',
  name: 'Pro Tools',
  description: 'Warm studio console — olive greys with amber accents',
  tokens: {
    // Warm dark base — olive-brown undertone
    'daw-bg': '#1e1d18',
    // Edit window surface — warm medium-dark
    'daw-surface': '#27261f',
    // Mix window / elevated panels — warmer mid-grey
    'daw-surface-2': '#33322a',
    // Transport/header bar — between bg and surface
    'daw-surface-3': '#23221c',
    // Warm border — olive tint visible
    'daw-border': '#4a4840',
    // Dark warm border
    'daw-border-strong': '#141310',
    // Hover — warm grey brightened
    'daw-hover': '#3e3d34',
    'daw-hover-subtle': '#33322a',
    // Warm muted text — distinctly NOT cool grey
    'daw-text-muted': '#8a8678',
    // Amber/gold accent — VU meter illumination color
    'daw-accent': '#d4a843',
    'daw-accent-hover': '#e0ba58',
    // Blue playhead — broadcast standard
    'daw-playhead': '#4a7fbf',
    // Arrangement areas — warm tints throughout
    'daw-arrangement-header-bg': '#252420',
    'daw-arrangement-group-bg': '#2c2b24',
    'daw-arrangement-empty-lane-bg': '#1a1914',
    // Warm separator
    'daw-arrangement-separator': '#4a4840',
    // Grid — moderate visibility with warm tone
    'daw-grid-bar': '#5a584e',
    'daw-grid-beat': '#3e3d34',
    'daw-grid-eighth': '#2e2d26',
    'daw-grid-sub': '#27261f',
    // Selected track — amber tinted
    'daw-track-selected': '#3a3420',
    // Region colors — conservative, professional palette
    // Audio = purple/violet (PT signature), MIDI = teal-green, Drummer = amber, Sample = dusty purple
    'daw-region-audio': '#8b6aae',
    'daw-region-midi': '#5a9c8a',
    'daw-region-drummer': '#d4a843',
    'daw-region-sample': '#8a6c9c',
    // Warm scrollbar
    'daw-scrollbar': '#4a4840',
    'daw-scrollbar-hover': '#5a5850',
    // Slider — amber accent
    'daw-slider-thumb': '#d4a843',
    'daw-slider-thumb-hover': '#e0ba58',
    // Focus ring — amber
    'daw-focus-ring': 'rgba(212, 168, 67, 0.5)',
  },
};
