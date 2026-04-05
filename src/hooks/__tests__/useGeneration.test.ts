/**
 * Tests for useGeneration hook — generateAll and generateClip.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useGenerationStore } from '../../store/generationStore';
import { useProjectStore } from '../../store/projectStore';

const mockGenerateAllTracks = vi.fn().mockResolvedValue(undefined);
const mockGenerateSingleClip = vi.fn().mockResolvedValue(undefined);

vi.mock('../../services/generationPipeline', () => ({
  generateAllTracks: (...args: unknown[]) => mockGenerateAllTracks(...args),
  generateSingleClip: (...args: unknown[]) => mockGenerateSingleClip(...args),
}));

import { useGeneration } from '../useGeneration';

describe('useGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGenerationStore.setState({ isGenerating: false, jobs: [] });
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject({ name: 'Test' });
  });

  it('returns isGenerating and jobs from store', () => {
    const { result } = renderHook(() => useGeneration());
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.jobs).toEqual([]);
  });

  it('generateAll calls generateAllTracks when project exists', async () => {
    const { result } = renderHook(() => useGeneration());

    await act(async () => { await result.current.generateAll(); });

    expect(mockGenerateAllTracks).toHaveBeenCalled();
  });

  it('generateAll does nothing when already generating', async () => {
    useGenerationStore.setState({ isGenerating: true });
    const { result } = renderHook(() => useGeneration());

    await act(async () => { await result.current.generateAll(); });

    expect(mockGenerateAllTracks).not.toHaveBeenCalled();
  });

  it('generateAll does nothing without a project', async () => {
    useProjectStore.setState({ project: null });
    const { result } = renderHook(() => useGeneration());

    await act(async () => { await result.current.generateAll(); });

    expect(mockGenerateAllTracks).not.toHaveBeenCalled();
  });

  it('generateClip calls generateSingleClip with clipId', async () => {
    const { result } = renderHook(() => useGeneration());

    await act(async () => { await result.current.generateClip('clip-1'); });

    expect(mockGenerateSingleClip).toHaveBeenCalledWith('clip-1', undefined);
  });

  it('generateClip passes options through', async () => {
    const { result } = renderHook(() => useGeneration());

    await act(async () => {
      await result.current.generateClip('clip-1', { sharedSeed: 42 });
    });

    expect(mockGenerateSingleClip).toHaveBeenCalledWith('clip-1', { sharedSeed: 42 });
  });

  it('generateClip does nothing when already generating', async () => {
    useGenerationStore.setState({ isGenerating: true });
    const { result } = renderHook(() => useGeneration());

    await act(async () => { await result.current.generateClip('clip-1'); });

    expect(mockGenerateSingleClip).not.toHaveBeenCalled();
  });
});
