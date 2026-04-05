import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeCoreKeyboardAction, createCoreKeyboardActions } from '../../src/services/coreKeyboardActions';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';
import { useUIStore } from '../../src/store/uiStore';

function makeDeps(overrides: Partial<ReturnType<typeof defaultDeps>> = {}) {
  return { ...defaultDeps(), ...overrides };
}

function defaultDeps() {
  return {
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn().mockResolvedValue(undefined),
    toggleRecord: vi.fn().mockResolvedValue(undefined),
    toggleArmTrack: vi.fn(),
  };
}

describe('coreKeyboardActions', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.getState().createProject({ name: 'Core Shortcut Test' });
  });

  // ── Invalid action IDs ──

  it('returns false for invalid action ids from untyped callers', async () => {
    const result = await executeCoreKeyboardAction('invalid.action', makeDeps());
    expect(result).toBe(false);
  });

  it('returns false for empty string action id', async () => {
    const result = await executeCoreKeyboardAction('', makeDeps());
    expect(result).toBe(false);
  });

  // ── transport.playPause ──

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

  // ── transport.loop ──

  it('toggles loop on and off', async () => {
    expect(useTransportStore.getState().loopEnabled).toBe(false);
    const result1 = await executeCoreKeyboardAction('transport.loop', makeDeps());
    expect(result1).toBe(true);
    expect(useTransportStore.getState().loopEnabled).toBe(true);

    const result2 = await executeCoreKeyboardAction('transport.loop', makeDeps());
    expect(result2).toBe(true);
    expect(useTransportStore.getState().loopEnabled).toBe(false);
  });

  // ── transport.record ──

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
    // No focused track, no armed tracks
    const result = await executeCoreKeyboardAction('transport.record', makeDeps());
    expect(result).toBe(false);
  });

  // ── tracks.mute ──

  it('toggles focused-track mute in timeline context', async () => {
    const drums = useProjectStore.getState().addTrack('drums');
    useUIStore.getState().setKeyboardContext('timeline', drums.id);

    await executeCoreKeyboardAction('tracks.mute', makeDeps());
    const updatedTrack = useProjectStore.getState().project?.tracks.find((t) => t.id === drums.id);
    expect(updatedTrack?.muted).toBe(true);

    // Toggle back
    await executeCoreKeyboardAction('tracks.mute', makeDeps());
    const toggledBack = useProjectStore.getState().project?.tracks.find((t) => t.id === drums.id);
    expect(toggledBack?.muted).toBe(false);
  });

  it('returns false when not in track scope (e.g., global context)', async () => {
    useUIStore.getState().setKeyboardContext('global');
    const result = await executeCoreKeyboardAction('tracks.mute', makeDeps());
    expect(result).toBe(false);
  });

  // ── tracks.solo ──

  it('toggles focused-track solo', async () => {
    const bass = useProjectStore.getState().addTrack('bass');
    useUIStore.getState().setKeyboardContext('mixer', bass.id);

    await executeCoreKeyboardAction('tracks.solo', makeDeps());
    const updatedTrack = useProjectStore.getState().project?.tracks.find((t) => t.id === bass.id);
    expect(updatedTrack?.soloed).toBe(true);
  });

  // ── tracks.bypassEffects ──

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
    const group = useProjectStore.getState().addTrack('drums');
    useProjectStore.getState().updateTrack(group.id, { isGroup: true });
    useUIStore.getState().setKeyboardContext('timeline', group.id);

    const result = await executeCoreKeyboardAction('tracks.bypassEffects', makeDeps());
    expect(result).toBe(false);
  });

  // ── view.zoomToSelection ──

  it('routes arrangement zoom actions only in timeline context', async () => {
    const deps = makeDeps();
    const didZoomSelection = await executeCoreKeyboardAction('view.zoomToSelection', deps);
    expect(didZoomSelection).toBe(true);
    expect(useUIStore.getState().timelineZoomRequest).toEqual({ id: 1, mode: 'selection' });

    useUIStore.getState().setKeyboardContext('pianoRoll');
    const didZoomFromPianoRoll = await executeCoreKeyboardAction('view.zoomToFit', deps);
    expect(didZoomFromPianoRoll).toBe(false);
    // Unchanged from previous request
    expect(useUIStore.getState().timelineZoomRequest).toEqual({ id: 1, mode: 'selection' });
  });

  // ── view.zoomToFit ──

  it('zooms to fit project in timeline context', async () => {
    const result = await executeCoreKeyboardAction('view.zoomToFit', makeDeps());
    expect(result).toBe(true);
    expect(useUIStore.getState().timelineZoomRequest).toEqual({ id: 1, mode: 'project' });
  });

  // ── createCoreKeyboardActions factory ──

  it('wraps executeCoreKeyboardAction with deps', async () => {
    const deps = makeDeps();
    const actions = createCoreKeyboardActions(deps);

    const result = await actions.execute('transport.loop');
    expect(result).toBe(true);
    expect(useTransportStore.getState().loopEnabled).toBe(true);
  });
});
