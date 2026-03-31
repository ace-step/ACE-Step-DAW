import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { Knob } from '../Knob';

describe('Knob component', () => {
  const defaultProps = {
    value: 50,
    min: 0,
    max: 100,
    defaultValue: 50,
    onChange: vi.fn(),
  };

  describe('rendering', () => {
    it('renders with aria-label', () => {
      render(<Knob {...defaultProps} label="Volume" />);
      expect(screen.getByLabelText('Volume knob')).toBeDefined();
    });

    it('renders label text', () => {
      render(<Knob {...defaultProps} label="Volume" />);
      expect(screen.getByText('Volume')).toBeDefined();
    });

    it('renders value display', () => {
      render(<Knob {...defaultProps} value={42} step={1} />);
      expect(screen.getByText('42')).toBeDefined();
    });

    it('renders SVG with layered elements', () => {
      const { container } = render(<Knob {...defaultProps} />);
      const svg = container.querySelector('svg');
      expect(svg).toBeDefined();
      // Should have defs with filters/gradients
      expect(svg?.querySelector('defs')).toBeDefined();
      // Should have the knob body circle with gradient fill
      const circles = svg?.querySelectorAll('circle');
      expect(circles!.length).toBeGreaterThanOrEqual(1);
      // Should have track and fill arcs
      const paths = svg?.querySelectorAll('path');
      expect(paths!.length).toBeGreaterThanOrEqual(2);
    });

    it('renders with default size of 32px', () => {
      const { container } = render(<Knob {...defaultProps} />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe('32');
      expect(svg?.getAttribute('height')).toBe('32');
    });
  });

  describe('size variants', () => {
    it('renders sm variant at 24px', () => {
      const { container } = render(<Knob {...defaultProps} variant="sm" />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe('24');
    });

    it('renders md variant at 32px', () => {
      const { container } = render(<Knob {...defaultProps} variant="md" />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe('32');
    });

    it('renders lg variant at 48px', () => {
      const { container } = render(<Knob {...defaultProps} variant="lg" />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe('48');
    });

    it('variant overrides size prop', () => {
      const { container } = render(<Knob {...defaultProps} size={100} variant="sm" />);
      const svg = container.querySelector('svg');
      expect(svg?.getAttribute('width')).toBe('24');
    });
  });

  describe('color prop', () => {
    it('uses default color when not specified', () => {
      const { container } = render(<Knob {...defaultProps} />);
      const svg = container.querySelector('svg');
      // The fill arc should use default blue color
      const paths = svg?.querySelectorAll('path');
      const fillArc = paths?.[1]; // second path is the fill arc
      expect(fillArc?.getAttribute('stroke')).toBe('#4A5FFF');
    });

    it('uses custom color for value arc', () => {
      const { container } = render(<Knob {...defaultProps} color="#f59e0b" />);
      const svg = container.querySelector('svg');
      const paths = svg?.querySelectorAll('path');
      const fillArc = paths?.[1];
      expect(fillArc?.getAttribute('stroke')).toBe('#f59e0b');
    });
  });

  describe('interactions', () => {
    it('calls onChange on double-click to reset', () => {
      const onChange = vi.fn();
      render(<Knob {...defaultProps} value={75} defaultValue={50} onChange={onChange} />);
      const knob = screen.getByLabelText('Control knob');
      fireEvent.doubleClick(knob);
      expect(onChange).toHaveBeenCalledWith(50);
    });

    it('does not respond when disabled', () => {
      const onChange = vi.fn();
      render(<Knob {...defaultProps} disabled onChange={onChange} />);
      const knob = screen.getByLabelText('Control knob');
      fireEvent.doubleClick(knob);
      expect(onChange).not.toHaveBeenCalled();
    });

    it('opens precision input on right-click', () => {
      render(<Knob {...defaultProps} />);
      const knob = screen.getByLabelText('Control knob');
      fireEvent.contextMenu(knob);
      // PrecisionInput should appear
      expect(screen.getByLabelText('Control exact value')).toBeDefined();
    });

    it('reduces opacity when disabled', () => {
      const { container } = render(<Knob {...defaultProps} disabled />);
      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper.className).toContain('opacity-40');
    });
  });

  describe('micro-interactions', () => {
    it('shows fine mode indicator when Alt is held during drag', () => {
      const onChange = vi.fn();
      render(<Knob {...defaultProps} onChange={onChange} />);
      const knob = screen.getByLabelText('Control knob');

      // Start drag
      fireEvent.mouseDown(knob, { clientY: 100 });

      // Simulate Alt+move
      fireEvent(window, new MouseEvent('mousemove', {
        clientY: 90,
        movementY: -10,
        altKey: true,
        bubbles: true,
      }));

      // Should show fine mode indicator
      expect(screen.getByText('Fine')).toBeDefined();

      // Release
      fireEvent(window, new MouseEvent('mouseup', { bubbles: true }));
    });

    it('applies data-dragging attribute during drag', () => {
      render(<Knob {...defaultProps} />);
      const knob = screen.getByLabelText('Control knob');

      // Before drag
      expect(knob.getAttribute('data-dragging')).toBeNull();

      // Start drag
      fireEvent.mouseDown(knob, { clientY: 100 });
      expect(knob.getAttribute('data-dragging')).toBe('true');

      // Release
      fireEvent(window, new MouseEvent('mouseup', { bubbles: true }));
      expect(knob.getAttribute('data-dragging')).toBeNull();
    });

    it('animates reset on double-click by setting data-resetting', () => {
      vi.useFakeTimers();
      const onChange = vi.fn();
      render(<Knob {...defaultProps} value={75} defaultValue={50} onChange={onChange} />);
      const knob = screen.getByLabelText('Control knob');

      fireEvent.doubleClick(knob);
      expect(onChange).toHaveBeenCalledWith(50);

      // data-resetting should be set during animation
      expect(knob.getAttribute('data-resetting')).toBe('true');

      // After animation duration (200ms), data-resetting should clear
      act(() => { vi.advanceTimersByTime(250); });
      expect(knob.getAttribute('data-resetting')).toBeNull();

      vi.useRealTimers();
    });
  });

  describe('value formatting', () => {
    it('formats integer values when step >= 1', () => {
      render(<Knob {...defaultProps} value={42.7} step={1} />);
      expect(screen.getByText('43')).toBeDefined();
    });

    it('formats decimal values when step < 1', () => {
      render(<Knob {...defaultProps} value={0.75} min={0} max={1} step={0.01} />);
      expect(screen.getByText('0.8')).toBeDefined();
    });

    it('uses custom formatValue function when provided', () => {
      render(
        <Knob
          {...defaultProps}
          value={0.5}
          min={0}
          max={1}
          formatValue={(v) => `${Math.round(v * 100)}%`}
        />,
      );
      expect(screen.getByText('50%')).toBeDefined();
    });

    it('displays unit suffix', () => {
      render(<Knob {...defaultProps} value={440} min={20} max={20000} unit=" Hz" step={1} />);
      expect(screen.getByText('440 Hz')).toBeDefined();
    });
  });
});
