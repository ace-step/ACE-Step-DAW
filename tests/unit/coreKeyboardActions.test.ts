import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createCoreKeyboardActions,
  executeCoreKeyboardAction,
} from '../../src/services/coreKeyboardActions';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';
import { useUIStore } from '../../src/store/uiStore';

function defaultDeps() {
  return {
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    toggleRecord: vi.fn().mockResolvedValue(undefined),
    toggleArmTrack: vi.fn(),
  };
}

function makeDeps(overrides: Partial<ReturnType<typeof defaultDeps>> = {}) {
  return { ...defaultDeps(), ...overrides };
}

describe('coreKeyboardActions', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Core Shortcut Test' });
  });

  it('returns false for invalid action ids from untyped callers', async () => {
    await expect(executeCoreKeyboardAction('invalid.action', makeDeps())).resolves.toBe(false);
    await expect(executeCoreKeyboardAction('', makeDeps())).resolves.toBe(false);
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

    const didPlay = await executeCoreKeyboardAction('transport.playPause', makeDeps({ play, pause }));
    expect(didPlay).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
    expect(useTransportStore.getState().isPlaying).toBe(true);

    const didPause = await executeCoreKeyboardAction('transport.playPause', makeDeps({ play, pause }));
    expect(didPause).toBe(true);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(useTransportStore.getState().isPlaying).toBe(false);
  });

  it('toggles loop on and off', async () => {
    expect(useTransportStore.getState().loopEnabled).toBe(false);

    expect(await executeCoreKeyboardAction('transport.loop', makeDeps())).toBe(true);
    expect(useTransportStore.getState().loopEnabled).toBe(true);

    expect(await executeCoreKeyboardAction('transport.loop', makeDeps())).toBe(true);
    expect(useTransportStore.getState().loopEnabled).toBe(false);
  });

  it('arms the focused track before toggling record, then records on the next press', async () => {
    const vocals = useProjectStore.getState().addTrack('vocals');
    useUIStore.getState().setKeyboardContext('timeline', vocals.id);

    const toggleRecord = vi.fn().mockResolvedValue(undefined);
    const toggleArmTrack = vi.fn((trackId: string, exclusive = true) => {
      useTransportStore.getState().toggleArmTrack(trackId, exclusive);
      useProjectStore.getState().updateTrack(trackId, { armed: true });
    });

    await executeCoreKeyboardAction('transport.record', makeDeps({ toggleRecord, toggleArmTrack }));
    expect(toggleArmTrack).toHaveBeenCalledWith(vocals.id, true);
    expect(toggleRecord).not.toHaveBeenCalled();
    expect(useTransportStore.getState().armedTrackIds).toEqual([vocals.id]);

    await executeCoreKeyboardAction('transport.record', makeDeps({ toggleRecord, toggleArmTrack }));
    expect(toggleRecord).toHaveBeenCalledTimes(1);
  });

  it('stops recording when already recording', async () => {
    useTransportStore.setState({ isRecording: true });
    const toggleRecord = vi.fn().mockResolvedValue(undefined);

    const result = await executeCoreKeyboardAction('transport.record', makeDeps({ toggleRecord }));
    expect(result).toBe(true);
    expect(toggleRecord).toHaveBeenCalledTimes(1);
  });

  it('returns false for record when no track focused and none armed', async () => {
    const result = await executeCoreKeyboardAction('transport.record', makeDeps());
    expect(result).toBe(false);
  });

  it('toggles focused-track mute in timeline context', async () => {
    const drums = useProjectStore.getState().addTrack('drums');
    useUIStore.getState().setKeyboardContext('timeline', drums.id);

    await executeCoreKeyboardAction('tracks.mute', makeDeps());
    const mutedTrack = useProjectStore.getState().project?.tracks.find((t) => t.id === drums.id);
    expect(mutedTrack?.muted).toBe(true);

    await executeCoreKeyboardAction('tracks.mute', makeDeps());
    const unmutedTrack = useProjectStore.getState().project?.tracks.find((t) => t.id === drums.id);
    expect(unmutedTrack?.muted).toBe(false);
  });

  it('returns false when muting outside track scope', async () => {
    useUIStore.getState().setKeyboardContext('global');
    const result = await executeCoreKeyboardAction('tracks.mute', makeDeps());
    expect(result).toBe(false);
  });

  it('toggles focused-track solo', async () => {
    const bass = useProjectStore.getState().addTrack('bass');
    useUIStore.getState().setKeyboardContext('mixer', bass.id);

    await executeCoreKeyboardAction('tracks.solo', makeDeps());
    const updatedTrack = useProjectStore.getState().project?.tracks.find((t) => t.id === bass.id);
    expect(updatedTrack?.soloed).toBe(true);
  });

  it('uses group-specific store methods for muting and soloing group tracks', async () => {
    const group = useProjectStore.getState().createGroupTrack('Drums Group');
    useUIStore.getState().setKeyboardContext('mixer', group.id);

    await executeCoreKeyboardAction('tracks.mute', makeDeps());
    expect(useProjectStore.getState().project?.tracks.find((t) => t.id === group.id)?.muted).toBe(true);

    await executeCoreKeyboardAction('tracks.solo', makeDeps());
    expect(useProjectStore.getState().project?.tracks.find((t) => t.id === group.id)?.soloed).toBe(true);
  });

  it('toggles effects bypass on focused track', async () => {
    const vocals = useProjectStore.getState().addTrack('vocals');
    useProjectStore.getState().addTrackEffect(vocals.id, 'reverb');
    useUIStore.getState().setKeyboardContext('timeline', vocals.id);

    const result = await executeCoreKeyboardAction('tracks.bypassEffects', makeDeps());
    expect(result).toBe(true);

    const track = useProjectStore.getState().project?.tracks.find((t) => t.id === vocals.id);
    expect(track?.effectsBypassed).toBe(true);
  });

  it('returns false for effects bypass when not in track scope', async () => {
    useUIStore.getState().setKeyboardContext('global');
    const result = await executeCoreKeyboardAction('tracks.bypassEffects', makeDeps());
    expect(result).toBe(false);
  });

  it('returns false for effects bypass on group tracks', async () => {
    const group = useProjectStore.getState().createGroupTrack('My Group');
    useUIStore.getState().setKeyboardContext('timeline', group.id);

    const result = await executeCoreKeyboardAction('tracks.bypassEffects', makeDeps());
    expect(result).toBe(false);
  });

  it('routes arrangement zoom actions only in timeline context', async () => {
    const didZoomSelection = await executeCoreKeyboardAction('view.zoomToSelection', makeDeps());
    expect(didZoomSelection).toBe(true);
    expect(useUIStore.getState().timelineZoomRequest).toEqual({ id: 1, mode: 'selection' });

    useUIStore.getState().setKeyboardContext('pianoRoll');
    const didZoomFromPianoRoll = await executeCoreKeyboardAction('view.zoomToFit', makeDeps());
    expect(didZoomFromPianoRoll).toBe(false);
    expect(useUIStore.getState().timelineZoomRequest).toEqual({ id: 1, mode: 'selection' });
  });

  it('zooms to fit project in timeline context', async () => {
    const result = await executeCoreKeyboardAction('view.zoomToFit', makeDeps());
    expect(result).toBe(true);
    expect(useUIStore.getState().timelineZoomRequest).toEqual({ id: 1, mode: 'project' });
  });

  describe('createCoreKeyboardActions', () => {
    it('returns an object with an execute method that delegates to executeCoreKeyboardAction', async () => {
      const play = vi.fn(() => {
        useTransportStore.getState().play();
      });

      const actions = createCoreKeyboardActions(makeDeps({ play }));

      expect(typeof actions.execute).toBe('function');
      const result = await actions.execute('transport.playPause');
      expect(result).toBe(true);
      expect(play).toHaveBeenCalledTimes(1);
      expect(useTransportStore.getState().isPlaying).toBe(true);
    });

    it('returns false for invalid action IDs via the factory', async () => {
      const actions = createCoreKeyboardActions(makeDeps());
      const result = await actions.execute('nonexistent.action');
      expect(result).toBe(false);
    });
  });
});
