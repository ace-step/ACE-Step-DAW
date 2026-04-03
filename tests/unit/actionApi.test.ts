import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { createProjectActionApi } from '../../src/services/actionApi';

vi.mock('../../src/hooks/useToast', () => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('project action API', () => {
  const actionApi = createProjectActionApi(useProjectStore);
  const createObjectURL = vi.fn(() => 'blob:test');
  const revokeObjectURL = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
  });

  it('returns structured errors with recovery suggestions for invalid track actions', () => {
    useProjectStore.getState().createProject({ name: 'Action API Test' });

    const result = actionApi.addClip({
      trackId: 'missing-track',
      clip: {
        startTime: 0,
        duration: 4,
        prompt: 'Missing target track',
        globalCaption: '',
        lyrics: '',
        source: 'uploaded',
      },
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected an action error result');
    }

    expect(result.error.code).toBe('TRACK_NOT_FOUND');
    expect(result.error.context).toMatchObject({
      action: 'addClip',
      trackId: 'missing-track',
    });
    expect(result.error.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'addTrack',
        }),
      ]),
    );
  });

  it('reports sequencer validation failures with actionable context', () => {
    useProjectStore.getState().createProject({ name: 'Sequencer Validation Test' });
    const track = useProjectStore.getState().addTrack('drums', 'sequencer');
    const rowId = useProjectStore.getState().project?.tracks[0]?.sequencerPattern?.rows[0]?.id;

    expect(rowId).not.toBeUndefined();

    const result = actionApi.toggleSequencerStep({
      trackId: track.id,
      rowId: 'missing-row',
      stepIndex: 2,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected an action error result');
    }

    expect(result.error.code).toBe('SEQUENCER_ROW_NOT_FOUND');
    expect(result.error.context).toMatchObject({
      action: 'toggleSequencerStep',
      trackId: track.id,
      rowId: 'missing-row',
      stepIndex: 2,
    });
    expect(result.error.suggestions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'listSequencerRows',
        }),
      ]),
    );
  });

  it('returns success payloads and clears the last action error after recovery', () => {
    useProjectStore.getState().createProject({ name: 'Recovery Test' });
    const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    const clip = useProjectStore.getState().ensureMidiClip(track.id, 0, 4);

    const failure = actionApi.exportMidiClip({ clipId: clip.id });
    expect(failure.ok).toBe(false);

    const success = actionApi.addMidiNote({
      clipId: clip.id,
      note: {
        pitch: 60,
        startBeat: 0,
        durationBeats: 1,
        velocity: 0.8,
      },
    });

    expect(success.ok).toBe(true);
    if (!success.ok) {
      throw new Error('Expected a successful action result');
    }

    expect(success.value.clipId).toBe(clip.id);
    expect(typeof success.value.noteId).toBe('string');
    expect(actionApi.getLastError()).toBeNull();

    const exported = actionApi.exportMidiClip({ clipId: clip.id });
    expect(exported.ok).toBe(true);
    if (!exported.ok) {
      throw new Error('Expected a successful MIDI export result');
    }

    expect(exported.value.fileName).toContain('Recovery Test');
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledTimes(1);
  });

  it('resizes MIDI notes through the shared action API', () => {
    useProjectStore.getState().createProject({ name: 'Resize API Test' });
    const track = useProjectStore.getState().addTrack('keyboard', 'pianoRoll');
    const clip = useProjectStore.getState().ensureMidiClip(track.id, 0, 4);
    const noteId = useProjectStore.getState().addMidiNote(clip.id, {
      pitch: 60,
      startBeat: 1,
      durationBeats: 2,
      velocity: 0.8,
    });

    const result = actionApi.resizeMidiNote({
      clipId: clip.id,
      noteId: noteId!,
      edge: 'left',
      startBeat: 0.5,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected a successful MIDI resize action result');
    }

    expect(result.value).toEqual({
      clipId: clip.id,
      noteId: noteId!,
      startBeat: 0.5,
      durationBeats: 2.5,
    });
  });
});
