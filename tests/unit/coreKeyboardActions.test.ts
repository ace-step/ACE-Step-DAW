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

  it('toggles loop on transport', async () => {
    const deps = {
      play: vi.fn(), pause: vi.fn(),
      toggleRecord: vi.fn(), toggleArmTrack: vi.fn(),
    };

    expect(useTransportStore.getState().loopEnabled).toBe(false);
    const result = await executeCoreKeyboardAction('transport.loop', deps);
    expect(result).toBe(true);
    expect(useTransportStore.getState().loopEnabled).toBe(true);
  });

  it('bypasses effects on focused track', async () => {
    const synth = useProjectStore.getState().addTrack('synth');
    useUIStore.getState().setKeyboardContext('timeline', synth.id);

    const deps = {
      play: vi.fn(), pause: vi.fn(),
      toggleRecord: vi.fn(), toggleArmTrack: vi.fn(),
    };

    const result = await executeCoreKeyboardAction('tracks.bypassEffects', deps);
    expect(result).toBe(true);
  });

  it('returns false for bypassEffects when not in track scope', async () => {
    useUIStore.getState().setKeyboardContext('global');
    const deps = {
      play: vi.fn(), pause: vi.fn(),
      toggleRecord: vi.fn(), toggleArmTrack: vi.fn(),
    };

    const result = await executeCoreKeyboardAction('tracks.bypassEffects', deps);
    expect(result).toBe(false);
  });

  it('returns false for mute/solo when not in track scope', async () => {
    useUIStore.getState().setKeyboardContext('global');
    const deps = {
      play: vi.fn(), pause: vi.fn(),
      toggleRecord: vi.fn(), toggleArmTrack: vi.fn(),
    };

    expect(await executeCoreKeyboardAction('tracks.mute', deps)).toBe(false);
    expect(await executeCoreKeyboardAction('tracks.solo', deps)).toBe(false);
  });

  it('returns false for record when no track is focused and none are armed', async () => {
    const deps = {
      play: vi.fn(), pause: vi.fn(),
      toggleRecord: vi.fn(), toggleArmTrack: vi.fn(),
    };

    // No track focused, none armed
    useUIStore.getState().setKeyboardContext('timeline');
    const result = await executeCoreKeyboardAction('transport.record', deps);
    expect(result).toBe(false);
  });

  it('stops recording when already recording', async () => {
    const toggleRecord = vi.fn().mockResolvedValue(undefined);
    useTransportStore.setState({ isRecording: true });

    const result = await executeCoreKeyboardAction('transport.record', {
      play: vi.fn(), pause: vi.fn(),
      toggleRecord, toggleArmTrack: vi.fn(),
    });

    expect(result).toBe(true);
    expect(toggleRecord).toHaveBeenCalled();
  });

  it('creates action wrapper via createCoreKeyboardActions', async () => {
    const { createCoreKeyboardActions } = await import('../../src/services/coreKeyboardActions');
    const deps = {
      play: vi.fn(), pause: vi.fn(),
      toggleRecord: vi.fn(), toggleArmTrack: vi.fn(),
    };

    const actions = createCoreKeyboardActions(deps);
    expect(typeof actions.execute).toBe('function');

    const result = await actions.execute('transport.loop');
    expect(result).toBe(true);
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
