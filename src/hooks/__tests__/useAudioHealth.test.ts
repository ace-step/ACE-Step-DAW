import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudioHealth } from '../useAudioHealth';

// Mock the audio engine singleton
const mockMasterMeter = { level: -12, clipped: false };
const mockEngine = {
  ctx: {
    state: 'running',
    sampleRate: 48000,
    currentTime: 10.0,
    baseLatency: 0.005,
    outputLatency: 0.003,
  },
  getMasterMeter: vi.fn(() => mockMasterMeter),
};

vi.mock('../useAudioEngine', () => ({
  getExistingAudioEngine: vi.fn(() => mockEngine),
}));

vi.mock('../../services/audioHealthMonitor', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/audioHealthMonitor')>();
  return {
    ...actual,
    enumerateAudioDevices: vi.fn().mockResolvedValue([
      { deviceId: 'default', label: 'Speakers', kind: 'audiooutput', isDefault: true },
    ]),
  };
});

describe('useAudioHealth', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockEngine.ctx.state = 'running';
    mockEngine.ctx.currentTime = 10.0;
    mockMasterMeter.level = -12;
    mockMasterMeter.clipped = false;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('initializes with inactive status before first poll', () => {
    const { result } = renderHook(() => useAudioHealth());
    expect(result.current.status).toBe('inactive');
    expect(result.current.snapshot).toBeNull();
  });

  it('captures a snapshot after poll interval', () => {
    const { result } = renderHook(() => useAudioHealth());

    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.snapshot).not.toBeNull();
    expect(result.current.snapshot?.contextState).toBe('running');
    expect(result.current.snapshot?.sampleRate).toBe(48000);
    expect(result.current.status).toBe('good');
  });

  it('updates status when context becomes suspended', () => {
    const { result } = renderHook(() => useAudioHealth());

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.status).toBe('good');

    mockEngine.ctx.state = 'suspended';
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.status).toBe('inactive');
  });

  it('detects clipping events', () => {
    const { result } = renderHook(() => useAudioHealth());

    mockMasterMeter.clipped = true;
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current.recentClipCount).toBeGreaterThan(0);
  });

  it('provides toggle function for panel visibility', () => {
    const { result } = renderHook(() => useAudioHealth());

    expect(result.current.panelOpen).toBe(false);
    act(() => {
      result.current.togglePanel();
    });
    expect(result.current.panelOpen).toBe(true);
    act(() => {
      result.current.togglePanel();
    });
    expect(result.current.panelOpen).toBe(false);
  });

  it('enumerates devices on mount', async () => {
    const { result } = renderHook(() => useAudioHealth());

    // Flush microtask for async device enumeration
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    expect(result.current.devices.length).toBeGreaterThan(0);
    expect(result.current.devices[0].label).toBe('Speakers');
  });
});
