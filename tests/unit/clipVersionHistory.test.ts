import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

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
    // Manually set up clip versions
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
                    { cumulativeMixKey: 'v0', isolatedAudioKey: 'v0-iso', waveformPeaks: null, inferredMetas: null, generatedFromContext: false, serverCumulativePath: null },
                    { cumulativeMixKey: 'v1', isolatedAudioKey: 'v1-iso', waveformPeaks: null, inferredMetas: null, generatedFromContext: false, serverCumulativePath: null },
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
                    { cumulativeMixKey: 'v0', isolatedAudioKey: 'original-audio', waveformPeaks: null, inferredMetas: null, generatedFromContext: false, serverCumulativePath: null },
                    { cumulativeMixKey: 'v1', isolatedAudioKey: 'new-audio', waveformPeaks: null, inferredMetas: null, generatedFromContext: false, serverCumulativePath: null },
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
