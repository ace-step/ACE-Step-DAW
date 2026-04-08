import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useTransportStore } from '../../store/transportStore';
import { useUIStore } from '../../store/uiStore';
import { useProjectStore } from '../../store/projectStore';
import {
  registerCoreDawShortcutRuntime,
  executeCoreDawShortcut,
  isEditableShortcutTarget,
} from '../coreDawShortcuts';

function resetStores() {
  useUIStore.setState(useUIStore.getInitialState(), true);
  useTransportStore.setState({
    isPlaying: false,
    isRecording: false,
    armedTrackIds: [],
    loopEnabled: false,
  });
  useProjectStore.setState({
    project: {
      id: 'proj-1', name: 'Test', bpm: 120,
      timeSignatureNumerator: 4, timeSignatureDenominator: 4,
      duration: 60, keyScale: 'C major',
      tracks: [
        { id: 't1', name: 'Track 1', order: 0, muted: false, soloed: false, clips: [], effectsBypassed: false },
      ],
      markers: [], automationLanes: [], assets: [],
    } as any,
  });
}

describe('coreDawShortcuts', () => {
  let unregister: () => void;
  const playFn = vi.fn();
  const pauseFn = vi.fn();
  const toggleRecordFn = vi.fn();
  const toggleArmTrackFn = vi.fn();

  beforeEach(() => {
    resetStores();
    playFn.mockReset();
    pauseFn.mockReset();
    toggleRecordFn.mockReset();
    toggleArmTrackFn.mockReset();
    unregister = registerCoreDawShortcutRuntime({
      play: playFn,
      pause: pauseFn,
      toggleRecord: toggleRecordFn,
      toggleArmTrack: toggleArmTrackFn,
    });
  });

  afterEach(() => {
    unregister();
  });

  describe('registerCoreDawShortcutRuntime', () => {
    it('returns an unregister function', () => {
      expect(typeof unregister).toBe('function');
    });

    it('after unregistering, playPause returns false', async () => {
      unregister();
      expect(await executeCoreDawShortcut('transport.playPause')).toBe(false);
    });
  });

  describe('transport.playPause', () => {
    it('calls play when not playing', async () => {
      await executeCoreDawShortcut('transport.playPause');
      expect(playFn).toHaveBeenCalledOnce();
    });

    it('calls pause when playing', async () => {
      useTransportStore.setState({ isPlaying: true });
      await executeCoreDawShortcut('transport.playPause');
      expect(pauseFn).toHaveBeenCalledOnce();
    });
  });

  describe('transport.loop', () => {
    it('toggles loop', async () => {
      const before = useTransportStore.getState().loopEnabled;
      await executeCoreDawShortcut('transport.loop');
      expect(useTransportStore.getState().loopEnabled).toBe(!before);
    });
  });

  describe('transport.record', () => {
    it('arms focused track when not recording and track is not armed', async () => {
      useUIStore.setState({ keyboardContext: { scope: 'timeline', trackId: 't1' } });
      await executeCoreDawShortcut('transport.record');
      expect(toggleArmTrackFn).toHaveBeenCalledWith('t1', true);
    });

    it('calls toggleRecord when recording', async () => {
      useTransportStore.setState({ isRecording: true });
      await executeCoreDawShortcut('transport.record');
      expect(toggleRecordFn).toHaveBeenCalledOnce();
    });
  });

  describe('tracks.mute', () => {
    it('returns false outside track scopes', async () => {
      useUIStore.setState({ keyboardContext: { scope: 'global', trackId: null } });
      expect(await executeCoreDawShortcut('tracks.mute')).toBe(false);
    });
  });

  describe('view.zoomToSelection', () => {
    it('returns true in timeline scope', async () => {
      useUIStore.setState({ keyboardContext: { scope: 'timeline', trackId: null } });
      expect(await executeCoreDawShortcut('view.zoomToSelection')).toBe(true);
    });

    it('returns false outside timeline scope', async () => {
      useUIStore.setState({ keyboardContext: { scope: 'mixer', trackId: null } });
      expect(await executeCoreDawShortcut('view.zoomToSelection')).toBe(false);
    });
  });
});

describe('isEditableShortcutTarget', () => {
  it('returns false for null', () => {
    expect(isEditableShortcutTarget(null)).toBe(false);
  });

  it('returns true for input elements', () => {
    const input = document.createElement('input');
    expect(isEditableShortcutTarget(input)).toBe(true);
  });

  it('returns true for textarea elements', () => {
    const textarea = document.createElement('textarea');
    expect(isEditableShortcutTarget(textarea)).toBe(true);
  });

  it('returns true for select elements', () => {
    const select = document.createElement('select');
    expect(isEditableShortcutTarget(select)).toBe(true);
  });

  it('returns true for elements with role=slider', () => {
    const div = document.createElement('div');
    div.setAttribute('role', 'slider');
    expect(isEditableShortcutTarget(div)).toBe(true);
  });

  it('returns false for regular div elements', () => {
    const div = document.createElement('div');
    expect(isEditableShortcutTarget(div)).toBe(false);
  });

  it('returns true for children of role=textbox containers', () => {
    const container = document.createElement('div');
    container.setAttribute('role', 'textbox');
    const child = document.createElement('span');
    container.appendChild(child);
    document.body.appendChild(container);
    expect(isEditableShortcutTarget(child)).toBe(true);
    document.body.removeChild(container);
  });
});
