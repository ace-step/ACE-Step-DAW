import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../../store/projectStore';
import { useTransportStore } from '../../store/transportStore';
import { useUIStore } from '../../store/uiStore';
import { executeCoreKeyboardAction, type CoreKeyboardActionDeps } from '../coreKeyboardActions';

function makeDeps(overrides?: Partial<CoreKeyboardActionDeps>): CoreKeyboardActionDeps {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    toggleRecord: vi.fn(),
    toggleArmTrack: vi.fn(),
    ...overrides,
  };
}

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
      id: 'proj-1',
      name: 'Test',
      bpm: 120,
      timeSignatureNumerator: 4,
      timeSignatureDenominator: 4,
      duration: 60,
      keyScale: 'C major',
      tracks: [
        { id: 't1', name: 'Track 1', order: 0, muted: false, soloed: false, clips: [], effectsBypassed: false },
        { id: 't2', name: 'Track 2', order: 1, muted: true, soloed: false, clips: [], effectsBypassed: true },
      ],
      markers: [],
      automationLanes: [],
      assets: [],
    } as any,
  });
}

describe('executeCoreKeyboardAction', () => {
  beforeEach(resetStores);

  it('returns false for unknown action ids', async () => {
    const deps = makeDeps();
    expect(await executeCoreKeyboardAction('unknown.action', deps)).toBe(false);
  });

  describe('transport.playPause', () => {
    it('calls play when not playing', async () => {
      const deps = makeDeps();
      await executeCoreKeyboardAction('transport.playPause', deps);
      expect(deps.play).toHaveBeenCalledOnce();
      expect(deps.pause).not.toHaveBeenCalled();
    });

    it('calls pause when playing', async () => {
      useTransportStore.setState({ isPlaying: true });
      const deps = makeDeps();
      await executeCoreKeyboardAction('transport.playPause', deps);
      expect(deps.pause).toHaveBeenCalledOnce();
      expect(deps.play).not.toHaveBeenCalled();
    });
  });

  describe('transport.loop', () => {
    it('toggles loop state', async () => {
      const deps = makeDeps();
      const before = useTransportStore.getState().loopEnabled;
      await executeCoreKeyboardAction('transport.loop', deps);
      expect(useTransportStore.getState().loopEnabled).toBe(!before);
    });
  });

  describe('transport.record', () => {
    it('stops recording when already recording', async () => {
      useTransportStore.setState({ isRecording: true });
      const deps = makeDeps();
      const result = await executeCoreKeyboardAction('transport.record', deps);
      expect(result).toBe(true);
      expect(deps.toggleRecord).toHaveBeenCalledOnce();
    });

    it('arms focused track when not armed', async () => {
      useUIStore.setState({ keyboardContext: { scope: 'timeline', trackId: 't1' } });
      const deps = makeDeps();
      const result = await executeCoreKeyboardAction('transport.record', deps);
      expect(result).toBe(true);
      expect(deps.toggleArmTrack).toHaveBeenCalledWith('t1', true);
    });

    it('starts recording when tracks are already armed', async () => {
      useTransportStore.setState({ armedTrackIds: ['t1'] });
      useUIStore.setState({ keyboardContext: { scope: 'timeline', trackId: 't1' } });
      const deps = makeDeps();
      const result = await executeCoreKeyboardAction('transport.record', deps);
      expect(result).toBe(true);
      expect(deps.toggleRecord).toHaveBeenCalledOnce();
    });
  });

  describe('tracks.mute', () => {
    it('returns false when not in a track scope', async () => {
      useUIStore.setState({ keyboardContext: { scope: 'global', trackId: null } });
      const deps = makeDeps();
      const result = await executeCoreKeyboardAction('tracks.mute', deps);
      expect(result).toBe(false);
    });

    it('toggles mute on the focused track', async () => {
      useUIStore.setState({ keyboardContext: { scope: 'timeline', trackId: 't1' } });
      const deps = makeDeps();
      const result = await executeCoreKeyboardAction('tracks.mute', deps);
      expect(result).toBe(true);
    });
  });

  describe('tracks.solo', () => {
    it('returns false when not in a track scope', async () => {
      useUIStore.setState({ keyboardContext: { scope: 'global', trackId: null } });
      const deps = makeDeps();
      const result = await executeCoreKeyboardAction('tracks.solo', deps);
      expect(result).toBe(false);
    });
  });

  describe('view.zoomToSelection', () => {
    it('triggers zoom when in timeline scope', async () => {
      useUIStore.setState({ keyboardContext: { scope: 'timeline', trackId: null } });
      const deps = makeDeps();
      const result = await executeCoreKeyboardAction('view.zoomToSelection', deps);
      expect(result).toBe(true);
    });

    it('returns false when not in timeline scope', async () => {
      useUIStore.setState({ keyboardContext: { scope: 'mixer', trackId: null } });
      const deps = makeDeps();
      const result = await executeCoreKeyboardAction('view.zoomToSelection', deps);
      expect(result).toBe(false);
    });
  });

  describe('view.zoomToFit', () => {
    it('triggers zoom when in timeline scope', async () => {
      useUIStore.setState({ keyboardContext: { scope: 'timeline', trackId: null } });
      const deps = makeDeps();
      const result = await executeCoreKeyboardAction('view.zoomToFit', deps);
      expect(result).toBe(true);
    });
  });
});
