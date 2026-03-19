import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  executeCoreDawShortcut,
  registerCoreDawShortcutRuntime,
} from '../../src/services/coreDawShortcuts';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';
import { useUIStore } from '../../src/store/uiStore';

describe('coreDawShortcuts', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Core Shortcut Test' });
    useUIStore.getState().setKeyboardContext('timeline');
  });

  it('executes the shared core DAW actions directly through the command layer', async () => {
    const play = vi.fn(() => {
      useTransportStore.getState().play();
    });
    const pause = vi.fn(() => {
      useTransportStore.getState().pause();
    });
    const toggleRecord = vi.fn(() => {
      const transport = useTransportStore.getState();
      transport.setIsRecording(!transport.isRecording);
    });
    const toggleArmTrack = vi.fn((trackId: string, exclusive = true) => {
      useTransportStore.getState().toggleArmTrack(trackId, exclusive);
      useProjectStore.getState().updateTrack(trackId, { armed: true });
    });

    const unregister = registerCoreDawShortcutRuntime({ play, pause, toggleRecord, toggleArmTrack });

    const track = useProjectStore.getState().addTrack('drums');
    useUIStore.getState().setKeyboardContext('timeline', track.id);

    expect(await executeCoreDawShortcut('transport.playPause')).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);
    expect(useTransportStore.getState().isPlaying).toBe(true);

    expect(await executeCoreDawShortcut('transport.playPause')).toBe(true);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(useTransportStore.getState().isPlaying).toBe(false);

    expect(await executeCoreDawShortcut('transport.record')).toBe(true);
    expect(toggleArmTrack).toHaveBeenCalledWith(track.id, true);
    expect(toggleRecord).toHaveBeenCalledTimes(0);
    expect(useTransportStore.getState().armedTrackIds).toEqual([track.id]);

    expect(await executeCoreDawShortcut('transport.record')).toBe(true);
    expect(toggleRecord).toHaveBeenCalledTimes(1);
    expect(useTransportStore.getState().isRecording).toBe(true);

    expect(await executeCoreDawShortcut('transport.loop')).toBe(true);
    expect(useTransportStore.getState().loopEnabled).toBe(true);

    expect(await executeCoreDawShortcut('tracks.mute')).toBe(true);
    expect(await executeCoreDawShortcut('tracks.solo')).toBe(true);

    const updatedTrack = useProjectStore.getState().project?.tracks.find((candidate) => candidate.id === track.id);
    expect(updatedTrack?.muted).toBe(true);
    expect(updatedTrack?.soloed).toBe(true);

    expect(await executeCoreDawShortcut('view.zoomToSelection')).toBe(true);
    expect(useUIStore.getState().timelineZoomRequest).toEqual({
      id: 1,
      mode: 'selection',
    });

    expect(await executeCoreDawShortcut('view.zoomToFit')).toBe(true);
    expect(useUIStore.getState().timelineZoomRequest).toEqual({
      id: 2,
      mode: 'project',
    });

    unregister();
  });

  it('refuses arrangement-only zoom commands outside the timeline context', async () => {
    useUIStore.getState().setKeyboardContext('mixer');

    expect(await executeCoreDawShortcut('view.zoomToSelection')).toBe(false);
    expect(useUIStore.getState().timelineZoomRequest).toBeNull();
  });
});
