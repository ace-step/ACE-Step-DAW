import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock Tone.js
vi.mock('tone', () => ({
  start: vi.fn(async () => {}),
  getContext: vi.fn(() => ({ state: 'running' })),
}));

// Mock AudioEngine class
const mockResume = vi.fn(async () => {});
const mockSetTimeUpdateCallback = vi.fn();
const mockRefreshPlaybackLatencyCompensation = vi.fn(() => 5);
const mockSetPlaybackLatencyCompensation = vi.fn();

vi.mock('../../engine/AudioEngine', () => {
  return {
    AudioEngine: class MockAudioEngine {
      resume = mockResume;
      setTimeUpdateCallback = mockSetTimeUpdateCallback;
      refreshPlaybackLatencyCompensation = mockRefreshPlaybackLatencyCompensation;
      setPlaybackLatencyCompensation = mockSetPlaybackLatencyCompensation;
      ctx = { baseLatency: 0.005, outputLatency: 0.01 };
    },
  };
});

import { getAudioEngine, getExistingAudioEngine, _setAudioResumed, useAudioEngine } from '../useAudioEngine';
import { useTransportStore } from '../../store/transportStore';
import { useProjectStore } from '../../store/projectStore';

describe('useAudioEngine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _setAudioResumed(false);
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Audio Test' });
  });

  afterEach(() => {
    _setAudioResumed(false);
  });

  // ── Singleton pattern ──

  it('getAudioEngine returns the same instance on repeated calls', () => {
    const engine1 = getAudioEngine();
    const engine2 = getAudioEngine();
    expect(engine1).toBe(engine2);
  });

  it('getExistingAudioEngine returns engine after getAudioEngine is called', () => {
    getAudioEngine();
    expect(getExistingAudioEngine()).not.toBeNull();
  });

  // ── Time update callback ──

  it('sets time update callback on mount', () => {
    renderHook(() => useAudioEngine());
    expect(mockSetTimeUpdateCallback).toHaveBeenCalledWith(expect.any(Function));
  });

  it('time update callback updates transport store', () => {
    renderHook(() => useAudioEngine());

    // Get the callback that was registered
    const callback = mockSetTimeUpdateCallback.mock.calls[0][0];
    callback(5.5);

    expect(useTransportStore.getState().currentTime).toBe(5.5);
  });

  // ── resumeOnGesture ──

  it('resumes engine and starts Tone on gesture', async () => {
    const { result } = renderHook(() => useAudioEngine());

    await act(async () => {
      await result.current.resumeOnGesture();
    });

    expect(mockResume).toHaveBeenCalledTimes(1);
  });

  it('refreshes playback latency on resume', async () => {
    const { result } = renderHook(() => useAudioEngine());

    await act(async () => {
      await result.current.resumeOnGesture();
    });

    expect(mockRefreshPlaybackLatencyCompensation).toHaveBeenCalledTimes(1);
  });

  // ── Auto-resume on user interaction ──

  it('auto-resumes on first click when not already resumed', async () => {
    _setAudioResumed(false);
    renderHook(() => useAudioEngine());

    await act(async () => {
      window.dispatchEvent(new Event('click', { bubbles: true }));
    });

    expect(mockResume).toHaveBeenCalled();
  });

  it('does not auto-resume when _audioResumed is already true', () => {
    _setAudioResumed(true);
    renderHook(() => useAudioEngine());

    window.dispatchEvent(new Event('click', { bubbles: true }));

    // Resume should not be called since we're already resumed
    expect(mockResume).not.toHaveBeenCalled();
  });

  // ── Cleanup ──

  it('clears time update callback on unmount', () => {
    const { unmount } = renderHook(() => useAudioEngine());
    unmount();

    // Should have been called twice: once with real callback, once with no-op
    expect(mockSetTimeUpdateCallback).toHaveBeenCalledTimes(2);
    const cleanupCallback = mockSetTimeUpdateCallback.mock.calls[1][0];
    expect(typeof cleanupCallback).toBe('function');
  });
});
