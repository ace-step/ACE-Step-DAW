import type { ThemeDefinition } from './themeTokens';

export const aceStudioTheme: ThemeDefinition = {
  id: 'ace-studio',
  name: 'ACE Studio',
  description: 'Modern AI-native dark theme with blue→purple signature',
  tokens: {
    // Surface system — deeper blacks with clear layer separation (≥15 lightness apart)
    'daw-bg': '#0f1014',
    'daw-surface': '#16171c',
    'daw-surface-2': '#1e2027',
    'daw-surface-3': '#282a33',
    // Borders — subtle but visible
    'daw-border': '#2D3039',
    'daw-border-strong': '#3D4049',
    // Hover
    'daw-hover': '#2D3039',
    'daw-hover-subtle': '#232630',
    // Text — warm white hierarchy
    'daw-text-muted': '#9BA1AB',
    // Accent — unified blue→purple ("ACE gradient" primary)
    'daw-accent': '#4A7AFF',
    'daw-accent-hover': '#5B8AFF',
    'daw-playhead': '#7B5EFF',
    // Arrangement
    'daw-arrangement-header-bg': '#16171c',
    'daw-arrangement-group-bg': '#1e2027',
    'daw-arrangement-empty-lane-bg': '#12131a',
    'daw-arrangement-separator': '#2D3039',
    // Grid — precise tool, not visual noise
    'daw-grid-bar': '#3A3D47',
    'daw-grid-beat': '#2A2D35',
    'daw-grid-eighth': '#22252C',
    'daw-grid-sub': '#1C1F26',
    // Selection / regions
    'daw-track-selected': '#1E2448',
    'daw-region-audio': '#4a8cc7',
    'daw-region-midi': '#5cb85c',
    'daw-region-drummer': '#d4a843',
    'daw-region-sample': '#9b59b6',
    // Scrollbar & slider
    'daw-scrollbar': '#3A3D47',
    'daw-scrollbar-hover': '#4A4D57',
    'daw-slider-thumb': '#4A7AFF',
    'daw-slider-thumb-hover': '#5B8AFF',
    'daw-focus-ring': 'rgba(74, 122, 255, 0.5)',
  },
};
