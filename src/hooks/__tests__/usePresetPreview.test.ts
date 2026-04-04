import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock Tone.js
vi.mock('tone', () => {
  class MockGain {
    gain = { value: 0 };
    connect = vi.fn().mockReturnThis();
    toDestination = vi.fn().mockReturnThis();
    dispose = vi.fn();
  }
  class MockPolySynth {
    connect = vi.fn().mockReturnThis();
    triggerAttackRelease = vi.fn();
    releaseAll = vi.fn();
    dispose = vi.fn();
  }
  class MockSynth {}
  class MockFMSynth {
    connect = vi.fn().mockReturnThis();
    triggerAttackRelease = vi.fn();
    releaseAll = vi.fn();
    dispose = vi.fn();
  }
  return {
    getContext: vi.fn().mockReturnValue({ state: 'running' }),
    getTransport: vi.fn().mockReturnValue({ clear: vi.fn() }),
    start: vi.fn().mockResolvedValue(undefined),
    Gain: MockGain,
    Synth: MockSynth,
    PolySynth: MockPolySynth,
    FMSynth: MockFMSynth,
    Frequency: vi.fn().mockImplementation((val: number) => ({
      toFrequency: () => 440 * Math.pow(2, (val - 69) / 12),
    })),
    now: vi.fn().mockReturnValue(0),
  };
});

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
