import type { ThemeDefinition } from './themeTokens';

/**
 * FL Studio 21 — Default dark theme inspired.
 *
 * Sourced from FL Studio's theme system and community-documented values:
 *   Default grid color: RGB(52, 68, 78) = #34444e — the signature dark teal-grey
 *   Default note color: #1ec173 (green)
 *   Accent orange: #fdb200 (golden yellow)
 *   Near-black base: #040404
 *
 * FL Studio's essence: Dense, information-rich, "hacker" aesthetic.
 * Much higher contrast than Ableton — individual elements POP against
 * the near-black backgrounds. The signature look comes from:
 * 1) Very dark backgrounds with cool blue-grey tint (not warm like Pro Tools)
 * 2) The unique dark teal-grey (#34444e) used in grids and panels
 * 3) Vibrant green (#1ec173) for MIDI notes and active elements
 * 4) Golden orange (#fdb200) for highlights and selection
 * 5) Dense information display — everything is functional, nothing decorative
 *
 * The channel rack has colored buttons on near-black, the mixer uses
 * dark panels with bright peak meters, and the piano roll has
 * a distinctive dark grid with green notes.
 */
export const flStudioTheme: ThemeDefinition = {
  id: 'fl-studio',
  name: 'FL Studio',
  description: 'Dense, high-contrast dark with teal-grey and green accents',
  tokens: {
    // Near-black base — FL is VERY dark
    'daw-bg': '#0c0e11',
    // Slightly elevated, with FL's signature cool tint
    'daw-surface': '#181c20',
    // FL's characteristic dark teal-grey for panels/grids
    'daw-surface-2': '#242a30',
    // Toolbar/header area — between bg and surface-2
    'daw-surface-3': '#1a1e24',
    // Visible borders — FL has more contrast than Ableton
    'daw-border': '#34444e',
    // Strong separation
    'daw-border-strong': '#080a0c',
    // Hover — brightens the teal-grey tone
    'daw-hover': '#2e3840',
    'daw-hover-subtle': '#222a30',
    // Text — slightly cool, not warm
    'daw-text-muted': '#8a9aa4',
    // FL's golden orange accent for selection/highlights
    'daw-accent': '#fdb200',
    'daw-accent-hover': '#ffc940',
    // Orange playhead — distinctive FL look
    'daw-playhead': '#ff6e00',
    // Arrangement backgrounds — very dark with cool tint
    'daw-arrangement-header-bg': '#141820',
    'daw-arrangement-group-bg': '#1a2028',
    'daw-arrangement-empty-lane-bg': '#0e1014',
    // FL's grid separator — uses the signature teal-grey
    'daw-arrangement-separator': '#34444e',
    // Grid — FL grids have moderate visibility, using the teal-grey palette
    'daw-grid-bar': '#34444e',
    'daw-grid-beat': '#263038',
    'daw-grid-eighth': '#1c2228',
    'daw-grid-sub': '#161c22',
    // Selected track — warm gold tint
    'daw-track-selected': '#2a2410',
    // Region colors — FL uses vibrant, saturated colors
    'daw-region-audio': '#4aa8d8',
    'daw-region-midi': '#1ec173',
    'daw-region-drummer': '#fdb200',
    'daw-region-sample': '#c065e0',
    // Scrollbar
    'daw-scrollbar': '#34444e',
    'daw-scrollbar-hover': '#4a5a64',
    // Slider — green to match FL's primary note color
    'daw-slider-thumb': '#1ec173',
    'daw-slider-thumb-hover': '#30d888',
    // Focus ring — green
    'daw-focus-ring': 'rgba(30, 193, 115, 0.5)',
    // Shadows — FL Studio: deep dark for high contrast
    'daw-shadow-sm': '0 1px 3px rgba(0, 0, 0, 0.5)',
    'daw-shadow-md': '0 2px 8px rgba(0, 0, 0, 0.6)',
    'daw-shadow-lg': '0 4px 16px rgba(0, 0, 0, 0.7)',
    'daw-shadow-xl': '0 8px 24px rgba(0, 0, 0, 0.8)',
    'daw-shadow-inset': 'inset 0 1px 4px rgba(0, 0, 0, 0.4)',
    // Glass — darker, less transparent (FL prefers density)
    'daw-glass-bg': 'rgba(12, 14, 17, 0.9)',
    'daw-glass-border': 'rgba(52, 68, 78, 0.4)',
  },
};
