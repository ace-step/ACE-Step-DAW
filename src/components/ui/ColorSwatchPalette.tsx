import { TRACK_COLOR_PALETTE } from '../../constants/colorPalette';

interface ColorSwatchPaletteProps {
  /** When true, show a reset (X) button before the color swatches. */
  hasCustomColor: boolean;
  /** Called when the user picks a color from the palette. */
  onAssignColor: (color: string) => void;
  /** Called when the user clicks the reset button. */
  onResetColor: () => void;
  /** aria-label prefix for swatch buttons (e.g. "Assign clip color" or "Assign slot color"). */
  labelPrefix?: string;
  /** aria-label for the reset button. Defaults to "Reset to track color". */
  resetAriaLabel?: string;
  /** data-testid for the wrapper. */
  testId?: string;
}

/**
 * Inline color swatch grid used inside context menus.
 * Shows the 16-color TRACK_COLOR_PALETTE with an optional reset button.
 */
export function ColorSwatchPalette({
  hasCustomColor,
  onAssignColor,
  onResetColor,
  labelPrefix = 'Assign color',
  resetAriaLabel = 'Reset to track color',
  testId = 'color-swatch-palette',
}: ColorSwatchPaletteProps) {
  return (
    <div className="px-2 py-1.5 flex flex-wrap gap-1" data-testid={testId}>
      {hasCustomColor && (
        <button
          type="button"
          aria-label={resetAriaLabel}
          className="w-5 h-5 rounded-full border border-white/20 flex items-center justify-center cursor-pointer hover:border-white/50 transition-colors"
          style={{ backgroundColor: '#555' }}
          onClick={onResetColor}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M2 2L8 8M8 2L2 8" stroke="#aaa" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
      {TRACK_COLOR_PALETTE.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`${labelPrefix} ${color}`}
          className="w-5 h-5 rounded-full border border-white/20 cursor-pointer hover:border-white/50 hover:scale-110 transition-all"
          style={{ backgroundColor: color }}
          onClick={() => onAssignColor(color)}
        />
      ))}
    </div>
  );
}
