/**
 * Regression tests for Accessibility ARIA Compliance Sprint.
 *
 * Verifies that interactive components have proper ARIA attributes
 * as required by store-api.md: "Every clickable element MUST have an
 * aria-label or role so browser automation tools can discover and
 * interact via accessibility tree."
 *
 * NOTE: These tests use source-file assertions as a lightweight guard.
 * Full RTL rendering tests for EffectChain/AiMixPanel require complex
 * store mocking and are better suited to component-level test files.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

function readSource(path: string): string {
  return readFileSync(path, 'utf-8');
}

/** Extract a block of source around a marker string, or fail if not found. */
function extractBlock(source: string, marker: string, radius = 400): string {
  const idx = source.indexOf(marker);
  expect(idx, `Expected to find "${marker}" in source`).toBeGreaterThanOrEqual(0);
  return source.slice(Math.max(0, idx - radius), idx + radius);
}

// ── 1. Knob component — already has full ARIA support ────────────────────────

describe('Knob component — ARIA attributes', () => {
  it('has role="slider" and required ARIA attributes', () => {
    const source = readSource('src/components/ui/Knob.tsx');
    expect(source).toContain('role="slider"');
    expect(source).toContain('aria-valuenow');
    expect(source).toContain('aria-valuemin');
    expect(source).toContain('aria-valuemax');
    expect(source).toContain('aria-valuetext');
    expect(source).toContain('aria-label');
    expect(source).toContain('tabIndex');
  });
});

// ── 2. EffectChain — preset dropdown ────────────────────────────────────────

describe('EffectChain — preset dropdown ARIA', () => {
  const source = readSource('src/components/mixer/EffectChain.tsx');

  it('preset dropdown has role="menu" with aria-label using display name', () => {
    const block = extractBlock(source, 'showPresets && (');
    expect(block).toContain('role="menu"');
    expect(block).toContain('aria-label=');
    expect(block).toContain('EFFECT_DISPLAY_NAMES');
  });

  it('preset items have role="menuitem"', () => {
    const block = extractBlock(source, 'presets.map');
    expect(block).toContain('role="menuitem"');
  });

  it('preset dropdown has keyboard navigation (onKeyDown)', () => {
    const block = extractBlock(source, 'showPresets && (', 1200);
    expect(block).toContain('onKeyDown');
    expect(block).toContain('ArrowDown');
    expect(block).toContain('Escape');
  });

  it('preset dropdown is focusable (tabIndex)', () => {
    const block = extractBlock(source, 'showPresets && (', 500);
    expect(block).toContain('tabIndex={-1}');
  });

  it('presets button has aria-haspopup and aria-expanded', () => {
    expect(source).toContain('aria-haspopup="menu"');
    expect(source).toContain('aria-expanded={showPresets}');
  });
});

// ── 3. EffectChain — context menu ───────────────────────────────────────────

describe('EffectChain — context menu ARIA', () => {
  const source = readSource('src/components/mixer/EffectChain.tsx');

  it('context menu has role="menu" with aria-label using display name', () => {
    const block = extractBlock(source, 'ctxMenu && (');
    expect(block).toContain('role="menu"');
    expect(block).toContain('aria-label=');
    expect(block).toContain('EFFECT_DISPLAY_NAMES');
  });

  it('context menu items have role="menuitem" (at least 3)', () => {
    const block = extractBlock(source, 'ctxMenu && (', 1500);
    const count = (block.match(/role="menuitem"/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it('context menu has role="separator" for divider', () => {
    const block = extractBlock(source, 'ctxMenu && (', 2500);
    expect(block).toContain('role="separator"');
  });

  it('context menu has keyboard navigation (onKeyDown)', () => {
    const block = extractBlock(source, 'ctxMenu && (', 1000);
    expect(block).toContain('onKeyDown');
    expect(block).toContain('ArrowDown');
    expect(block).toContain('Escape');
  });

  it('context menu is focusable (tabIndex)', () => {
    const block = extractBlock(source, 'ctxMenu && (', 500);
    expect(block).toContain('tabIndex={-1}');
  });
});

// ── 4. EffectChain — collapse button ────────────────────────────────────────

describe('EffectChain — collapse button ARIA', () => {
  const source = readSource('src/components/mixer/EffectChain.tsx');

  it('collapse button has aria-expanded and descriptive aria-label', () => {
    const block = extractBlock(source, 'aria-expanded={!collapsed}');
    expect(block).toContain('aria-expanded={!collapsed}');
    expect(block).toMatch(/aria-label=.*Expand/);
    expect(block).toMatch(/aria-label=.*Collapse/);
    expect(block).toContain('EFFECT_DISPLAY_NAMES');
  });
});

// ── 5. AiMixPanel — track suggestion toggle ─────────────────────────────────

describe('AiMixPanel — ARIA compliance', () => {
  const source = readSource('src/components/mixer/AiMixPanel.tsx');

  it('track suggestion toggle has aria-expanded', () => {
    expect(source).toContain('aria-expanded={expanded}');
  });

  it('track suggestion toggle has descriptive aria-label', () => {
    const block = extractBlock(source, 'aria-expanded={expanded}');
    expect(block).toMatch(/aria-label=.*suggestions/);
  });
});
