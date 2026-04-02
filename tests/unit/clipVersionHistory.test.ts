import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import type { ClipVersion } from '../../src/types/project';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

function makeVersion(overrides: Partial<ClipVersion> & { id: string; generatedAt: number }): ClipVersion {
  return {
    cumulativeMixKey: null,
    isolatedAudioKey: null,
    waveformPeaks: null,
    ...overrides,
  };
}

describe('clip version undo history', () => {
  let trackId: string;
  let clipId: string;

  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    useProjectStore.getState().addTrack('vocals');
    trackId = useProjectStore.getState().project!.tracks[0].id;
    useProjectStore.getState().addClip(trackId, 0, 4);
    clipId = useProjectStore.getState().project!.tracks[0].clips[0].id;
  });

  it('setActiveVersion creates an undo history entry', () => {
    useProjectStore.setState((state) => ({
      project: {
        ...state.project!,
        tracks: state.project!.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId
              ? {
                  ...c,
                  versions: [
                    makeVersion({ id: 'ver-0', generatedAt: 1000, cumulativeMixKey: 'v0', isolatedAudioKey: 'v0-iso' }),
                    makeVersion({ id: 'ver-1', generatedAt: 2000, cumulativeMixKey: 'v1', isolatedAudioKey: 'v1-iso' }),
                  ],
                  activeVersionIdx: 0,
                }
              : c,
          ),
        })),
      },
    }));

    const historyBefore = useProjectStore.getState().getUndoHistory('arrangement').length;
    useProjectStore.getState().setActiveVersion(clipId, 1);
    const historyAfter = useProjectStore.getState().getUndoHistory('arrangement').length;

    expect(historyAfter).toBe(historyBefore + 1);
    const lastEntry = useProjectStore.getState().getUndoHistory('arrangement').pop()!;
    expect(lastEntry.label).toBe('Switch clip version');
  });

  it('setActiveVersion is undoable', () => {
    useProjectStore.setState((state) => ({
      project: {
        ...state.project!,
        tracks: state.project!.tracks.map((t) => ({
          ...t,
          clips: t.clips.map((c) =>
            c.id === clipId
              ? {
                  ...c,
                  isolatedAudioKey: 'original-audio',
                  versions: [
                    makeVersion({ id: 'ver-0', generatedAt: 1000, cumulativeMixKey: 'v0', isolatedAudioKey: 'original-audio' }),
                    makeVersion({ id: 'ver-1', generatedAt: 2000, cumulativeMixKey: 'v1', isolatedAudioKey: 'new-audio' }),
                  ],
                  activeVersionIdx: 0,
                }
              : c,
          ),
        })),
      },
    }));

    useProjectStore.getState().setActiveVersion(clipId, 1);
    const clip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(clip.isolatedAudioKey).toBe('new-audio');
    expect(clip.activeVersionIdx).toBe(1);

    // Undo should restore original version
    useProjectStore.getState().undo('arrangement');
    const restoredClip = useProjectStore.getState().project!.tracks[0].clips[0];
    expect(restoredClip.isolatedAudioKey).toBe('original-audio');
    expect(restoredClip.activeVersionIdx).toBe(0);
  });
});
