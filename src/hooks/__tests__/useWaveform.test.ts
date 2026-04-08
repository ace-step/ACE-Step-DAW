import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWaveform } from '../useWaveform';

vi.mock('../useAudioEngine', () => ({
  getAudioEngine: () => ({
    decodeAudioData: vi.fn().mockResolvedValue({
      sampleRate: 44100,
      length: 44100,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array(44100),
      duration: 1,
    }),
  }),
}));

vi.mock('../../services/audioFileManager', () => ({
  loadAudioBlobByKey: vi.fn().mockResolvedValue(new Blob(['audio'], { type: 'audio/wav' })),
}));

vi.mock('../../utils/waveformPeaks', () => ({
  computeWaveformPeaks: vi.fn().mockReturnValue(Array.from({ length: 100 }, () => 0.5)),
}));

describe('useWaveform', () => {
  it('returns null when audioKey is null', () => {
    const { result } = renderHook(() => useWaveform(null));
    expect(result.current).toBeNull();
  });

  it('loads peaks for valid audioKey', async () => {
    const { result } = renderHook(() => useWaveform('audio-key-1', 100));
    // Wait for async loading
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(result.current).toHaveLength(100);
  });

  it('resets to null when audioKey changes to null', async () => {
    const { result, rerender } = renderHook(
      ({ key }) => useWaveform(key),
      { initialProps: { key: 'audio-1' as string | null } },
    );
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(result.current).toHaveLength(100);

    rerender({ key: null });
    expect(result.current).toBeNull();
  });

  it('uses default numPeaks of 100', async () => {
    const { computeWaveformPeaks } = await import('../../utils/waveformPeaks');
    const { result } = renderHook(() => useWaveform('audio-1'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(vi.mocked(computeWaveformPeaks)).toHaveBeenCalledWith(
      expect.anything(),
      100,
      expect.any(Number),
      expect.any(Number),
    );
  });
});
