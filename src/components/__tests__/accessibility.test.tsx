/**
 * Comprehensive accessibility tests for WCAG 2.1 AA compliance.
 * Covers: ARIA attributes, keyboard navigation, focus management,
 * screen reader support, and dialog semantics.
 * Issue: #975
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MiniKnob } from '../sequencer/MiniKnob';
import { DualRangeSlider } from '../ui/DualRangeSlider';
import { HSlider } from '../ui/HSlider';
import { DialogTransition } from '../ui/DialogTransition';

describe('Accessibility — WCAG 2.1 AA', () => {
  // ─── MiniKnob ─────────────────────────────────────────────

  describe('MiniKnob', () => {
    const defaultProps = {
      value: 0.5,
      min: 0,
      max: 1,
      onChange: vi.fn(),
      label: 'Pan',
    };

    beforeEach(() => {
      defaultProps.onChange.mockClear();
    });

    it('has role="slider" with correct ARIA attributes', () => {
      render(<MiniKnob {...defaultProps} />);
      const knob = screen.getByRole('slider');
      expect(knob).toBeTruthy();
      expect(knob.getAttribute('aria-valuenow')).toBe('0.5');
      expect(knob.getAttribute('aria-valuemin')).toBe('0');
      expect(knob.getAttribute('aria-valuemax')).toBe('1');
      expect(knob.getAttribute('aria-label')).toBe('Pan knob');
    });

    it('provides aria-valuetext for screen readers', () => {
      render(<MiniKnob {...defaultProps} />);
      const knob = screen.getByRole('slider');
      expect(knob.getAttribute('aria-valuetext')).toBe('50%');
    });

    it('provides bipolar aria-valuetext', () => {
      render(<MiniKnob {...defaultProps} value={0.3} bipolar />);
      const knob = screen.getByRole('slider');
      expect(knob.getAttribute('aria-valuetext')).toBe('+30%');
    });

    it('is focusable via tabIndex', () => {
      render(<MiniKnob {...defaultProps} />);
      const knob = screen.getByRole('slider');
      expect(knob.getAttribute('tabindex')).toBe('0');
    });

    it('responds to ArrowUp key', () => {
      render(<MiniKnob {...defaultProps} />);
      const knob = screen.getByRole('slider');
      fireEvent.keyDown(knob, { key: 'ArrowUp' });
      expect(defaultProps.onChange).toHaveBeenCalled();
      const newVal = defaultProps.onChange.mock.calls[0][0];
      expect(newVal).toBeGreaterThan(0.5);
    });

    it('responds to ArrowDown key', () => {
      render(<MiniKnob {...defaultProps} />);
      const knob = screen.getByRole('slider');
      fireEvent.keyDown(knob, { key: 'ArrowDown' });
      expect(defaultProps.onChange).toHaveBeenCalled();
      const newVal = defaultProps.onChange.mock.calls[0][0];
      expect(newVal).toBeLessThan(0.5);
    });

    it('responds to Home key (set to min)', () => {
      render(<MiniKnob {...defaultProps} />);
      const knob = screen.getByRole('slider');
      fireEvent.keyDown(knob, { key: 'Home' });
      expect(defaultProps.onChange).toHaveBeenCalledWith(0);
    });

    it('responds to End key (set to max)', () => {
      render(<MiniKnob {...defaultProps} />);
      const knob = screen.getByRole('slider');
      fireEvent.keyDown(knob, { key: 'End' });
      expect(defaultProps.onChange).toHaveBeenCalledWith(1);
    });
  });

  // ─── DualRangeSlider ──────────────────────────────────────

  describe('DualRangeSlider', () => {
    const defaultProps = {
      min: 0,
      max: 30,
      startValue: 5,
      endValue: 25,
      onChange: vi.fn(),
      minSpan: 0.5,
      step: 0.1,
    };

    beforeEach(() => {
      defaultProps.onChange.mockClear();
    });

    it('renders two slider roles for start and end handles', () => {
      render(<DualRangeSlider {...defaultProps} />);
      const sliders = screen.getAllByRole('slider');
      expect(sliders.length).toBe(2);
    });

    it('start handle has correct ARIA attributes', () => {
      render(<DualRangeSlider {...defaultProps} />);
      const startSlider = screen.getByLabelText('Range start');
      expect(startSlider.getAttribute('role')).toBe('slider');
      expect(startSlider.getAttribute('aria-valuenow')).toBe('5');
      expect(startSlider.getAttribute('aria-valuemin')).toBe('0');
      expect(startSlider.getAttribute('tabindex')).toBe('0');
    });

    it('end handle has correct ARIA attributes', () => {
      render(<DualRangeSlider {...defaultProps} />);
      const endSlider = screen.getByLabelText('Range end');
      expect(endSlider.getAttribute('role')).toBe('slider');
      expect(endSlider.getAttribute('aria-valuenow')).toBe('25');
      expect(endSlider.getAttribute('aria-valuemax')).toBe('30');
      expect(endSlider.getAttribute('tabindex')).toBe('0');
    });

    it('start handle has aria-valuetext', () => {
      render(<DualRangeSlider {...defaultProps} />);
      const startSlider = screen.getByLabelText('Range start');
      expect(startSlider.getAttribute('aria-valuetext')).toBeTruthy();
    });

    it('start handle responds to ArrowRight key', () => {
      render(<DualRangeSlider {...defaultProps} />);
      const startSlider = screen.getByLabelText('Range start');
      fireEvent.keyDown(startSlider, { key: 'ArrowRight' });
      expect(defaultProps.onChange).toHaveBeenCalled();
      const [newStart] = defaultProps.onChange.mock.calls[0];
      expect(newStart).toBeGreaterThan(5);
    });

    it('end handle responds to ArrowLeft key', () => {
      render(<DualRangeSlider {...defaultProps} />);
      const endSlider = screen.getByLabelText('Range end');
      fireEvent.keyDown(endSlider, { key: 'ArrowLeft' });
      expect(defaultProps.onChange).toHaveBeenCalled();
      const [, newEnd] = defaultProps.onChange.mock.calls[0];
      expect(newEnd).toBeLessThan(25);
    });
  });

  // ─── HSlider ──────────────────────────────────────────────

  describe('HSlider aria-valuetext', () => {
    it('provides aria-valuetext with displayValue', () => {
      render(
        <HSlider value={0.5} onChange={vi.fn()} displayValue="50%" label="Volume" />
      );
      const slider = screen.getByRole('slider');
      expect(slider.getAttribute('aria-valuetext')).toBe('50%');
    });

    it('provides aria-valuetext as percentage when no displayValue', () => {
      render(
        <HSlider value={0.5} onChange={vi.fn()} label="Volume" />
      );
      const slider = screen.getByRole('slider');
      expect(slider.getAttribute('aria-valuetext')).toBe('50%');
    });
  });

  // ─── DialogTransition ─────────────────────────────────────

  describe('DialogTransition dialog semantics', () => {
    it('renders with role="dialog" and aria-modal', () => {
      render(
        <DialogTransition show={true} ariaLabel="Test Dialog">
          <p>Content</p>
        </DialogTransition>
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog).toBeTruthy();
      expect(dialog.getAttribute('aria-modal')).toBe('true');
      expect(dialog.getAttribute('aria-label')).toBe('Test Dialog');
    });

    it('uses aria-labelledby when provided', () => {
      render(
        <DialogTransition show={true} ariaLabelledBy="my-title">
          <h2 id="my-title">Title</h2>
        </DialogTransition>
      );
      const dialog = screen.getByRole('dialog');
      expect(dialog.getAttribute('aria-labelledby')).toBe('my-title');
      expect(dialog.getAttribute('aria-label')).toBeNull();
    });

    it('does not render when show is false', () => {
      render(
        <DialogTransition show={false} ariaLabel="Hidden Dialog">
          <p>Content</p>
        </DialogTransition>
      );
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
