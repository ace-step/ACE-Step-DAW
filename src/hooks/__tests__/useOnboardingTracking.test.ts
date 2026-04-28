import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useOnboardingTracking } from '../useOnboardingTracking';
import * as progressModule from '../useOnboardingProgress';

// Track markMilestone calls
const markSpy = vi.spyOn(progressModule, 'markMilestone');

// Create controllable store mocks
let projectState: { id: string | null; tracks: { length: number } } = { id: null, tracks: { length: 0 } };
let uiState = {
  showMixer: false,
  openPianoRollTrackId: null as string | null,
  mainView: 'arrangement' as string,
  showCommandPalette: false,
};

vi.mock('../../store/projectStore', () => ({
  useProjectStore: (selector: (s: any) => any) => selector({ project: projectState.id ? projectState : null }),
}));

vi.mock('../../store/uiStore', () => ({
  useUIStore: (selector: (s: any) => any) => selector(uiState),
}));

describe('useOnboardingTracking', () => {
  beforeEach(() => {
    markSpy.mockClear();
    localStorage.clear();
    projectState = { id: null, tracks: { length: 0 } };
    uiState = { showMixer: false, openPianoRollTrackId: null, mainView: 'arrangement', showCommandPalette: false };
  });

  it('marks created_project when project exists', () => {
    projectState = { id: 'test-123', tracks: { length: 0 } };
    renderHook(() => useOnboardingTracking());
    expect(markSpy).toHaveBeenCalledWith('created_project');
  });

  it('does not mark created_project when project is null', () => {
    renderHook(() => useOnboardingTracking());
    expect(markSpy).not.toHaveBeenCalledWith('created_project');
  });

  it('marks added_track when trackCount > 0', () => {
    projectState = { id: 'test-123', tracks: { length: 2 } };
    renderHook(() => useOnboardingTracking());
    expect(markSpy).toHaveBeenCalledWith('added_track');
  });

  it('marks used_mixer when showMixer is true', () => {
    uiState.showMixer = true;
    renderHook(() => useOnboardingTracking());
    expect(markSpy).toHaveBeenCalledWith('used_mixer');
  });

  it('marks used_piano_roll when openPianoRollTrackId is set', () => {
    uiState.openPianoRollTrackId = 'track-1';
    renderHook(() => useOnboardingTracking());
    expect(markSpy).toHaveBeenCalledWith('used_piano_roll');
  });

  it('marks used_session_view when mainView is session', () => {
    uiState.mainView = 'session';
    renderHook(() => useOnboardingTracking());
    expect(markSpy).toHaveBeenCalledWith('used_session_view');
  });

  it('marks used_command_palette when showCommandPalette is true', () => {
    uiState.showCommandPalette = true;
    renderHook(() => useOnboardingTracking());
    expect(markSpy).toHaveBeenCalledWith('used_command_palette');
  });
});
