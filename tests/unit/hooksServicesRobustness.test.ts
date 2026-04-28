/**
 * Regression tests for Hooks & Services Robustness Sprint.
 *
 * Covers:
 * 1. useAudioEngine — single getState() call with safe optional chaining
 * 2. midiAiService — abort listener uses { once: true }
 * 3. useAutoSave — re-checks dirty state after async save
 * 4. useSessionMidiController — .catch() on MIDI init
 * 5. coreKeyboardActions — internal error handling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── 1. useAudioEngine: single getState + no non-null assertions ──────────────

describe('useAudioEngine — safe latency compensation read', () => {
  it('latency compensation block has no unsafe non-null assertions', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/hooks/useAudioEngine.ts', 'utf-8');

    const idx = source.indexOf('setPlaybackLatencyCompensation');
    expect(idx).toBeGreaterThanOrEqual(0);
    const setCompensationBlock = source.slice(idx, idx + 300);

    // Should NOT contain non-null assertions on project or playbackLatency
    expect(setCompensationBlock).not.toContain('.project!');
    expect(setCompensationBlock).not.toContain('.playbackLatency!');
    expect(setCompensationBlock).not.toContain('.compensationMs!');
  });
});

// ── 2. midiAiService: abort listener uses { once: true } ────────────────────

describe('midiAiService — abort listener cleanup', () => {
  it('abort listeners use { once: true } and are cleaned up in finally', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/services/midiAiService.ts', 'utf-8');

    // The submit function should use { once: true } on its abort listener
    expect(source).toMatch(
      /addEventListener\(\s*'abort'\s*,\s*onAbort\s*,\s*\{\s*once\s*:\s*true\s*\}/,
    );

    // The submit function should clean up in finally
    expect(source).toContain("removeEventListener('abort', onAbort)");
  });
});

// ── 3. useAutoSave: re-checks dirty state after async save ──────────────────

describe('useAutoSave — dirty state re-check after save', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('source code re-reads project state after save to detect concurrent changes', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/hooks/useAutoSave.ts', 'utf-8');

    // The fix adds a re-check after saveProjectToIDB completes:
    // const latestProject = useProjectStore.getState().project;
    // if (latestProject && latestProject.updatedAt !== currentProject.updatedAt) { ... }
    expect(source).toContain('latestProject');
    expect(source).toContain('latestProject.updatedAt !== currentProject.updatedAt');
  });
});

// ── 4. useSessionMidiController: .catch() on MIDI init ──────────────────────

describe('useSessionMidiController — MIDI init error handling', () => {
  it('source code has .catch() after initMidiController().then()', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/hooks/useSessionMidiController.ts', 'utf-8');

    // Find the initMidiController() call block
    const initCallIndex = source.indexOf('initMidiController()');
    expect(initCallIndex).toBeGreaterThan(-1);

    // The block should contain both .then() and .catch()
    const blockAfterInit = source.slice(initCallIndex, initCallIndex + 300);
    expect(blockAfterInit).toContain('.then(');
    expect(blockAfterInit).toContain('.catch(');
  });
});

// ── 5. coreKeyboardActions: internal error handling ─────────────────────────

describe('executeCoreKeyboardAction — error resilience', () => {
  // Reset stores to avoid side effects
  beforeEach(async () => {
    const { useUIStore } = await import('../../src/store/uiStore');
    const { useTransportStore } = await import('../../src/store/transportStore');
    useUIStore.setState(useUIStore.getInitialState(), true);
    useTransportStore.setState({ isPlaying: false, isRecording: false, armedTrackIds: [], loopEnabled: false });
  });

  it('returns false instead of throwing when play() rejects', async () => {
    const { executeCoreKeyboardAction } = await import('../../src/services/coreKeyboardActions');

    const deps = {
      play: vi.fn().mockRejectedValue(new Error('AudioContext not started')),
      pause: vi.fn(),
      toggleRecord: vi.fn(),
      toggleArmTrack: vi.fn(),
    };

    // Should NOT throw — returns false instead
    const result = await executeCoreKeyboardAction('transport.playPause', deps);
    expect(result).toBe(false);
  });

  it('returns false instead of throwing when pause() rejects', async () => {
    const { useTransportStore } = await import('../../src/store/transportStore');
    useTransportStore.setState({ isPlaying: true });

    const { executeCoreKeyboardAction } = await import('../../src/services/coreKeyboardActions');

    const deps = {
      play: vi.fn(),
      pause: vi.fn().mockRejectedValue(new Error('Audio engine error')),
      toggleRecord: vi.fn(),
      toggleArmTrack: vi.fn(),
    };

    const result = await executeCoreKeyboardAction('transport.playPause', deps);
    expect(result).toBe(false);
  });

  it('returns false instead of throwing when toggleRecord() rejects', async () => {
    const { useTransportStore } = await import('../../src/store/transportStore');
    useTransportStore.setState({ isRecording: true });

    const { executeCoreKeyboardAction } = await import('../../src/services/coreKeyboardActions');

    const deps = {
      play: vi.fn(),
      pause: vi.fn(),
      toggleRecord: vi.fn().mockRejectedValue(new Error('Recording error')),
      toggleArmTrack: vi.fn(),
    };

    const result = await executeCoreKeyboardAction('transport.record', deps);
    expect(result).toBe(false);
  });
});
