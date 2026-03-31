import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockExtractContextAudioLazy = vi.fn().mockResolvedValue(null);
vi.mock('../../src/services/lazyContextAudioExtractor', () => ({
  extractContextAudioLazy: (...args: unknown[]) => mockExtractContextAudioLazy(...args),
}));

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../src/services/audioFileManager', async () => {
  const actual = await vi.importActual<typeof import('../../src/services/audioFileManager')>('../../src/services/audioFileManager');
  return { ...actual, loadAudioBlobByKey: vi.fn(), saveAudioBlob: vi.fn() };
});

vi.mock('../../src/hooks/useToast', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../src/hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    ctx: { createBuffer: vi.fn() },
    decodeAudioData: vi.fn(),
  }),
}));

vi.mock('../../src/services/generationPipeline', () => ({
  generateFromAddLayer: vi.fn(),
  generateSingleClip: vi.fn(),
}));

// ── Imports after mocks ──────────────────────────────────────────────────────

import { useProjectStore } from '../../src/store/projectStore';
import { AddLayerModal } from '../../src/components/generation/AddLayerModal';

/**
 * Regression test for #1186: context window preview playback must use
 * trimToContext: true so the audio blob starts at ctxStart instead of
 * project time 0 (which causes leading silence).
 */
describe('context preview playback uses trimToContext', () => {
  beforeEach(() => {
    mockExtractContextAudioLazy.mockClear();
    mockExtractContextAudioLazy.mockResolvedValue(null);
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    // Set up a minimal project
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('vocals');
    if (track) {
      // Store track id for tests
      (globalThis as any).__testTrackId = track.id;
    }
  });

  afterEach(() => {
    cleanup();
  });

  const srcRoot = resolve(__dirname, '../../src/components/generation');

  // Source-level guards
  it('AddLayerPanel source contains trimToContext: true', () => {
    const src = readFileSync(resolve(srcRoot, 'AddLayerPanel.tsx'), 'utf-8');
    expect(src).toContain('extractContextAudioLazy(contextWindow, { trimToContext: true })');
  });

  it('AddLayerModal source contains trimToContext: true', () => {
    const src = readFileSync(resolve(srcRoot, 'AddLayerModal.tsx'), 'utf-8');
    expect(src).toContain('extractContextAudioLazy(contextWindow, { trimToContext: true })');
  });

  it('MultiTrackGenerateModal source contains trimToContext: true', () => {
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

  // Component-level behavioral test: render AddLayerModal, click preview, verify mock call
  it('AddLayerModal calls extractContextAudioLazy with { trimToContext: true } on preview click', async () => {
    const trackId = (globalThis as any).__testTrackId;
    const contextWindow = { startTime: 5, endTime: 15 };

    render(
      <AddLayerModal
        trackId={trackId}
        startTime={5}
        duration={9}
        contextWindow={contextWindow}
        onClose={vi.fn()}
      />,
    );

    // Find and click the preview play button
    const playButton = screen.getByTitle('Preview context audio');
    fireEvent.click(playButton);

    await waitFor(() => {
      expect(mockExtractContextAudioLazy).toHaveBeenCalledTimes(1);
      expect(mockExtractContextAudioLazy).toHaveBeenCalledWith(
        contextWindow,
        { trimToContext: true },
      );
    });
  });
});
