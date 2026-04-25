import type { ThemeDefinition } from './themeTokens';

/**
 * Logic Pro — Apple dark mode inspired.
 *
 * Sourced from Apple's official iOS/macOS dark mode system colors:
 *   systemBackground:           #000000 (pure black on OLED, we use elevated)
 *   secondarySystemBackground:  #1c1c1e (28, 28, 30)
 *   tertiarySystemBackground:   #2c2c2e (44, 44, 46)
 *   systemGray:   #8e8e93 (142, 142, 147)
 *   systemGray2:  #636366 (99, 99, 102)
 *   systemGray3:  #48484a (72, 72, 74)
 *   systemGray4:  #3a3a3c (58, 58, 60)
 *   systemGray5:  #2c2c2e (44, 44, 46)
 *   systemGray6:  #1c1c1e (28, 28, 30)
 *   separator:    rgba(84, 84, 88, 0.6)
 *   systemBlue:   #0a84ff
 *
 * Logic Pro's essence: Apple's refined dark aesthetic with premium feel.
 * Uses the "elevated" dark mode (not pure black) — secondarySystemBackground
 * (#1c1c1e) as the base, with tertiarySystemBackground (#2c2c2e) for cards.
 * Region colors follow Logic convention: green=MIDI, blue=audio,
 * yellow=drummer, purple=alchemy/sample. The overall feel is warm despite
 * being dark, with carefully calibrated grey tones that have a very slight
 * warm bias (the 30 in RGB 28,28,30 vs pure 28,28,28).
 */
export const logicProTheme: ThemeDefinition = {
  id: 'logic-pro',
  name: 'Logic Pro',
  description: 'Apple dark mode — refined, warm, premium',
  tokens: {
    // secondarySystemBackground — Logic's primary workspace background
    'daw-bg': '#1c1c1e',
    // tertiarySystemBackground — elevated surfaces (panels, sidebars)
    'daw-surface': '#2c2c2e',
    // systemGray4 — control surfaces, cards
    'daw-surface-2': '#3a3a3c',
    // Between secondary and tertiary — toolbar area
    'daw-surface-3': '#242426',
    // systemGray3 — borders and separators
    'daw-border': '#48484a',
    // Darker than background for strong separation
    'daw-border-strong': '#0a0a0a',
    // Slightly above systemGray4 for hover
    'daw-hover': '#404042',
    'daw-hover-subtle': '#38383a',
    // systemGray — secondary text
    'daw-text-muted': '#a8a8ad',
    // Apple systemBlue — Logic's primary accent
    'daw-accent': '#0a84ff',
    // Lighter blue for hover
    'daw-accent-hover': '#409cff',
    // Logic uses a purple playhead (systemPurple)
    'daw-playhead': '#bf5af2',
    // Arrangement backgrounds — slightly elevated from base
    'daw-arrangement-header-bg': '#242426',
    'daw-arrangement-group-bg': '#2c2c2e',
    'daw-arrangement-empty-lane-bg': '#1c1c1e',
    // Separator — Apple uses semi-transparent separators
    'daw-arrangement-separator': '#48484a',
    // Grid lines — moderate visibility (Apple prefers cleaner grids)
    'daw-grid-bar': '#636366',
    'daw-grid-beat': '#48484a',
    'daw-grid-eighth': '#2c2c2e',
    'daw-grid-sub': '#242426',
    // Selected track — blue tinted background
    'daw-track-selected': '#0a3d6e',
    // Logic region colors — faithful to Logic's track type conventions
    // Audio = blue, Software Instruments = green, Drummer = yellow, Alchemy = purple
    'daw-region-audio': '#5ac8fa',
    'daw-region-midi': '#30d158',
    'daw-region-drummer': '#ffd60a',
    'daw-region-sample': '#bf5af2',
    // Scrollbar — systemGray3
    'daw-scrollbar': '#48484a',
    'daw-scrollbar-hover': '#636366',
    // Slider — matches accent blue
    'daw-slider-thumb': '#0a84ff',
    'daw-slider-thumb-hover': '#409cff',
    // Focus ring — blue
    'daw-focus-ring': 'rgba(10, 132, 255, 0.6)',
    // Shadows — Apple refined: warm tint, layered with 1px inset glow
    'daw-shadow-sm': '0 1px 2px rgba(0, 0, 0, 0.2)',
    'daw-shadow-md': '0 2px 8px rgba(0, 0, 0, 0.3)',
    'daw-shadow-lg': '0 4px 16px rgba(0, 0, 0, 0.35), 0 0 0 1px rgba(255, 255, 255, 0.05)',
    'daw-shadow-xl': '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.06)',
    'daw-shadow-inset': 'inset 0 1px 3px rgba(0, 0, 0, 0.2)',
    // Glass — Apple's signature vibrancy/frosted effect
    'daw-glass-bg': 'rgba(28, 28, 30, 0.8)',
    'daw-glass-border': 'rgba(255, 255, 255, 0.08)',
  },
};
