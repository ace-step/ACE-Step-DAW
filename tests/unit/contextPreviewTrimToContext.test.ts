import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Regression test for #1186: context window preview playback must use
 * trimToContext: true so the audio blob starts at ctxStart instead of
 * project time 0 (which causes leading silence).
 *
 * This is a source-level assertion: both AddLayerPanel and AddLayerModal
 * must call extractContextAudioLazy with { trimToContext: true }.
 */
describe('context preview playback uses trimToContext', () => {
  const srcRoot = resolve(__dirname, '../../src/components/generation');

  it('AddLayerPanel passes trimToContext: true to extractContextAudioLazy', () => {
    const src = readFileSync(resolve(srcRoot, 'AddLayerPanel.tsx'), 'utf-8');
    // Should contain the trimToContext: true option
    expect(src).toContain('extractContextAudioLazy(contextWindow, { trimToContext: true })');
  });

  it('AddLayerModal passes trimToContext: true to extractContextAudioLazy', () => {
    const src = readFileSync(resolve(srcRoot, 'AddLayerModal.tsx'), 'utf-8');
    // Should contain the trimToContext: true option
    expect(src).toContain('extractContextAudioLazy(contextWindow, { trimToContext: true })');
  });

  it('AddLayerModal does NOT call extractContextAudioLazy without trimToContext', () => {
    const src = readFileSync(resolve(srcRoot, 'AddLayerModal.tsx'), 'utf-8');
    // Find all extractContextAudioLazy calls — none should lack trimToContext
    const calls = src.match(/extractContextAudioLazy\([^)]+\)/g) ?? [];
    expect(calls.length).toBeGreaterThan(0);
    for (const call of calls) {
      expect(call).toContain('trimToContext: true');
    }
  });
});
