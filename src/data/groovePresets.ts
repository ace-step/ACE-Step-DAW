import type { GrooveTemplate } from '../types/project';

/**
 * Built-in groove presets inspired by classic hardware and DAW groove templates.
 * These can be loaded into a project's groovePool on demand.
 */

function preset(
  id: string,
  name: string,
  timingOffsets: number[],
  velocityPattern: number[],
  gridBeats: number,
  lengthBeats: number,
): Omit<GrooveTemplate, 'createdAt'> {
  return { id, name, timingOffsets, velocityPattern, gridBeats, lengthBeats };
}

export const GROOVE_PRESETS: Omit<GrooveTemplate, 'createdAt'>[] = [
  // ── Swing ──────────────────────────────────────────────────────────────────
  preset(
    'preset-swing-light',
    'Swing Light (54%)',
    [0, 0.02, 0, 0.02],
    [1.0, 0.75, 0.9, 0.7],
    0.25, 1,
  ),
  preset(
    'preset-swing-medium',
    'Swing Medium (62%)',
    [0, 0.04, 0, 0.04],
    [1.0, 0.7, 0.85, 0.65],
    0.25, 1,
  ),
  preset(
    'preset-swing-heavy',
    'Swing Heavy (71%)',
    [0, 0.065, 0, 0.065],
    [1.0, 0.6, 0.8, 0.55],
    0.25, 1,
  ),

  // ── Shuffle ────────────────────────────────────────────────────────────────
  preset(
    'preset-shuffle-8th',
    'Shuffle 8ths',
    [0, 0.05],
    [1.0, 0.7],
    0.5, 1,
  ),

  // ── MPC-style ──────────────────────────────────────────────────────────────
  preset(
    'preset-mpc-tight',
    'MPC Tight',
    [0, 0.008, -0.005, 0.012],
    [1.0, 0.82, 0.9, 0.78],
    0.25, 1,
  ),
  preset(
    'preset-mpc-lazy',
    'MPC Lazy',
    [0, 0.025, 0.01, 0.035],
    [1.0, 0.68, 0.85, 0.62],
    0.25, 1,
  ),

  // ── Humanize ───────────────────────────────────────────────────────────────
  preset(
    'preset-humanize-subtle',
    'Humanize Subtle',
    [0.003, -0.002, 0.004, -0.003],
    [0.95, 1.02, 0.97, 1.0],
    0.25, 1,
  ),
  preset(
    'preset-humanize-loose',
    'Humanize Loose',
    [0.01, -0.008, 0.012, -0.006],
    [0.88, 1.05, 0.92, 1.08],
    0.25, 1,
  ),
];
