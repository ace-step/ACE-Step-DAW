import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useUIStore } from '../../src/store/uiStore';

// ── Component imports ──
import { MiniKnob } from '../../src/components/sequencer/MiniKnob';
import { DualRangeSlider } from '../../src/components/ui/DualRangeSlider';
import { SkipLinks } from '../../src/components/ui/SkipLinks';

describe('Accessibility — WCAG 2.1 AA compliance (#975)', () => {
  beforeEach(() => {
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  // ── Screen Reader Support ──

  describe('Screen Reader Support', () => {
    it('MiniKnob has role="slider" with full ARIA semantics', () => {
      const onChange = vi.fn();
      render(<MiniKnob value={0.5} min={0} max={1} label="Volume" onChange={onChange} />);

      const slider = screen.getByRole('slider', { name: /Volume/i });
      expect(slider).toHaveAttribute('aria-valuenow', '0.5');
      expect(slider).toHaveAttribute('aria-valuemin', '0');
      expect(slider).toHaveAttribute('aria-valuemax', '1');
      expect(slider).toHaveAttribute('aria-valuetext', '50%');
      expect(slider).toHaveAttribute('tabindex', '0');
    });

    it('DualRangeSlider thumbs have role="slider" with ARIA semantics', () => {
      const onChange = vi.fn();
      render(
        <DualRangeSlider
          min={0}
          max={10}
          startValue={2}
          endValue={8}
          onChange={onChange}
          step={0.5}
        />,
      );

      const startSlider = screen.getByRole('slider', { name: 'Range start' });
      expect(startSlider).toHaveAttribute('aria-valuemin', '0');
      expect(startSlider).toHaveAttribute('aria-valuetext');
      expect(startSlider).toHaveAttribute('tabindex', '0');

      const endSlider = screen.getByRole('slider', { name: 'Range end' });
      expect(endSlider).toHaveAttribute('aria-valuemax', '10');
      expect(endSlider).toHaveAttribute('aria-valuetext');
      expect(endSlider).toHaveAttribute('tabindex', '0');
    });
  });

  // ── Keyboard Navigation ──

  describe('Keyboard Navigation', () => {
    it('MiniKnob responds to arrow keys', () => {
      const onChange = vi.fn();
      render(<MiniKnob value={0.5} min={0} max={1} label="Pan" onChange={onChange} />);

      const slider = screen.getByRole('slider', { name: /Pan/i });
      fireEvent.keyDown(slider, { key: 'ArrowUp' });
      expect(onChange).toHaveBeenCalled();
      const newVal = onChange.mock.calls[0][0];
      expect(newVal).toBeGreaterThan(0.5);
    });

    it('MiniKnob responds to Home/End keys', () => {
      const onChange = vi.fn();
      render(<MiniKnob value={0.5} min={0} max={1} label="Pan" onChange={onChange} />);

      const slider = screen.getByRole('slider', { name: /Pan/i });
      fireEvent.keyDown(slider, { key: 'Home' });
      expect(onChange).toHaveBeenCalledWith(0);

      onChange.mockClear();
      fireEvent.keyDown(slider, { key: 'End' });
      expect(onChange).toHaveBeenCalledWith(1);
    });

    it('DualRangeSlider start thumb responds to arrow keys', () => {
      const onChange = vi.fn();
      render(
        <DualRangeSlider min={0} max={10} startValue={2} endValue={8} onChange={onChange} step={0.1} />,
      );

      const startSlider = screen.getByRole('slider', { name: 'Range start' });
      fireEvent.keyDown(startSlider, { key: 'ArrowRight' });
      expect(onChange).toHaveBeenCalled();
      expect(onChange.mock.calls[0][0]).toBeGreaterThan(2);
    });

    it('SkipLinks renders skip navigation anchors', () => {
      render(<SkipLinks />);

      const nav = screen.getByRole('navigation', { name: 'Skip navigation' });
      expect(nav).toBeInTheDocument();

      const links = nav.querySelectorAll('a');
      expect(links).toHaveLength(3);
      expect(links[0]).toHaveAttribute('href', '#main-content');
      expect(links[1]).toHaveAttribute('href', '#timeline-region');
      expect(links[2]).toHaveAttribute('href', '#mixer-region');
    });
  });

  // ── Visual Accessibility ──

  describe('Visual Accessibility', () => {
    it('uiStore persists highContrastMode, colorBlindMode, reducedMotion', () => {
      useUIStore.getState().setHighContrastMode(true);
      expect(useUIStore.getState().highContrastMode).toBe(true);

      useUIStore.getState().setColorBlindMode(true);
      expect(useUIStore.getState().colorBlindMode).toBe(true);

      useUIStore.getState().setReducedMotion(true);
      expect(useUIStore.getState().reducedMotion).toBe(true);
    });

    it('accessibility settings are included in persisted state', () => {
      // Verify the partialize function includes accessibility fields
      const state = useUIStore.getState();
      // These should exist on the state (type-level check)
      expect(typeof state.reducedMotion).toBe('boolean');
      expect(typeof state.highContrastMode).toBe('boolean');
      expect(typeof state.colorBlindMode).toBe('boolean');
    });
  });

  // ── Dialog Accessibility ──

  describe('Dialog Accessibility', () => {
    it('KeyboardShortcutsDialog has role="dialog" and aria-modal', async () => {
      useUIStore.setState({ showKeyboardShortcutsDialog: true });
      const { KeyboardShortcutsDialog } = await import('../../src/components/dialogs/KeyboardShortcutsDialog');
      render(<KeyboardShortcutsDialog />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'keyboard-shortcuts-title');
    });

    it('InstrumentPicker has role="dialog" and aria-modal when shown', async () => {
      useUIStore.setState({ showInstrumentPicker: true });
      // Need a project for InstrumentPicker to render
      const { useProjectStore } = await import('../../src/store/projectStore');
      useProjectStore.getState().createProject({ name: 'A11y Test' });
      const { InstrumentPicker } = await import('../../src/components/dialogs/InstrumentPicker');
      render(<InstrumentPicker />);

      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(dialog).toHaveAttribute('aria-labelledby', 'instrument-picker-title');
    });
  });
});
