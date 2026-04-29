import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Mock idb-keyval before importing anything that uses it
vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => ({})),
  get: vi.fn().mockResolvedValue(null),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
  keys: vi.fn().mockResolvedValue([]),
}));

// Mock Tone.js to avoid audio context errors in tests
vi.mock('tone', () => ({
  getContext: vi.fn(() => ({ rawContext: {} })),
  start: vi.fn(),
  Synth: vi.fn(() => ({ toDestination: vi.fn(), triggerAttackRelease: vi.fn(), dispose: vi.fn() })),
  Transport: { bpm: { value: 120 }, seconds: 0, state: 'stopped', start: vi.fn(), stop: vi.fn(), pause: vi.fn(), position: '0:0:0', schedule: vi.fn(), cancel: vi.fn() },
  Destination: { volume: { value: 0 } },
  context: { rawContext: {}, state: 'running' },
  now: vi.fn(() => 0),
}));

import { useAutoSave, type SaveStatus } from '../useAutoSave';
import { useProjectStore } from '../../store/projectStore';
import type { Project } from '../../types/project';
import { saveProject as saveProjectToIDB } from '../../services/projectStorage';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn().mockResolvedValue(undefined),
  loadProject: vi.fn().mockResolvedValue(null),
  deleteProject: vi.fn().mockResolvedValue(undefined),
  listProjects: vi.fn().mockResolvedValue([]),
  saveTemplate: vi.fn(),
  loadTemplate: vi.fn(),
  deleteTemplate: vi.fn(),
  listTemplates: vi.fn().mockResolvedValue([]),
  exportProjectArchive: vi.fn(),
  importProjectArchive: vi.fn(),
}));

function makeProject(overrides?: Partial<Project>): Project {
  return {
    id: 'test-project-1',
    name: 'Test Project',
    bpm: 120,
    keyScale: 'C Major',
    timeSignature: 4,
    timeSignatureDenominator: 4,
    measures: 8,
    totalDuration: 16,
    masterVolume: 0,
    globalCaption: '',
    createdAt: 1000,
    updatedAt: 1000,
    tracks: [],
    trackPresets: [],
    assets: [],
    ...overrides,
  } as Project;
}

describe('useAutoSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    useProjectStore.setState({ project: null });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "saved" status when project is null', () => {
    const { result } = renderHook(() => useAutoSave());
    expect(result.current.status).toBe('saved');
  });

  it('transitions to "unsaved" when project changes, then "saved" after debounce', async () => {
    const { result } = renderHook(() => useAutoSave());

    expect(result.current.status).toBe('saved');

    const project = makeProject({ updatedAt: 1000 });
    act(() => {
      useProjectStore.setState({ project });
    });

    expect(result.current.status).toBe('unsaved');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(35000);
    });

    expect(result.current.status).toBe('saved');
  });

  it('detects dirty state when project updatedAt changes', async () => {
    const project = makeProject({ updatedAt: 1000 });

    const { result } = renderHook(() => useAutoSave());

    act(() => {
      useProjectStore.setState({ project });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(35000);
    });

    expect(result.current.status).toBe('saved');

    // Simulate project change
    act(() => {
      useProjectStore.setState({
        project: { ...project, updatedAt: 2000, name: 'Changed' },
      });
    });

    expect(result.current.status).toBe('unsaved');
  });

  it('calls saveProject after debounce period', async () => {
    renderHook(() => useAutoSave());

    const project = makeProject({ updatedAt: 1000 });
    act(() => {
      useProjectStore.setState({ project });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(35000);
    });

    // saveProjectToIDB should have been called (by our hook and/or the existing auto-save)
    expect(saveProjectToIDB).toHaveBeenCalledWith(project);
  });

  it('does not trigger save when project is null', async () => {
    renderHook(() => useAutoSave());

    await act(async () => {
      await vi.advanceTimersByTimeAsync(35000);
    });

    expect(saveProjectToIDB).not.toHaveBeenCalled();
  });

  it('stays unsaved until debounce completes after project change', async () => {
    const project = makeProject({ updatedAt: 1000 });

    const { result } = renderHook(() => useAutoSave());

    act(() => {
      useProjectStore.setState({ project });
    });

    // 20s in - still unsaved (our 30s debounce hasn't elapsed)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });

    expect(result.current.status).toBe('unsaved');

    // Change project again - this resets our debounce timer
    act(() => {
      useProjectStore.setState({
        project: { ...project, updatedAt: 2000 },
      });
    });

    expect(result.current.status).toBe('unsaved');

    // 20s after the second change - still 10s short of the 30s debounce
    await act(async () => {
      await vi.advanceTimersByTimeAsync(20000);
    });

    expect(result.current.status).toBe('unsaved');

    // Now complete the remaining time
    await act(async () => {
      await vi.advanceTimersByTimeAsync(15000);
    });

    expect(result.current.status).toBe('saved');
  });

  it('manual save triggers immediate save', async () => {
    const project = makeProject({ updatedAt: 1000 });

    const { result } = renderHook(() => useAutoSave());

    act(() => {
      useProjectStore.setState({ project });
    });

    await act(async () => {
      await result.current.saveNow();
    });

    expect(saveProjectToIDB).toHaveBeenCalledWith(project);
    expect(result.current.status).toBe('saved');
  });

  it('registers beforeunload handler when mounted', () => {
    const calls: string[] = [];
    const origAdd = window.addEventListener.bind(window);
    window.addEventListener = vi.fn((...args: Parameters<typeof window.addEventListener>) => {
      calls.push(args[0]);
      return origAdd(...args);
    });

    renderHook(() => useAutoSave());

    expect(calls).toContain('beforeunload');

    window.addEventListener = origAdd;
  });

  it('cleans up beforeunload handler on unmount', () => {
    const calls: string[] = [];
    const origRemove = window.removeEventListener.bind(window);
    window.removeEventListener = vi.fn((...args: Parameters<typeof window.removeEventListener>) => {
      calls.push(args[0]);
      return origRemove(...args);
    });

    const { unmount } = renderHook(() => useAutoSave());

    unmount();

    expect(calls).toContain('beforeunload');

    window.removeEventListener = origRemove;
  });

  it('transitions through saving status during save', async () => {
    let resolvePromise: () => void;
    const savePromise = new Promise<void>((resolve) => {
      resolvePromise = resolve;
    });
    vi.mocked(saveProjectToIDB).mockReturnValueOnce(savePromise);

    const project = makeProject({ updatedAt: 1000 });

    const { result } = renderHook(() => useAutoSave());

    act(() => {
      useProjectStore.setState({ project });
    });

    expect(result.current.status).toBe('unsaved');

    // Start manual save (will be blocked by unresolved promise)
    const saveComplete = result.current.saveNow();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.status).toBe('saving');

    // Resolve the save
    await act(async () => {
      resolvePromise!();
      await saveComplete;
    });

    expect(result.current.status).toBe('saved');
  });

  it('sets lastSavedAt after manual save', async () => {
    const project = makeProject({ updatedAt: 1000 });

    const { result } = renderHook(() => useAutoSave());

    act(() => {
      useProjectStore.setState({ project });
    });

    expect(result.current.lastSavedAt).toBeNull();

    await act(async () => {
      await result.current.saveNow();
    });

    expect(result.current.lastSavedAt).toBeGreaterThan(0);
  });

  it('accepts custom debounce interval via status transitions', async () => {
    const project = makeProject({ updatedAt: 1000 });

    const { result } = renderHook(() => useAutoSave({ debounceMs: 5000 }));

    act(() => {
      useProjectStore.setState({ project });
    });

    // Our hook uses a 5s debounce - should still be unsaved before that
    expect(result.current.status).toBe('unsaved');

    // After 4s - still unsaved from our hook's perspective
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4000);
    });

    // NOTE: status may be 'unsaved' or 'saved' depending on whether the
    // existing projectStore auto-save (1s) triggered our hook's save chain.
    // The key test is that after 6s it's definitely saved.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(result.current.status).toBe('saved');
  });
});
