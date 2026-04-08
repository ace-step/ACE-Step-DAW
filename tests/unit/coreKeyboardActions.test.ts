import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCoreKeyboardActions,
  executeCoreKeyboardAction,
} from '../../src/services/coreKeyboardActions';
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

  it('toggles loop state via transport store', async () => {
    const deps = {
      play: vi.fn(),
      pause: vi.fn(),
      toggleRecord: vi.fn(),
      toggleArmTrack: vi.fn(),
    };

    expect(useTransportStore.getState().loopEnabled).toBe(false);

    const result = await executeCoreKeyboardAction('transport.loop', deps);
    expect(result).toBe(true);
    expect(useTransportStore.getState().loopEnabled).toBe(true);

    await executeCoreKeyboardAction('transport.loop', deps);
    expect(useTransportStore.getState().loopEnabled).toBe(false);
  });

  it('toggles effects bypass for the focused track', async () => {
    const track = useProjectStore.getState().addTrack('synth');
    useProjectStore.getState().addTrackEffect(track.id, 'reverb');
    useUIStore.getState().setKeyboardContext('timeline', track.id);

    const result = await executeCoreKeyboardAction('tracks.bypassEffects', {
      play: vi.fn(),
      pause: vi.fn(),
      toggleRecord: vi.fn(),
      toggleArmTrack: vi.fn(),
    });

    expect(result).toBe(true);
    const updatedTrack = useProjectStore.getState().project?.tracks.find(
      (t) => t.id === track.id,
    );
    expect(updatedTrack?.effectsBypassed).toBe(true);
  });

  it('refuses effects bypass on group tracks', async () => {
    const group = useProjectStore.getState().createGroupTrack('My Group');
    useUIStore.getState().setKeyboardContext('timeline', group.id);

    const result = await executeCoreKeyboardAction('tracks.bypassEffects', {
      play: vi.fn(),
      pause: vi.fn(),
      toggleRecord: vi.fn(),
      toggleArmTrack: vi.fn(),
    });

    expect(result).toBe(false);
  });

  it('refuses effects bypass outside track-related scopes', async () => {
    const track = useProjectStore.getState().addTrack('synth');
    useUIStore.getState().setKeyboardContext('global');

    const result = await executeCoreKeyboardAction('tracks.bypassEffects', {
      play: vi.fn(),
      pause: vi.fn(),
      toggleRecord: vi.fn(),
      toggleArmTrack: vi.fn(),
    });

    expect(result).toBe(false);
  });

  it('stops recording when already recording', async () => {
    const track = useProjectStore.getState().addTrack('vocals');
    useUIStore.getState().setKeyboardContext('timeline', track.id);

    const toggleRecord = vi.fn().mockResolvedValue(undefined);
    const toggleArmTrack = vi.fn((trackId: string, exclusive = true) => {
      useTransportStore.getState().toggleArmTrack(trackId, exclusive);
    });

    // Arm the track first
    useTransportStore.getState().toggleArmTrack(track.id, true);
    // Set recording state
    useTransportStore.getState().setIsRecording(true);

    await executeCoreKeyboardAction('transport.record', {
      play: vi.fn(),
      pause: vi.fn(),
      toggleRecord,
      toggleArmTrack,
    });

    expect(toggleRecord).toHaveBeenCalledTimes(1);
    expect(toggleArmTrack).not.toHaveBeenCalled();
  });

  it('returns false for record when no tracks are armed and focused track is already armed', async () => {
    // Create a scenario where no track can be armed and none are armed
    useProjectStore.setState({
      project: { ...useProjectStore.getState().project!, tracks: [] },
    });

    const result = await executeCoreKeyboardAction('transport.record', {
      play: vi.fn(),
      pause: vi.fn(),
      toggleRecord: vi.fn(),
      toggleArmTrack: vi.fn(),
    });

    // No focused track (empty project) and no armed tracks → false
    expect(result).toBe(false);
  });

  it('uses group-specific store methods for muting/soloing group tracks', async () => {
    const group = useProjectStore.getState().createGroupTrack('Drums Group');
    useUIStore.getState().setKeyboardContext('mixer', group.id);

    const deps = {
      play: vi.fn(),
      pause: vi.fn(),
      toggleRecord: vi.fn(),
      toggleArmTrack: vi.fn(),
    };

    await executeCoreKeyboardAction('tracks.mute', deps);
    expect(
      useProjectStore.getState().project?.tracks.find((t) => t.id === group.id)?.muted,
    ).toBe(true);

    await executeCoreKeyboardAction('tracks.solo', deps);
    expect(
      useProjectStore.getState().project?.tracks.find((t) => t.id === group.id)?.soloed,
    ).toBe(true);
  });

  describe('createCoreKeyboardActions', () => {
    it('returns an object with an execute method that delegates to executeCoreKeyboardAction', async () => {
      const play = vi.fn(() => {
        useTransportStore.getState().play();
      });

      const actions = createCoreKeyboardActions({
        play,
        pause: vi.fn(),
        toggleRecord: vi.fn(),
        toggleArmTrack: vi.fn(),
      });

      expect(typeof actions.execute).toBe('function');

      const result = await actions.execute('transport.playPause');
      expect(result).toBe(true);
      expect(play).toHaveBeenCalledTimes(1);
      expect(useTransportStore.getState().isPlaying).toBe(true);
    });

    it('returns false for invalid action IDs via the factory', async () => {
      const actions = createCoreKeyboardActions({
        play: vi.fn(),
        pause: vi.fn(),
        toggleRecord: vi.fn(),
        toggleArmTrack: vi.fn(),
      });

      const result = await actions.execute('nonexistent.action');
      expect(result).toBe(false);
    });
  });
});
