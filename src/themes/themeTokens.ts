export type ThemeId = 'ace-studio' | 'ableton' | 'logic-pro' | 'fl-studio' | 'pro-tools';

export interface ThemeTokens {
  // Core surfaces
  'daw-bg': string;
  'daw-surface': string;
  'daw-surface-2': string;
  'daw-surface-3': string;
  // Borders
  'daw-border': string;
  'daw-border-strong': string;
  // Hover
  'daw-hover': string;
  'daw-hover-subtle': string;
  // Text
  'daw-text-muted': string;
  // Accents
  'daw-accent': string;
  'daw-accent-hover': string;
  'daw-playhead': string;
  // Arrangement
  'daw-arrangement-header-bg': string;
  'daw-arrangement-group-bg': string;
  'daw-arrangement-empty-lane-bg': string;
  'daw-arrangement-separator': string;
  // Grid
  'daw-grid-bar': string;
  'daw-grid-beat': string;
  'daw-grid-eighth': string;
  'daw-grid-sub': string;
  // Selection / regions
  'daw-track-selected': string;
  'daw-region-audio': string;
  'daw-region-midi': string;
  'daw-region-drummer': string;
  'daw-region-sample': string;
  // Scrollbar & slider (previously hardcoded)
  'daw-scrollbar': string;
  'daw-scrollbar-hover': string;
  'daw-slider-thumb': string;
  'daw-slider-thumb-hover': string;
  'daw-focus-ring': string;
}

export interface ThemeDefinition {
  id: ThemeId;
  name: string;
  description: string;
  tokens: ThemeTokens;
}
