import { beforeEach, describe, expect, it } from 'vitest';
import { useUIStore } from '../../src/store/uiStore';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';

describe('uiStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useUIStore.setState(useUIStore.getInitialState(), true);
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
  });

  describe('timeline zoom requests', () => {
    it('sets an explicit zoom level', () => {
      useUIStore.getState().setPixelsPerSecond(200);

      expect(useUIStore.getState().pixelsPerSecond).toBe(200);
    });

    it('emits incrementing step-in requests without mutating the zoom level directly', () => {
      useUIStore.getState().setPixelsPerSecond(50);

      useUIStore.getState().zoomIn();
      expect(useUIStore.getState().pixelsPerSecond).toBe(50);
      expect(useUIStore.getState().timelineZoomRequest).toMatchObject({ id: 1, mode: 'stepIn' });

      useUIStore.getState().zoomIn();
      expect(useUIStore.getState().timelineZoomRequest).toMatchObject({ id: 2, mode: 'stepIn' });
    });

    it('emits incrementing step-out requests without mutating the zoom level directly', () => {
      useUIStore.getState().setPixelsPerSecond(200);

      useUIStore.getState().zoomOut();
      expect(useUIStore.getState().pixelsPerSecond).toBe(200);
      expect(useUIStore.getState().timelineZoomRequest).toMatchObject({ id: 1, mode: 'stepOut' });

      useUIStore.getState().zoomOut();
      expect(useUIStore.getState().timelineZoomRequest).toMatchObject({ id: 2, mode: 'stepOut' });
    });

    it('emits a reset request for the timeline viewport model', () => {
      useUIStore.getState().zoomReset();

      expect(useUIStore.getState().timelineZoomRequest).toMatchObject({ id: 1, mode: 'reset' });
    });
  });

  describe('main view mode', () => {
    it('toggles between arrangement and session views', () => {
      expect(useUIStore.getState().mainView).toBe('arrangement');

      useUIStore.getState().toggleMainView();
      expect(useUIStore.getState().mainView).toBe('session');

      useUIStore.getState().setMainView('arrangement');
      expect(useUIStore.getState().mainView).toBe('arrangement');
    });
  });

  describe('panel toggles', () => {
    it('updates mixer, loop browser, and library panel visibility (mutually exclusive)', () => {
      // Opening mixer
      useUIStore.getState().setShowMixer(true);
      expect(useUIStore.getState().showMixer).toBe(true);

      // Opening loop browser closes mixer (mutual exclusion)
      useUIStore.getState().toggleLoopBrowser();
      expect(useUIStore.getState().loopBrowserOpen).toBe(true);
      expect(useUIStore.getState().showMixer).toBe(false);

      // showLibrary is not a right-side panel, so it stays independent
      useUIStore.getState().setShowLibrary(true);
      expect(useUIStore.getState().showLibrary).toBe(true);

      // Closing loop browser
      useUIStore.getState().toggleLoopBrowser();
      expect(useUIStore.getState().loopBrowserOpen).toBe(false);

      useUIStore.getState().setShowLibrary(false);
      expect(useUIStore.getState().showLibrary).toBe(false);
    });

    it('toggles the primary arrangement/session view', () => {
      expect(useUIStore.getState().mainView).toBe('arrangement');
      useUIStore.getState().toggleMainView();
      expect(useUIStore.getState().mainView).toBe('session');
      useUIStore.getState().setMainView('arrangement');
      expect(useUIStore.getState().mainView).toBe('arrangement');
    });

    it('routes generation history into the unified generation panel', () => {
      expect(useUIStore.getState().showGenerationPanel).toBe(false);
      expect(useUIStore.getState().generationPanelView).toBe('textToMusic');

      useUIStore.getState().toggleGenerationHistoryPanel();
      expect(useUIStore.getState().showGenerationPanel).toBe(true);
      expect(useUIStore.getState().showGenerationHistoryPanel).toBe(false);
      expect(useUIStore.getState().generationPanelView).toBe('history');

      useUIStore.getState().setShowGenerationHistoryPanel(false);
      expect(useUIStore.getState().showGenerationPanel).toBe(false);
      expect(useUIStore.getState().showGenerationHistoryPanel).toBe(false);
    });

    it('opens the multi-track view when batch generation mode is requested', () => {
      useUIStore.getState().setBatchGenerateMode('context');

      expect(useUIStore.getState().showGenerationPanel).toBe(true);
      expect(useUIStore.getState().generationPanelView).toBe('multiTrack');
      expect(useUIStore.getState().batchGenerateMode).toBe('context');
    });

    it('tracks virtual keyboard visibility, octave, velocity, and pressed pitches', () => {
      const ui = useUIStore.getState();

      expect(ui.showVirtualKeyboard).toBe(false);
      expect(ui.virtualKeyboardOctave).toBe(4);
      expect(ui.virtualKeyboardVelocity).toBe(96);
      expect(ui.virtualKeyboardPressedPitches).toEqual([]);

      ui.toggleVirtualKeyboard();
      ui.setVirtualKeyboardOctave(6);
      ui.adjustVirtualKeyboardOctave(-3);
      ui.setVirtualKeyboardVelocity(140);
      ui.adjustVirtualKeyboardVelocity(-20);
      ui.pressVirtualKeyboardPitch(60);
      ui.pressVirtualKeyboardPitch(64);
      ui.releaseVirtualKeyboardPitch(60);

      const state = useUIStore.getState();
      expect(state.showVirtualKeyboard).toBe(true);
      expect(state.virtualKeyboardOctave).toBe(3);
      expect(state.virtualKeyboardVelocity).toBe(107);
      expect(state.virtualKeyboardPressedPitches).toEqual([64]);

      state.clearVirtualKeyboardPressedPitches();
      expect(useUIStore.getState().virtualKeyboardPressedPitches).toEqual([]);
    });
  });

  describe('selectedClipIds', () => {
    it('adds, removes, and clears selected clip ids', () => {
      useUIStore.getState().selectClip('clip-a');
      expect(Array.from(useUIStore.getState().selectedClipIds)).toEqual(['clip-a']);

      useUIStore.getState().selectClip('clip-b', true);
      expect(Array.from(useUIStore.getState().selectedClipIds).sort()).toEqual(['clip-a', 'clip-b']);

      useUIStore.getState().selectClip('clip-a', true);
      expect(Array.from(useUIStore.getState().selectedClipIds)).toEqual(['clip-b']);

      useUIStore.getState().deselectAll();
      expect(useUIStore.getState().selectedClipIds.size).toBe(0);
    });
  });

  describe('panel height constraints', () => {
    it('clamps mixer height between 160 and 500', () => {
      useUIStore.getState().setMixerHeight(120);
      expect(useUIStore.getState().mixerHeight).toBe(160);

      useUIStore.getState().setMixerHeight(640);
      expect(useUIStore.getState().mixerHeight).toBe(500);
    });

    it('clamps piano roll height between 220 and 700', () => {
      useUIStore.getState().setPianoRollHeight(180);
      expect(useUIStore.getState().pianoRollHeight).toBe(220);

      useUIStore.getState().setPianoRollHeight(760);
      expect(useUIStore.getState().pianoRollHeight).toBe(700);
    });
  });

  describe('piano roll tools', () => {
    it('defaults to the select tool and updates through store actions', () => {
      expect(useUIStore.getState().activePianoRollTool).toBe('select');

      useUIStore.getState().setActivePianoRollTool('paint');
      expect(useUIStore.getState().activePianoRollTool).toBe('paint');

      useUIStore.getState().togglePianoRollPencilTool();
      expect(useUIStore.getState().activePianoRollTool).toBe('pencil');

      useUIStore.getState().togglePianoRollPencilTool();
      expect(useUIStore.getState().activePianoRollTool).toBe('select');
    });
  });

  describe('command palette', () => {
    it('opens, executes commands, and promotes recent commands', async () => {
      useProjectStore.getState().createProject({ name: 'Palette Project' });
      const vocalsTrack = useProjectStore.getState().addTrack('vocals');

      const ui = useUIStore.getState();
      ui.openCommandPalette('add reverb to vocals');

      const results = useUIStore.getState().searchCommandPalette();
      const commandId = results[0]?.id;

      expect(commandId).toBe(`track:${vocalsTrack.id}:effect:reverb`);
      if (!commandId) {
        throw new Error('Expected a command palette result');
      }

      const executed = await useUIStore.getState().executeCommandPaletteCommand(commandId);

      expect(executed).toBe(true);
      expect(useUIStore.getState().showCommandPalette).toBe(false);
      expect(useUIStore.getState().recentCommandIds[0]).toBe(commandId);
      expect(useProjectStore.getState().project?.tracks[0].effects?.[0]?.type).toBe('reverb');

      useUIStore.getState().openCommandPalette();
      const defaultResults = useUIStore.getState().searchCommandPalette('');
      expect(defaultResults[0]?.id).toBe(commandId);
    });

    it('exposes a normalized command registry for agent search', () => {
      useProjectStore.getState().createProject({ name: 'Palette Registry' });
      const vocalsTrack = useProjectStore.getState().addTrack('vocals');

      const registry = useUIStore.getState().getCommandPaletteRegistry('vocals volume 80');
      const entry = registry.find((item) => item.id === `track:${vocalsTrack.id}:volume:80`);

      expect(entry).not.toBeUndefined();
      expect(entry?.kind).toBe('parameter');
      expect(entry?.searchText).toContain('volume');
    });
  });

  describe('trackLaneRects cache', () => {
    it('starts with an empty Map', () => {
      expect(useUIStore.getState().trackLaneRects).toBeInstanceOf(Map);
      expect(useUIStore.getState().trackLaneRects.size).toBe(0);
    });

    it('setTrackLaneRect adds an entry', () => {
      useUIStore.getState().setTrackLaneRect('track-1', { top: 100, height: 80 });
      const rect = useUIStore.getState().trackLaneRects.get('track-1');
      expect(rect).toEqual({ top: 100, height: 80 });
    });

    it('setTrackLaneRect updates an existing entry', () => {
      useUIStore.getState().setTrackLaneRect('track-1', { top: 100, height: 80 });
      useUIStore.getState().setTrackLaneRect('track-1', { top: 120, height: 90 });
      const rect = useUIStore.getState().trackLaneRects.get('track-1');
      expect(rect).toEqual({ top: 120, height: 90 });
    });

    it('removeTrackLaneRect removes an entry', () => {
      useUIStore.getState().setTrackLaneRect('track-1', { top: 100, height: 80 });
      useUIStore.getState().removeTrackLaneRect('track-1');
      expect(useUIStore.getState().trackLaneRects.has('track-1')).toBe(false);
    });

    it('does not affect other entries when setting or removing', () => {
      useUIStore.getState().setTrackLaneRect('track-1', { top: 100, height: 80 });
      useUIStore.getState().setTrackLaneRect('track-2', { top: 200, height: 60 });
      useUIStore.getState().removeTrackLaneRect('track-1');
      expect(useUIStore.getState().trackLaneRects.has('track-1')).toBe(false);
      expect(useUIStore.getState().trackLaneRects.get('track-2')).toEqual({ top: 200, height: 60 });
    });
  });
});
