import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGenerateAllTracks = vi.fn();
const mockGenerateSingleClip = vi.fn();

vi.mock('../../services/generationPipeline', () => ({
  generateAllTracks: (...args: unknown[]) => mockGenerateAllTracks(...args),
  generateSingleClip: (...args: unknown[]) => mockGenerateSingleClip(...args),
}));

import { useGeneration } from '../useGeneration';
import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';

describe('useGeneration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Gen Test' });
    mockGenerateAllTracks.mockResolvedValue(undefined);
    mockGenerateSingleClip.mockResolvedValue(undefined);
  });

  it('exposes jobs and isGenerating from store', () => {
    useGenerationStore.setState({
      isGenerating: true,
      jobs: [{ id: 'j1' } as unknown as ReturnType<typeof useGenerationStore.getState>['jobs'][number]],
    });
    const { result } = renderHook(() => useGeneration());

    expect(result.current.isGenerating).toBe(true);
    expect(result.current.jobs).toHaveLength(1);
  });

  // ── generateAll ──

  it('calls generateAllTracks when project exists and not generating', async () => {
    const { result } = renderHook(() => useGeneration());

    await act(async () => {
      await result.current.generateAll();
    });

    expect(mockGenerateAllTracks).toHaveBeenCalledTimes(1);
  });

  it('does not call generateAllTracks when project is null', async () => {
    useProjectStore.setState({ project: null });
    const { result } = renderHook(() => useGeneration());

    await act(async () => {
      await result.current.generateAll();
    });

    expect(mockGenerateAllTracks).not.toHaveBeenCalled();
  });

  it('does not call generateAllTracks when already generating', async () => {
    useGenerationStore.setState({ isGenerating: true });
    const { result } = renderHook(() => useGeneration());

    await act(async () => {
      await result.current.generateAll();
    });

    expect(mockGenerateAllTracks).not.toHaveBeenCalled();
  });

  // ── generateClip ──

  it('calls generateSingleClip with clipId', async () => {
    const { result } = renderHook(() => useGeneration());

    await act(async () => {
      await result.current.generateClip('clip-42');
    });

    expect(mockGenerateSingleClip).toHaveBeenCalledWith('clip-42', undefined);
  });

  it('passes sharedSeed option through to generateSingleClip', async () => {
    const { result } = renderHook(() => useGeneration());

    await act(async () => {
      await result.current.generateClip('clip-42', { sharedSeed: 123 });
    });

    expect(mockGenerateSingleClip).toHaveBeenCalledWith('clip-42', { sharedSeed: 123 });
  });

  it('does not call generateSingleClip when project is null', async () => {
    useProjectStore.setState({ project: null });
    const { result } = renderHook(() => useGeneration());

    await act(async () => {
      await result.current.generateClip('clip-42');
    });

    expect(mockGenerateSingleClip).not.toHaveBeenCalled();
  });

  it('does not call generateSingleClip when already generating', async () => {
    useGenerationStore.setState({ isGenerating: true });
    const { result } = renderHook(() => useGeneration());

    await act(async () => {
      await result.current.generateClip('clip-42');
    });

    expect(mockGenerateSingleClip).not.toHaveBeenCalled();
  });
});
