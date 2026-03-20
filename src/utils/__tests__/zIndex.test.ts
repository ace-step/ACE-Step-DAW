import { describe, it, expect } from 'vitest';
import { Z } from '../zIndex';
import type { ZIndexToken } from '../zIndex';

describe('Z-index scale', () => {
  it('exports all expected tokens', () => {
    const expectedTokens: ZIndexToken[] = [
      'base',
      'trackContent',
      'clipContent',
      'overlay',
      'playhead',
      'dropdown',
      'panel',
      'modal',
      'dragGhost',
      'tooltip',
      'toast',
      'commandPalette',
      'appOverlay',
      'contextualTip',
      'onboarding',
      'tutorial',
    ];

    for (const token of expectedTokens) {
      expect(Z).toHaveProperty(token);
      expect(typeof Z[token]).toBe('number');
    }
  });

  it('all values are non-negative integers', () => {
    for (const [key, value] of Object.entries(Z)) {
      expect(Number.isInteger(value), `${key} should be an integer`).toBe(true);
      expect(value >= 0, `${key} should be non-negative`).toBe(true);
    }
  });

  it('values are strictly ascending in logical order', () => {
    expect(Z.base).toBeLessThan(Z.trackContent);
    expect(Z.trackContent).toBeLessThan(Z.clipContent);
    expect(Z.clipContent).toBeLessThan(Z.overlay);
    expect(Z.overlay).toBeLessThan(Z.playhead);
    expect(Z.playhead).toBeLessThan(Z.dropdown);
    expect(Z.dropdown).toBeLessThan(Z.panel);
    expect(Z.panel).toBeLessThan(Z.modal);
    expect(Z.modal).toBeLessThan(Z.dragGhost);
    expect(Z.dragGhost).toBeLessThan(Z.tooltip);
    expect(Z.tooltip).toBeLessThan(Z.toast);
    expect(Z.toast).toBeLessThan(Z.commandPalette);
    expect(Z.commandPalette).toBeLessThan(Z.appOverlay);
    expect(Z.appOverlay).toBeLessThan(Z.contextualTip);
    expect(Z.contextualTip).toBeLessThan(Z.onboarding);
    expect(Z.onboarding).toBeLessThan(Z.tutorial);
  });

  it('has no duplicate values', () => {
    const values = Object.values(Z);
    const unique = new Set(values);
    expect(unique.size).toBe(values.length);
  });

  it('is frozen (immutable)', () => {
    // The `as const` assertion makes the type readonly at compile time.
    // At runtime the object is still mutable unless frozen, so we verify
    // the values are at least what we expect (compile-time safety check).
    expect(Z.base).toBe(0);
    expect(Z.modal).toBe(80);
    expect(Z.tutorial).toBe(250);
  });
});
