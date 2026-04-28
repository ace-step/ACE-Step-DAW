import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  executeCoreDawShortcut,
  isEditableShortcutTarget,
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

  it('returns false for transport actions when no runtime is registered', async () => {
    expect(await executeCoreDawShortcut('transport.playPause')).toBe(false);
    expect(await executeCoreDawShortcut('transport.record')).toBe(false);
  });

  it('cleans up runtime on unregister and blocks subsequent actions', async () => {
    const play = vi.fn();
    const pause = vi.fn();
    const unregister = registerCoreDawShortcutRuntime({
      play,
      pause,
      toggleRecord: vi.fn(),
    });

    expect(await executeCoreDawShortcut('transport.playPause')).toBe(true);
    expect(play).toHaveBeenCalledTimes(1);

    unregister();

    expect(await executeCoreDawShortcut('transport.playPause')).toBe(false);
    expect(play).toHaveBeenCalledTimes(1);
  });

  it('toggles effects bypass for the focused track', async () => {
    const unregister = registerCoreDawShortcutRuntime({
      play: vi.fn(),
      pause: vi.fn(),
      toggleRecord: vi.fn(),
    });

    const track = useProjectStore.getState().addTrack('synth');
    useProjectStore.getState().addTrackEffect(track.id, 'reverb');
    useUIStore.getState().setKeyboardContext('timeline', track.id);

    expect(await executeCoreDawShortcut('tracks.bypassEffects')).toBe(true);

    const updatedTrack = useProjectStore.getState().project?.tracks.find(
      (t) => t.id === track.id,
    );
    expect(updatedTrack?.effectsBypassed).toBe(true);

    unregister();
  });

  it('refuses effects bypass outside track scopes', async () => {
    const track = useProjectStore.getState().addTrack('synth');
    useUIStore.getState().setKeyboardContext('global');

    expect(await executeCoreDawShortcut('tracks.bypassEffects')).toBe(false);
  });

  it('refuses effects bypass on group tracks', async () => {
    const group = useProjectStore.getState().createGroupTrack('My Group');
    useUIStore.getState().setKeyboardContext('timeline', group.id);

    expect(await executeCoreDawShortcut('tracks.bypassEffects')).toBe(false);
  });

  it('toggles mute/solo on group tracks via group-specific store methods', async () => {
    const unregister = registerCoreDawShortcutRuntime({
      play: vi.fn(),
      pause: vi.fn(),
      toggleRecord: vi.fn(),
    });

    const group = useProjectStore.getState().createGroupTrack('My Group');
    useUIStore.getState().setKeyboardContext('timeline', group.id);

    expect(await executeCoreDawShortcut('tracks.mute')).toBe(true);
    expect(
      useProjectStore.getState().project?.tracks.find((t) => t.id === group.id)?.muted,
    ).toBe(true);

    expect(await executeCoreDawShortcut('tracks.solo')).toBe(true);
    expect(
      useProjectStore.getState().project?.tracks.find((t) => t.id === group.id)?.soloed,
    ).toBe(true);

    unregister();
  });

  it('refuses track flag toggles outside valid scopes', async () => {
    const track = useProjectStore.getState().addTrack('drums');
    useUIStore.getState().setKeyboardContext('global');

    expect(await executeCoreDawShortcut('tracks.mute')).toBe(false);
    expect(await executeCoreDawShortcut('tracks.solo')).toBe(false);
  });
});

describe('isEditableShortcutTarget', () => {
  it('returns true for HTMLInputElement', () => {
    const input = document.createElement('input');
    expect(isEditableShortcutTarget(input)).toBe(true);
  });

  it('returns true for HTMLTextAreaElement', () => {
    const textarea = document.createElement('textarea');
    expect(isEditableShortcutTarget(textarea)).toBe(true);
  });

  it('returns true for HTMLSelectElement', () => {
    const select = document.createElement('select');
    expect(isEditableShortcutTarget(select)).toBe(true);
  });

  it('returns true for contenteditable elements', () => {
    const div = document.createElement('div');
    div.setAttribute('contenteditable', 'true');
    expect(isEditableShortcutTarget(div)).toBe(true);
  });

  it('returns true for elements with role="slider"', () => {
    const div = document.createElement('div');
    div.setAttribute('role', 'slider');
    expect(isEditableShortcutTarget(div)).toBe(true);
  });

  it('returns true for elements nested inside a contenteditable container', () => {
    const container = document.createElement('div');
    container.setAttribute('contenteditable', 'true');
    const span = document.createElement('span');
    container.appendChild(span);
    expect(isEditableShortcutTarget(span)).toBe(true);
  });

  it('returns true for elements nested inside a role="textbox" container', () => {
    const container = document.createElement('div');
    container.setAttribute('role', 'textbox');
    const span = document.createElement('span');
    container.appendChild(span);
    expect(isEditableShortcutTarget(span)).toBe(true);
  });

  it('returns false for regular div elements', () => {
    const div = document.createElement('div');
    expect(isEditableShortcutTarget(div)).toBe(false);
  });

  it('returns false for button elements', () => {
    const button = document.createElement('button');
    expect(isEditableShortcutTarget(button)).toBe(false);
  });

  it('returns false for null target', () => {
    expect(isEditableShortcutTarget(null)).toBe(false);
  });

  it('returns false for non-HTMLElement targets', () => {
    const textNode = document.createTextNode('hello');
    expect(isEditableShortcutTarget(textNode)).toBe(false);
  });
});
