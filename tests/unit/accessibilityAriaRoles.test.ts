/**
 * Regression tests for Accessibility ARIA Compliance Sprint.
 *
 * Verifies that interactive components have proper ARIA attributes
 * as required by store-api.md: "Every clickable element MUST have an
 * aria-label or role so browser automation tools can discover and
 * interact via accessibility tree."
 */

import { describe, it, expect } from 'vitest';

// ── 1. Knob component — already has full ARIA support ────────────────────────

describe('Knob component — ARIA attributes', () => {
  it('source code includes role="slider" and required ARIA attributes', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/components/ui/Knob.tsx', 'utf-8');

    expect(source).toContain('role="slider"');
    expect(source).toContain('aria-valuenow');
    expect(source).toContain('aria-valuemin');
    expect(source).toContain('aria-valuemax');
    expect(source).toContain('aria-valuetext');
    expect(source).toContain('aria-label');
    expect(source).toContain('tabIndex');
  });
});

// ── 2. EffectChain — preset dropdown has role="menu" ────────────────────────

describe('EffectChain — menu roles and ARIA', () => {
  it('preset dropdown has role="menu" and aria-label', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/components/mixer/EffectChain.tsx', 'utf-8');

    // Preset dropdown should have role="menu"
    const presetMenuSection = source.slice(
      source.indexOf('showPresets && ('),
      source.indexOf('showPresets && (') + 400,
    );
    expect(presetMenuSection).toContain('role="menu"');
    expect(presetMenuSection).toContain('aria-label');
  });

  it('preset items have role="menuitem"', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/components/mixer/EffectChain.tsx', 'utf-8');

    // Preset buttons should have role="menuitem"
    const presetSection = source.slice(
      source.indexOf('presets.map'),
      source.indexOf('presets.map') + 300,
    );
    expect(presetSection).toContain('role="menuitem"');
  });

  it('context menu has role="menu" and aria-label', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/components/mixer/EffectChain.tsx', 'utf-8');

    // Context menu should have role="menu"
    const ctxMenuSection = source.slice(
      source.indexOf('ctxMenu && ('),
      source.indexOf('ctxMenu && (') + 400,
    );
    expect(ctxMenuSection).toContain('role="menu"');
    expect(ctxMenuSection).toContain('aria-label');
  });

  it('context menu items have role="menuitem"', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/components/mixer/EffectChain.tsx', 'utf-8');

    // Context menu buttons (Duplicate, Move Left, Move Right, Delete) should have role="menuitem"
    const ctxBlock = source.slice(
      source.indexOf('ctxMenu && ('),
      source.indexOf('ctxMenu && (') + 1500,
    );
    // At least 3 menuitem roles (Duplicate, Delete, and at least one Move)
    const menuitemCount = (ctxBlock.match(/role="menuitem"/g) || []).length;
    expect(menuitemCount).toBeGreaterThanOrEqual(3);
  });

  it('context menu has role="separator" for divider', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/components/mixer/EffectChain.tsx', 'utf-8');

    const ctxBlock = source.slice(
      source.indexOf('ctxMenu && ('),
      source.indexOf('ctxMenu && (') + 1500,
    );
    expect(ctxBlock).toContain('role="separator"');
  });

  it('presets button has aria-haspopup and aria-expanded', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/components/mixer/EffectChain.tsx', 'utf-8');

    expect(source).toContain('aria-haspopup="menu"');
    expect(source).toContain('aria-expanded={showPresets}');
  });

  it('collapse button has aria-expanded and aria-label', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/components/mixer/EffectChain.tsx', 'utf-8');

    expect(source).toContain('aria-expanded={!collapsed}');
    // Should have aria-label with Expand/Collapse text
    expect(source).toMatch(/aria-label=.*Expand/);
    expect(source).toMatch(/aria-label=.*Collapse/);
  });
});

// ── 3. AiMixPanel — track suggestion toggle has aria-expanded ───────────────

describe('AiMixPanel — ARIA compliance', () => {
  it('track suggestion toggle has aria-expanded', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/components/mixer/AiMixPanel.tsx', 'utf-8');

    expect(source).toContain('aria-expanded={expanded}');
  });

  it('track suggestion toggle has descriptive aria-label', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/components/mixer/AiMixPanel.tsx', 'utf-8');

    expect(source).toMatch(/aria-label=.*suggestions/);
  });
});
