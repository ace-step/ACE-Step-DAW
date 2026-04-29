import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
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
    await waitFor(() => {
      expect(result.current).toHaveLength(100);
    });
  });

  it('resets to null when audioKey changes to null', async () => {
    const { result, rerender } = renderHook(
      ({ key }) => useWaveform(key),
      { initialProps: { key: 'audio-1' as string | null } },
    );
    await waitFor(() => {
      expect(result.current).toHaveLength(100);
    });

    rerender({ key: null });
    expect(result.current).toBeNull();
  });

  it('uses default numPeaks of 100', async () => {
    const { computeWaveformPeaks } = await import('../../utils/waveformPeaks');
    renderHook(() => useWaveform('audio-1'));
    await waitFor(() => {
      expect(vi.mocked(computeWaveformPeaks)).toHaveBeenCalledWith(
        expect.anything(),
        100,
        expect.any(Number),
        expect.any(Number),
      );
    });
  });
});
