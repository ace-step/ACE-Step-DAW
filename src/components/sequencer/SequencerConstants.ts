export const FL = {
  bg: '#2a2a2a',
  bgAlt: '#2d2d2d',
  rowBg: '#303030',
  rowBgAlt: '#2d2d2d',
  headerBg: '#1e1e1e',
  stepOff: '#3c3c3c',
  stepOffHover: '#454545',
  beatBg: '#353535',
  border: '#222222',
  borderLight: '#444444',
  barBorder: '#555555',
  text: '#c0c0c0',
  textDim: '#808080',
  textBright: '#e0e0e0',
  accent: '#5a9a3c',
  accentBright: '#7ec55a',
  muteLed: '#2a2a2a',
  muteActive: '#5a9a3c',
  graphBg: '#252525',
  graphGrid: '#333333',
} as const;

export type RowSize = 'compact' | 'normal' | 'expanded';

export const ROW_SIZES: Record<RowSize, { stepH: number; stepW: number }> = {
  compact: { stepH: 20, stepW: 22 },
  normal: { stepH: 28, stepW: 28 },
  expanded: { stepH: 36, stepW: 34 },
};

export const ROW_LABEL_W = 160;
export const GRAPH_H = 64;

export const ROW_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e',
];
