import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import '@testing-library/jest-dom';
import { SettingsDialog } from '../../src/components/dialogs/SettingsDialog';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';
import { getAudioEngine, useAudioEngine, _setAudioResumed } from '../../src/hooks/useAudioEngine';

const {
  toneStart,
  mockSetTimeUpdateCallback,
  mockEngineResume,
} = vi.hoisted(() => ({
  toneStart: vi.fn().mockResolvedValue(undefined),
  mockSetTimeUpdateCallback: vi.fn(),
  mockEngineResume: vi.fn().mockResolvedValue(undefined),
}));

let mockLatencyContext: {
  state: string;
  baseLatency?: number;
  outputLatency?: number;
} = {
  state: 'running',
  baseLatency: 0.004,
  outputLatency: 0.012,
};

vi.mock('tone', () => ({
  start: toneStart,
}));

vi.mock('../../src/services/aceStepApi', () => ({
  listModels: vi.fn().mockResolvedValue([]),
  initModel: vi.fn().mockResolvedValue({}),
  getBackendUrl: vi.fn().mockReturnValue('http://localhost:8001'),
  setBackendUrl: vi.fn(),
}));

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../src/engine/AudioEngine', () => ({
  AudioEngine: class {
    ctx = mockLatencyContext;
    _playbackLatencyCompensation = 0;
    resume = (...args: unknown[]) => mockEngineResume(...args);
    setTimeUpdateCallback = (...args: unknown[]) => mockSetTimeUpdateCallback(...args);
    measurePlaybackLatency() {
      return {
        baseLatency: typeof this.ctx.baseLatency === 'number' ? this.ctx.baseLatency : null,
        outputLatency: typeof this.ctx.outputLatency === 'number' ? this.ctx.outputLatency : null,
      };
    }
    refreshPlaybackLatencyCompensation() {
      const measured = this.measurePlaybackLatency();
      this._playbackLatencyCompensation = Math.max(
        0,
        (measured.baseLatency ?? 0) + (measured.outputLatency ?? 0),
      );
      return measured;
    }
    setPlaybackLatencyCompensation(value: number) {
      this._playbackLatencyCompensation = value;
    }
  },
}));

function ResumeHarness() {
  const { resumeOnGesture } = useAudioEngine();

  useEffect(() => {
    useProjectStore.getState().createProject({ name: 'Latency Harness' });
  }, []);

  return (
    <button type="button" onClick={() => void resumeOnGesture()}>
      Resume Audio
    </button>
  );
}

describe('playback latency calibration', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    // Disable auto-resume so tests can measure explicit resumeOnGesture calls
    _setAudioResumed(true);
    toneStart.mockClear();
    mockSetTimeUpdateCallback.mockClear();
    mockEngineResume.mockClear();
    mockLatencyContext = {
      state: 'running',
      baseLatency: 0.004,
      outputLatency: 0.012,
    };
    (getAudioEngine() as unknown as { ctx: typeof mockLatencyContext }).ctx = mockLatencyContext;
  });

  it('stores detected browser latency and persists a manual override as the normalized compensation value', () => {
    vi.useFakeTimers();
    try {
      const store = useProjectStore.getState();
      store.createProject({ name: 'Latency Test' });

      store.detectPlaybackLatency({
        baseLatency: 0.004,
        outputLatency: 0.012,
      });

      expect(useProjectStore.getState().project?.playbackLatency).toMatchObject({
        detectedBaseLatencyMs: 4,
        detectedOutputLatencyMs: 12,
        detectedLatencyMs: 16,
        compensationMs: 16,
        source: 'auto',
        browserSupport: 'available',
      });

      store.setPlaybackLatencyOverride(42.5);

      expect(useProjectStore.getState().project?.playbackLatency).toMatchObject({
        manualOverrideMs: 42.5,
        compensationMs: 42.5,
        source: 'manual',
      });

      // Flush debounced persistence write (750ms debounce in projectStore)
      vi.advanceTimersByTime(1000);

      const persisted = JSON.parse(localStorage.getItem('ace-step-daw-project') ?? '{}') as {
        state?: { project?: { playbackLatency?: { compensationMs?: number; manualOverrideMs?: number } } };
      };
      expect(persisted.state?.project?.playbackLatency?.manualOverrideMs).toBe(42.5);
      expect(persisted.state?.project?.playbackLatency?.compensationMs).toBe(42.5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows a fallback state when browser latency is unavailable and restores a saved manual override in settings', async () => {
    mockLatencyContext = { state: 'running' };
    (getAudioEngine() as unknown as { ctx: typeof mockLatencyContext }).ctx = mockLatencyContext;

    act(() => {
      useProjectStore.getState().createProject({ name: 'Settings Latency' });
      useUIStore.getState().setShowSettingsDialog(true);
    });

    render(<SettingsDialog />);

    expect(screen.getByText(/browser latency unavailable/i)).toBeInTheDocument();

    const manualInput = screen.getByLabelText(/manual playback latency/i) as HTMLInputElement;
    fireEvent.change(manualInput, { target: { value: '37.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(useProjectStore.getState().project?.playbackLatency).toMatchObject({
      manualOverrideMs: 37.5,
      compensationMs: 37.5,
      source: 'manual',
    });

    act(() => {
      useUIStore.getState().setShowSettingsDialog(true);
    });
    await waitFor(() => {
      expect(screen.getByLabelText(/manual playback latency/i)).toHaveValue(37.5);
    });
  });

  it('captures browser latency the first time audio is resumed', async () => {
    render(<ResumeHarness />);

    fireEvent.click(screen.getByRole('button', { name: /resume audio/i }));

    await waitFor(() => {
      expect(useProjectStore.getState().project?.playbackLatency).toMatchObject({
        detectedBaseLatencyMs: 4,
        detectedOutputLatencyMs: 12,
        detectedLatencyMs: 16,
        compensationMs: 16,
      });
    });

    expect(mockEngineResume).toHaveBeenCalledTimes(1);
    // Phase 5C: useAudioEngine no longer calls Tone.start() directly.
    // This unit asserts only the direct API surface — the underlying
    // shared-context contract (AudioEngine calls Tone.setContext on
    // the same AudioContext, so resuming the context is sufficient)
    // is verified elsewhere; here `AudioEngine` is mocked.
    expect(toneStart).not.toHaveBeenCalled();
  });

  it('keeps the fallback state when the browser exposes no latency values on resume', async () => {
    mockLatencyContext = {
      state: 'running',
    };
    (getAudioEngine() as unknown as { ctx: typeof mockLatencyContext }).ctx = mockLatencyContext;

    render(<ResumeHarness />);

    fireEvent.click(screen.getByRole('button', { name: /resume audio/i }));

    await waitFor(() => {
      expect(useProjectStore.getState().project?.playbackLatency).toMatchObject({
        detectedLatencyMs: null,
        compensationMs: 0,
        source: 'fallback',
        browserSupport: 'missing',
      });
    });
  });
});
