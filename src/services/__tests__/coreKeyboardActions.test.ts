import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useProjectStore } from '../../store/projectStore';
import { useTransportStore } from '../../store/transportStore';
import { useUIStore } from '../../store/uiStore';
import type { Project, Track } from '../../types/project';
import {
  executeCoreKeyboardAction,
  createCoreKeyboardActions,
  type CoreKeyboardActionDeps,
} from '../coreKeyboardActions';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    trackName: 'keyboard',
    trackType: 'pianoRoll',
    displayName: 'Keys',
    color: '#22c55e',
    order: 1,
    volume: 0.8,
    muted: false,
    soloed: false,
    effects: [],
    clips: [],
    ...overrides,
  } as Track;
}

function makeProject(tracks: Track[] = [], overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'Test',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    totalDuration: 8,
    globalCaption: '',
    generationDefaults: { inferenceSteps: 8, guidanceScale: 3, shift: 0, thinking: false, model: 'test' },
    tracks,
    markers: [],
    assets: [],
    trackPresets: [],
    automationLanes: [],
    returnTracks: [],
    tempoMap: [],
    timeSignatureMap: [],
    mastering: undefined,
    measures: 8,
    masterVolume: 0.8,
    ...overrides,
  } as Project;
}

function makeDeps(overrides: Partial<CoreKeyboardActionDeps> = {}): CoreKeyboardActionDeps {
  return {
    play: vi.fn(),
    pause: vi.fn(),
    toggleRecord: vi.fn(),
    toggleArmTrack: vi.fn(),
    ...overrides,
  };
}

function setKeyboardScope(scope: 'timeline' | 'mixer' | 'pianoRoll' | 'global', trackId: string | null = null) {
  useUIStore.getState().setKeyboardContext(scope, trackId);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('coreKeyboardActions', () => {
  beforeEach(() => {
    // Reset stores to defaults
    useProjectStore.setState({ project: null });
    useTransportStore.setState({
      isPlaying: false,
      isRecording: false,
      loopEnabled: false,
      armedTrackIds: [],
    });
    useUIStore.getState().setKeyboardContext('global', null);
  });

  // ─── Invalid / unknown action ─────────────────────────────────────────────

  describe('unknown action', () => {
    it('returns false for an unrecognized action id', async () => {
      const result = await executeCoreKeyboardAction('unknown.action', makeDeps());
      expect(result).toBe(false);
    });

    it('returns false for an empty action id', async () => {
      const result = await executeCoreKeyboardAction('', makeDeps());
      expect(result).toBe(false);
    });
  });

  // ─── transport.playPause ──────────────────────────────────────────────────

  describe('transport.playPause', () => {
    it('calls play when transport is stopped', async () => {
      const deps = makeDeps();
      const result = await executeCoreKeyboardAction('transport.playPause', deps);
      expect(result).toBe(true);
      expect(deps.play).toHaveBeenCalledTimes(1);
      expect(deps.pause).not.toHaveBeenCalled();
    });

    it('calls pause when transport is playing', async () => {
      useTransportStore.setState({ isPlaying: true });
      const deps = makeDeps();
      const result = await executeCoreKeyboardAction('transport.playPause', deps);
      expect(result).toBe(true);
      expect(deps.pause).toHaveBeenCalledTimes(1);
      expect(deps.play).not.toHaveBeenCalled();
    });
  });

  // ─── transport.loop ───────────────────────────────────────────────────────

  describe('transport.loop', () => {
    it('toggles loop on', async () => {
      useTransportStore.setState({ loopEnabled: false });
      const result = await executeCoreKeyboardAction('transport.loop', makeDeps());
      expect(result).toBe(true);
      expect(useTransportStore.getState().loopEnabled).toBe(true);
    });

    it('toggles loop off', async () => {
      useTransportStore.setState({ loopEnabled: true });
      const result = await executeCoreKeyboardAction('transport.loop', makeDeps());
      expect(result).toBe(true);
      expect(useTransportStore.getState().loopEnabled).toBe(false);
    });
  });

  // ─── transport.record ─────────────────────────────────────────────────────

  describe('transport.record', () => {
    it('stops recording when already recording', async () => {
      useTransportStore.setState({ isRecording: true });
      const deps = makeDeps();
      const result = await executeCoreKeyboardAction('transport.record', deps);
      expect(result).toBe(true);
      expect(deps.toggleRecord).toHaveBeenCalledTimes(1);
    });

    it('arms focused track when not recording and track is not armed', async () => {
      const track = makeTrack({ id: 'trk-a' });
      useProjectStore.getState().setProject(makeProject([track]));
      setKeyboardScope('timeline', 'trk-a');
      useTransportStore.setState({ isRecording: false, armedTrackIds: [] });

      const deps = makeDeps();
      const result = await executeCoreKeyboardAction('transport.record', deps);
      expect(result).toBe(true);
      expect(deps.toggleArmTrack).toHaveBeenCalledWith('trk-a', true);
      expect(deps.toggleRecord).not.toHaveBeenCalled();
    });

    it('starts recording when there are armed tracks and focused track is already armed', async () => {
      const track = makeTrack({ id: 'trk-a' });
      useProjectStore.getState().setProject(makeProject([track]));
      setKeyboardScope('timeline', 'trk-a');
      useTransportStore.setState({ isRecording: false, armedTrackIds: ['trk-a'] });

      const deps = makeDeps();
      const result = await executeCoreKeyboardAction('transport.record', deps);
      expect(result).toBe(true);
      expect(deps.toggleRecord).toHaveBeenCalledTimes(1);
    });

    it('starts recording when armed tracks exist but no focused track', async () => {
      // No project loaded (from beforeEach), so resolveFocusedTrackId returns null
      // but armed tracks exist, so it should start recording
      useTransportStore.setState({ isRecording: false, armedTrackIds: ['some-track'] });
      setKeyboardScope('global', null);

      const deps = makeDeps();
      const result = await executeCoreKeyboardAction('transport.record', deps);
      expect(result).toBe(true);
      expect(deps.toggleRecord).toHaveBeenCalledTimes(1);
    });

    it('returns false when not recording, no focused track, no armed tracks', async () => {
      // No project loaded (from beforeEach), no armed tracks
      useTransportStore.setState({ isRecording: false, armedTrackIds: [] });
      setKeyboardScope('global', null);

      const deps = makeDeps();
      const result = await executeCoreKeyboardAction('transport.record', deps);
      expect(result).toBe(false);
      expect(deps.toggleRecord).not.toHaveBeenCalled();
      expect(deps.toggleArmTrack).not.toHaveBeenCalled();
    });
  });

  // ─── tracks.mute ──────────────────────────────────────────────────────────

  describe('tracks.mute', () => {
    it('toggles mute on focused track in timeline scope', async () => {
      const track = makeTrack({ id: 'trk-m', muted: false });
      useProjectStore.getState().setProject(makeProject([track]));
      setKeyboardScope('timeline', 'trk-m');

      const result = await executeCoreKeyboardAction('tracks.mute', makeDeps());
      expect(result).toBe(true);

      const updated = useProjectStore.getState().project!.tracks.find((t) => t.id === 'trk-m');
      expect(updated!.muted).toBe(true);
    });

    it('toggles mute off when track is already muted', async () => {
      const track = makeTrack({ id: 'trk-m', muted: true });
      useProjectStore.getState().setProject(makeProject([track]));
      setKeyboardScope('mixer', 'trk-m');

      const result = await executeCoreKeyboardAction('tracks.mute', makeDeps());
      expect(result).toBe(true);

      const updated = useProjectStore.getState().project!.tracks.find((t) => t.id === 'trk-m');
      expect(updated!.muted).toBe(false);
    });

    it('returns false when scope is global (not track scope)', async () => {
      const track = makeTrack({ id: 'trk-m' });
      useProjectStore.getState().setProject(makeProject([track]));
      setKeyboardScope('global', 'trk-m');

      const result = await executeCoreKeyboardAction('tracks.mute', makeDeps());
      expect(result).toBe(false);
    });

    it('returns false when no project is loaded', async () => {
      // project is already null from beforeEach
      setKeyboardScope('timeline', 'trk-m');

      const result = await executeCoreKeyboardAction('tracks.mute', makeDeps());
      expect(result).toBe(false);
    });

    it('falls back to first track when focused track id does not exist', async () => {
      // resolveFocusedTrackId falls back to project.tracks[0] when keyboard trackId is not found
      const realTrack = makeTrack({ id: 'trk-real', muted: false });
      useProjectStore.getState().setProject(makeProject([realTrack]));
      setKeyboardScope('timeline', 'trk-nonexistent');

      const result = await executeCoreKeyboardAction('tracks.mute', makeDeps());
      // Falls back to trk-real (first track) and toggles its mute
      expect(result).toBe(true);
      const updated = useProjectStore.getState().project!.tracks.find((t) => t.id === 'trk-real');
      expect(updated!.muted).toBe(true);
    });

    it('calls setGroupMuted for group tracks', async () => {
      const group = makeTrack({ id: 'grp-1', isGroup: true, muted: false });
      useProjectStore.getState().setProject(makeProject([group]));
      setKeyboardScope('timeline', 'grp-1');
      const spy = vi.spyOn(useProjectStore.getState(), 'setGroupMuted');

      await executeCoreKeyboardAction('tracks.mute', makeDeps());

      expect(spy).toHaveBeenCalledWith('grp-1', true);
      spy.mockRestore();
    });

    it('works in pianoRoll scope', async () => {
      const track = makeTrack({ id: 'trk-pr', muted: false });
      useProjectStore.getState().setProject(makeProject([track]));
      setKeyboardScope('pianoRoll', 'trk-pr');

      const result = await executeCoreKeyboardAction('tracks.mute', makeDeps());
      expect(result).toBe(true);

      const updated = useProjectStore.getState().project!.tracks.find((t) => t.id === 'trk-pr');
      expect(updated!.muted).toBe(true);
    });
  });

  // ─── tracks.solo ──────────────────────────────────────────────────────────

  describe('tracks.solo', () => {
    it('toggles solo on focused track', async () => {
      const track = makeTrack({ id: 'trk-s', soloed: false });
      useProjectStore.getState().setProject(makeProject([track]));
      setKeyboardScope('timeline', 'trk-s');

      const result = await executeCoreKeyboardAction('tracks.solo', makeDeps());
      expect(result).toBe(true);

      const updated = useProjectStore.getState().project!.tracks.find((t) => t.id === 'trk-s');
      expect(updated!.soloed).toBe(true);
    });

    it('toggles solo off when already soloed', async () => {
      const track = makeTrack({ id: 'trk-s', soloed: true });
      useProjectStore.getState().setProject(makeProject([track]));
      setKeyboardScope('mixer', 'trk-s');

      const result = await executeCoreKeyboardAction('tracks.solo', makeDeps());
      expect(result).toBe(true);

      const updated = useProjectStore.getState().project!.tracks.find((t) => t.id === 'trk-s');
      expect(updated!.soloed).toBe(false);
    });

    it('returns false when scope is global', async () => {
      const track = makeTrack({ id: 'trk-s' });
      useProjectStore.getState().setProject(makeProject([track]));
      setKeyboardScope('global', 'trk-s');

      const result = await executeCoreKeyboardAction('tracks.solo', makeDeps());
      expect(result).toBe(false);
    });

    it('calls setGroupSoloed for group tracks', async () => {
      const group = makeTrack({ id: 'grp-2', isGroup: true, soloed: false });
      useProjectStore.getState().setProject(makeProject([group]));
      setKeyboardScope('timeline', 'grp-2');
      const spy = vi.spyOn(useProjectStore.getState(), 'setGroupSoloed');

      await executeCoreKeyboardAction('tracks.solo', makeDeps());

      expect(spy).toHaveBeenCalledWith('grp-2', true);
      spy.mockRestore();
    });
  });

  // ─── tracks.bypassEffects ─────────────────────────────────────────────────

  describe('tracks.bypassEffects', () => {
    it('calls toggleTrackEffectsBypass on focused track', async () => {
      const track = makeTrack({ id: 'trk-fx', effectsBypassed: false });
      useProjectStore.getState().setProject(makeProject([track]));
      setKeyboardScope('timeline', 'trk-fx');
      const spy = vi.spyOn(useProjectStore.getState(), 'toggleTrackEffectsBypass');

      const result = await executeCoreKeyboardAction('tracks.bypassEffects', makeDeps());
      expect(result).toBe(true);
      expect(spy).toHaveBeenCalledWith('trk-fx');
      spy.mockRestore();
    });

    it('returns false when scope is global', async () => {
      const track = makeTrack({ id: 'trk-fx' });
      useProjectStore.getState().setProject(makeProject([track]));
      setKeyboardScope('global', 'trk-fx');

      const result = await executeCoreKeyboardAction('tracks.bypassEffects', makeDeps());
      expect(result).toBe(false);
    });

    it('returns false for group tracks', async () => {
      const group = makeTrack({ id: 'grp-fx', isGroup: true });
      useProjectStore.getState().setProject(makeProject([group]));
      setKeyboardScope('timeline', 'grp-fx');

      const result = await executeCoreKeyboardAction('tracks.bypassEffects', makeDeps());
      expect(result).toBe(false);
    });

    it('returns false when no project is loaded', async () => {
      // project is already null from beforeEach
      setKeyboardScope('timeline', 'trk-fx');

      const result = await executeCoreKeyboardAction('tracks.bypassEffects', makeDeps());
      expect(result).toBe(false);
    });

    it('falls back to first track when keyboard trackId not found', async () => {
      // resolveFocusedTrackId falls back to tracks[0], but that track is a normal track
      // so bypassEffects will succeed on it
      const track = makeTrack({ id: 'other', effectsBypassed: false });
      useProjectStore.getState().setProject(makeProject([track]));
      setKeyboardScope('timeline', 'missing');

      const result = await executeCoreKeyboardAction('tracks.bypassEffects', makeDeps());
      // Falls back to 'other' track and toggles bypass
      expect(result).toBe(true);
    });

    it('returns false when project has no tracks', async () => {
      useProjectStore.getState().setProject(makeProject([]));
      setKeyboardScope('timeline', 'trk-fx');

      const result = await executeCoreKeyboardAction('tracks.bypassEffects', makeDeps());
      expect(result).toBe(false);
    });
  });

  // ─── view.zoomToSelection ─────────────────────────────────────────────────

  describe('view.zoomToSelection', () => {
    it('calls zoomTimelineToSelection in timeline scope', async () => {
      setKeyboardScope('timeline');
      const spy = vi.spyOn(useUIStore.getState(), 'zoomTimelineToSelection');

      const result = await executeCoreKeyboardAction('view.zoomToSelection', makeDeps());
      expect(result).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('returns false when scope is not timeline', async () => {
      setKeyboardScope('mixer');
      const result = await executeCoreKeyboardAction('view.zoomToSelection', makeDeps());
      expect(result).toBe(false);
    });

    it('returns false when scope is global', async () => {
      setKeyboardScope('global');
      const result = await executeCoreKeyboardAction('view.zoomToSelection', makeDeps());
      expect(result).toBe(false);
    });
  });

  // ─── view.zoomToFit ───────────────────────────────────────────────────────

  describe('view.zoomToFit', () => {
    it('calls zoomTimelineToProject in timeline scope', async () => {
      setKeyboardScope('timeline');
      const spy = vi.spyOn(useUIStore.getState(), 'zoomTimelineToProject');

      const result = await executeCoreKeyboardAction('view.zoomToFit', makeDeps());
      expect(result).toBe(true);
      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('returns false when scope is mixer', async () => {
      setKeyboardScope('mixer');
      const result = await executeCoreKeyboardAction('view.zoomToFit', makeDeps());
      expect(result).toBe(false);
    });

    it('returns false when scope is pianoRoll', async () => {
      setKeyboardScope('pianoRoll');
      const result = await executeCoreKeyboardAction('view.zoomToFit', makeDeps());
      expect(result).toBe(false);
    });
  });

  // ─── createCoreKeyboardActions ────────────────────────────────────────────

  describe('createCoreKeyboardActions', () => {
    it('returns an object with an execute method', () => {
      const actions = createCoreKeyboardActions(makeDeps());
      expect(typeof actions.execute).toBe('function');
    });

    it('execute delegates to executeCoreKeyboardAction', async () => {
      const deps = makeDeps();
      const actions = createCoreKeyboardActions(deps);

      useTransportStore.setState({ isPlaying: false });
      const result = await actions.execute('transport.playPause');
      expect(result).toBe(true);
      expect(deps.play).toHaveBeenCalledTimes(1);
    });

    it('execute returns false for unknown actions', async () => {
      const actions = createCoreKeyboardActions(makeDeps());
      const result = await actions.execute('totally.bogus');
      expect(result).toBe(false);
    });
  });

  // ─── keyboard context updates ─────────────────────────────────────────────

  describe('keyboard context updates', () => {
    it('mute updates keyboard context to focused track', async () => {
      const track = makeTrack({ id: 'ctx-trk', muted: false });
      useProjectStore.getState().setProject(makeProject([track]));
      setKeyboardScope('timeline', 'ctx-trk');

      await executeCoreKeyboardAction('tracks.mute', makeDeps());

      const ctx = useUIStore.getState().keyboardContext;
      expect(ctx.scope).toBe('timeline');
      expect(ctx.trackId).toBe('ctx-trk');
    });

    it('solo updates keyboard context to focused track', async () => {
      const track = makeTrack({ id: 'ctx-trk2', soloed: false });
      useProjectStore.getState().setProject(makeProject([track]));
      setKeyboardScope('mixer', 'ctx-trk2');

      await executeCoreKeyboardAction('tracks.solo', makeDeps());

      const ctx = useUIStore.getState().keyboardContext;
      expect(ctx.scope).toBe('mixer');
      expect(ctx.trackId).toBe('ctx-trk2');
    });

    it('bypassEffects updates keyboard context', async () => {
      const track = makeTrack({ id: 'ctx-trk3' });
      useProjectStore.getState().setProject(makeProject([track]));
      setKeyboardScope('pianoRoll', 'ctx-trk3');

      await executeCoreKeyboardAction('tracks.bypassEffects', makeDeps());

      const ctx = useUIStore.getState().keyboardContext;
      expect(ctx.scope).toBe('pianoRoll');
      expect(ctx.trackId).toBe('ctx-trk3');
    });

    it('record arm updates keyboard context', async () => {
      const track = makeTrack({ id: 'arm-trk' });
      useProjectStore.getState().setProject(makeProject([track]));
      setKeyboardScope('timeline', 'arm-trk');
      useTransportStore.setState({ isRecording: false, armedTrackIds: [] });

      await executeCoreKeyboardAction('transport.record', makeDeps());

      const ctx = useUIStore.getState().keyboardContext;
      expect(ctx.trackId).toBe('arm-trk');
    });
  });
});
