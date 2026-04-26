import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Phase 5G: PreviewEngine pulls its AudioContext from `getAudioEngine().ctx`
// instead of creating its own via Tone.js. The mock hands out the minimal
// set of AudioContext factories NativeSynths touches.
const { mockCtx } = vi.hoisted(() => {
  const makeAudioParam = () => ({
    value: 0,
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
    cancelScheduledValues: vi.fn(),
  });
  const makeGain = () => ({
    gain: makeAudioParam(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  });
  const makeOsc = () => ({
    type: 'sine' as OscillatorType,
    frequency: makeAudioParam(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    onended: null as (() => void) | null,
  });
  const makeFilter = () => ({
    type: 'lowpass' as BiquadFilterType,
    frequency: makeAudioParam(),
    Q: makeAudioParam(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  });
  return {
    mockCtx: {
      state: 'running' as AudioContextState,
      currentTime: 0,
      sampleRate: 48000,
      destination: {} as AudioNode,
      createGain: vi.fn(makeGain),
      createOscillator: vi.fn(makeOsc),
      createBiquadFilter: vi.fn(makeFilter),
    },
  };
});

vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: vi.fn(() => ({
    ctx: mockCtx,
    resume: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Mock project store
vi.mock('../../store/projectStore', () => ({
  useProjectStore: {
    getState: vi.fn().mockReturnValue({
      project: { bpm: 120 },
    }),
  },
}));

import { usePresetPreview } from '../usePresetPreview';

describe('usePresetPreview', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with default values', () => {
    const { result } = renderHook(() => usePresetPreview());
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.volume).toBe(0.3);
  });

  it('changes volume', () => {
    const { result } = renderHook(() => usePresetPreview());
    act(() => {
      result.current.changeVolume(0.7);
    });
    expect(result.current.volume).toBe(0.7);
  });

  it('stops preview', () => {
    const { result } = renderHook(() => usePresetPreview());
    act(() => {
      result.current.stop();
    });
    expect(result.current.isPlaying).toBe(false);
  });

  it('hover preview starts after delay', async () => {
    const { result } = renderHook(() => usePresetPreview({ hoverDelay: 300 }));
    act(() => {
      result.current.handlePresetHoverStart('test-preset', {
        instrumentKind: 'subtractive',
        category: 'Bass',
      });
    });
    // Should not be playing yet
    expect(result.current.isPlaying).toBe(false);

    // Advance past delay
    await act(async () => {
      vi.advanceTimersByTime(350);
    });
    expect(result.current.isPlaying).toBe(true);
  });

  it('hover end cancels pending preview', () => {
    const { result } = renderHook(() => usePresetPreview({ hoverDelay: 300 }));
    act(() => {
      result.current.handlePresetHoverStart('test-preset', {
        instrumentKind: 'subtractive',
        category: 'Bass',
      });
    });
    act(() => {
      result.current.handlePresetHoverEnd();
    });
    // Advance past delay — should NOT start playing
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.isPlaying).toBe(false);
  });

  it('click toggles preview', async () => {
    const { result } = renderHook(() => usePresetPreview());
    // Start
    await act(async () => {
      result.current.handlePresetClick('test-preset', {
        instrumentKind: 'subtractive',
        category: 'Lead',
      });
    });
    expect(result.current.isPlaying).toBe(true);
  });

  it('disables hover preview when hoverEnabled is false', () => {
    const { result } = renderHook(() =>
      usePresetPreview({ hoverEnabled: false }),
    );
    act(() => {
      result.current.handlePresetHoverStart('test-preset', {
        instrumentKind: 'subtractive',
        category: 'Bass',
      });
    });
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.isPlaying).toBe(false);
  });
});
