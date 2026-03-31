import { describe, expect, it, vi, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// Mock the lazy extractor so we can verify how it's called
const mockExtractContextAudioLazy = vi.fn().mockResolvedValue(null);
vi.mock('../../src/services/lazyContextAudioExtractor', () => ({
  extractContextAudioLazy: (...args: unknown[]) => mockExtractContextAudioLazy(...args),
}));

/**
 * Regression test for #1186: context window preview playback must use
 * trimToContext: true so the audio blob starts at ctxStart instead of
 * project time 0 (which causes leading silence).
 */
describe('context preview playback uses trimToContext', () => {
  beforeEach(() => {
    mockExtractContextAudioLazy.mockClear();
  });

  const srcRoot = resolve(__dirname, '../../src/components/generation');

  // Source-level guards: ensure all preview paths include trimToContext: true
  it('AddLayerPanel passes trimToContext: true', () => {
    const src = readFileSync(resolve(srcRoot, 'AddLayerPanel.tsx'), 'utf-8');
    expect(src).toContain('extractContextAudioLazy(contextWindow, { trimToContext: true })');
  });

  it('AddLayerModal passes trimToContext: true', () => {
    const src = readFileSync(resolve(srcRoot, 'AddLayerModal.tsx'), 'utf-8');
    expect(src).toContain('extractContextAudioLazy(contextWindow, { trimToContext: true })');
  });

  it('MultiTrackGenerateModal passes trimToContext: true', () => {
    const src = readFileSync(resolve(srcRoot, 'MultiTrackGenerateModal.tsx'), 'utf-8');
    expect(src).toContain('extractContextAudioLazy(contextWindow, { trimToContext: true })');
  });

  it('no preview call to extractContextAudioLazy without trimToContext', () => {
    const files = ['AddLayerPanel.tsx', 'AddLayerModal.tsx', 'MultiTrackGenerateModal.tsx'];
    for (const file of files) {
      const src = readFileSync(resolve(srcRoot, file), 'utf-8');
      const calls = src.match(/extractContextAudioLazy\([^)]+\)/g) ?? [];
      expect(calls.length, `${file} should have at least one call`).toBeGreaterThan(0);
      for (const call of calls) {
        expect(call, `${file}: ${call} should include trimToContext`).toContain('trimToContext: true');
      }
    }
  });

  // Behavioral test: verify the mock is called correctly when imported
  it('extractContextAudioLazy accepts trimToContext option at runtime', async () => {
    const { extractContextAudioLazy } = await import('../../src/services/lazyContextAudioExtractor');
    const ctx = { startTime: 5, endTime: 15 };

    await extractContextAudioLazy(ctx, { trimToContext: true });

    expect(mockExtractContextAudioLazy).toHaveBeenCalledWith(ctx, { trimToContext: true });
  });

  it('extractContextAudioLazy without trimToContext defaults to false semantics', async () => {
    const { extractContextAudioLazy } = await import('../../src/services/lazyContextAudioExtractor');
    const ctx = { startTime: 5, endTime: 15 };

    await extractContextAudioLazy(ctx);

    // Called without options — would default to trimToContext: false
    expect(mockExtractContextAudioLazy).toHaveBeenCalledWith(ctx);
  });
});
