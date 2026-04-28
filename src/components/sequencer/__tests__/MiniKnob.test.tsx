import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MiniKnob } from '../MiniKnob';

vi.mock('../../../hooks/useNonPassiveWheel', () => ({
  useNonPassiveWheel: () => () => {},
}));

function renderKnob(overrides: Partial<Parameters<typeof MiniKnob>[0]> = {}) {
  const defaults = {
    value: 0.5,
    min: 0,
    max: 1,
    onChange: vi.fn(),
  };
  const props = { ...defaults, ...overrides };
  return { ...render(<MiniKnob {...props} />), props };
}

describe('MiniKnob', () => {
  it('renders with slider role', () => {
    renderKnob();
    expect(screen.getByRole('slider')).toBeInTheDocument();
  });

  it('sets correct aria attributes', () => {
    renderKnob({ value: 0.5, min: 0, max: 1 });
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuenow')).toBe('0.5');
    expect(slider.getAttribute('aria-valuemin')).toBe('0');
    expect(slider.getAttribute('aria-valuemax')).toBe('1');
  });

  it('displays label when provided', () => {
    renderKnob({ label: 'Swing' });
    expect(screen.getByText('Swing')).toBeInTheDocument();
  });

  it('does not display label when not provided', () => {
    const { container } = renderKnob();
    const labels = container.querySelectorAll('span');
    // Should not have a label span (only the SVG)
    const labelTexts = Array.from(labels).filter(
      (s) => s.classList.contains('text-[7px]'),
    );
    expect(labelTexts).toHaveLength(0);
  });

  it('shows correct display value for unipolar knob (0-1)', () => {
    renderKnob({ value: 0.75, min: 0, max: 1, label: 'Vol' });
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuetext')).toBe('75%');
  });

  it('shows correct display value for bipolar knob', () => {
    renderKnob({ value: -0.5, min: -1, max: 1, bipolar: true, label: 'Pan' });
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuetext')).toBe('-50%');
  });

  it('shows + prefix for positive bipolar values', () => {
    renderKnob({ value: 0.3, min: -1, max: 1, bipolar: true, label: 'Pan' });
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-valuetext')).toBe('+30%');
  });

  it('resets to min on double-click for unipolar', () => {
    const { props } = renderKnob({ value: 0.8, min: 0, max: 1 });
    fireEvent.doubleClick(screen.getByRole('slider'));
    expect(props.onChange).toHaveBeenCalledWith(0);
  });

  it('resets to center on double-click for bipolar', () => {
    const { props } = renderKnob({
      value: -0.5,
      min: -1,
      max: 1,
      bipolar: true,
    });
    fireEvent.doubleClick(screen.getByRole('slider'));
    expect(props.onChange).toHaveBeenCalledWith(0);
  });

  it('responds to ArrowUp key', () => {
    const { props } = renderKnob({ value: 0.5, min: 0, max: 1 });
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowUp' });
    expect(props.onChange).toHaveBeenCalledWith(0.51);
  });

  it('responds to ArrowDown key', () => {
    const { props } = renderKnob({ value: 0.5, min: 0, max: 1 });
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'ArrowDown' });
    expect(props.onChange).toHaveBeenCalledWith(0.49);
  });

  it('responds to Home key to set min', () => {
    const { props } = renderKnob({ value: 0.5, min: 0, max: 1 });
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'Home' });
    expect(props.onChange).toHaveBeenCalledWith(0);
  });

  it('responds to End key to set max', () => {
    const { props } = renderKnob({ value: 0.5, min: 0, max: 1 });
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'End' });
    expect(props.onChange).toHaveBeenCalledWith(1);
  });

  it('responds to PageUp for coarse step', () => {
    const { props } = renderKnob({ value: 0.5, min: 0, max: 1 });
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'PageUp' });
    expect(props.onChange).toHaveBeenCalledWith(0.6);
  });

  it('clamps value at max', () => {
    const { props } = renderKnob({ value: 0.99, min: 0, max: 1 });
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'PageUp' });
    expect(props.onChange).toHaveBeenCalledWith(1);
  });

  it('clamps value at min', () => {
    const { props } = renderKnob({ value: 0.05, min: 0, max: 1 });
    fireEvent.keyDown(screen.getByRole('slider'), { key: 'PageDown' });
    expect(props.onChange).toHaveBeenCalledWith(0);
  });

  it('renders SVG with correct size', () => {
    const { container } = renderKnob({ size: 24 });
    const svg = container.querySelector('svg');
    expect(svg?.getAttribute('width')).toBe('24');
    expect(svg?.getAttribute('height')).toBe('24');
  });

  it('opens precision input on right-click', () => {
    renderKnob({ value: 0.5, min: 0, max: 1, label: 'Vol' });
    fireEvent.contextMenu(screen.getByRole('slider'));
    // PrecisionInput should appear
    expect(screen.getByRole('spinbutton')).toBeInTheDocument();
  });

  it('has correct aria-label', () => {
    renderKnob({ label: 'Volume' });
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-label')).toBe('Volume mini knob');
  });

  it('uses default label in aria when no label provided', () => {
    renderKnob();
    const slider = screen.getByRole('slider');
    expect(slider.getAttribute('aria-label')).toBe('Control mini knob');
  });
});
