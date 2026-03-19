import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeCoreKeyboardAction } from '../../src/services/coreKeyboardActions';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';
import { useUIStore } from '../../src/store/uiStore';

describe('coreKeyboardActions', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Core Shortcut Test' });
  });

  it('arms the focused track before toggling record, then records on the next press', async () => {
    const vocals = useProjectStore.getState().addTrack('vocals');
    useUIStore.getState().setKeyboardContext('timeline', vocals.id);

    const toggleRecord = vi.fn().mockResolvedValue(undefined);
    const toggleArmTrack = vi.fn((trackId: string, exclusive = true) => {
      useTransportStore.getState().toggleArmTrack(trackId, exclusive);
      useProjectStore.getState().updateTrack(trackId, { armed: true });
    });

    await executeCoreKeyboardAction('transport.record', {
      play: vi.fn(),
      pause: vi.fn(),
      toggleRecord,
      toggleArmTrack,
    });

    expect(toggleArmTrack).toHaveBeenCalledWith(vocals.id, true);
    expect(toggleRecord).not.toHaveBeenCalled();
    expect(useTransportStore.getState().armedTrackIds).toEqual([vocals.id]);

    await executeCoreKeyboardAction('transport.record', {
      play: vi.fn(),
      pause: vi.fn(),
      toggleRecord,
      toggleArmTrack,
    });

    expect(toggleRecord).toHaveBeenCalledTimes(1);
  });

  it('toggles focused-track solo and mute through the shared command layer', async () => {
    const drums = useProjectStore.getState().addTrack('drums');
    useUIStore.getState().setKeyboardContext('timeline', drums.id);

    await executeCoreKeyboardAction('tracks.mute', {
      play: vi.fn(),
      pause: vi.fn(),
      toggleRecord: vi.fn(),
      toggleArmTrack: vi.fn(),
    });
    await executeCoreKeyboardAction('tracks.solo', {
      play: vi.fn(),
      pause: vi.fn(),
      toggleRecord: vi.fn(),
      toggleArmTrack: vi.fn(),
    });

    const updatedTrack = useProjectStore.getState().project?.tracks.find((track) => track.id === drums.id);
    expect(updatedTrack?.muted).toBe(true);
    expect(updatedTrack?.soloed).toBe(true);
  });

  it('routes arrangement zoom actions only in timeline context', async () => {
    const deps = {
      play: vi.fn(),
      pause: vi.fn(),
      toggleRecord: vi.fn(),
      toggleArmTrack: vi.fn(),
    };

    const didZoomSelection = await executeCoreKeyboardAction('view.zoomToSelection', deps);
    expect(didZoomSelection).toBe(true);
    expect(useUIStore.getState().timelineZoomRequest).toEqual({ id: 1, mode: 'selection' });

    useUIStore.getState().setKeyboardContext('pianoRoll');
    const didZoomFromPianoRoll = await executeCoreKeyboardAction('view.zoomToFit', deps);
    expect(didZoomFromPianoRoll).toBe(false);
    expect(useUIStore.getState().timelineZoomRequest).toEqual({ id: 1, mode: 'selection' });
  });

  it('awaits async transport handlers before resolving play/pause', async () => {
    const play = vi.fn(async () => {
      await Promise.resolve();
      useTransportStore.getState().play();
    });
    const pause = vi.fn(async () => {
      await Promise.resolve();
      useTransportStore.getState().pause();
    });

    const didPlay = await executeCoreKeyboardAction('transport.playPause', {
      play,
      pause,
      toggleRecord: vi.fn(),
      toggleArmTrack: vi.fn(),
    });

    expect(didPlay).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
    expect(useTransportStore.getState().isPlaying).toBe(true);

    const didPause = await executeCoreKeyboardAction('transport.playPause', {
      play,
      pause,
      toggleRecord: vi.fn(),
      toggleArmTrack: vi.fn(),
    });

    expect(didPause).toBe(true);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(useTransportStore.getState().isPlaying).toBe(false);
  });

  it('returns false for invalid action ids from untyped callers', async () => {
    const result = await executeCoreKeyboardAction('invalid.action', {
      play: vi.fn(),
      pause: vi.fn(),
      toggleRecord: vi.fn(),
      toggleArmTrack: vi.fn(),
    });

    expect(result).toBe(false);
  });
});
