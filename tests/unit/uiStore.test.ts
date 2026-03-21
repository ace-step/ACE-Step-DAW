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

  describe('pixelsPerSecond zoom', () => {
    it('sets an explicit zoom level', () => {
      useUIStore.getState().setPixelsPerSecond(200);

      expect(useUIStore.getState().pixelsPerSecond).toBe(200);
    });

    it('zooms in through discrete levels and stops at the maximum', () => {
      useUIStore.getState().setPixelsPerSecond(50);

      useUIStore.getState().zoomIn();
      expect(useUIStore.getState().pixelsPerSecond).toBe(100);

      useUIStore.getState().zoomIn();
      expect(useUIStore.getState().pixelsPerSecond).toBe(200);

      useUIStore.getState().zoomIn();
      expect(useUIStore.getState().pixelsPerSecond).toBe(500);

      useUIStore.getState().zoomIn();
      expect(useUIStore.getState().pixelsPerSecond).toBe(500);
    });

    it('zooms out through discrete levels and stops at the minimum', () => {
      useUIStore.getState().setPixelsPerSecond(200);

      useUIStore.getState().zoomOut();
      expect(useUIStore.getState().pixelsPerSecond).toBe(100);

      useUIStore.getState().zoomOut();
      expect(useUIStore.getState().pixelsPerSecond).toBe(50);

      useUIStore.getState().setPixelsPerSecond(10);
      useUIStore.getState().zoomOut();
      expect(useUIStore.getState().pixelsPerSecond).toBe(10);
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
    it('updates mixer, loop browser, and library panel visibility', () => {
      useUIStore.getState().setShowMixer(true);
      useUIStore.getState().toggleLoopBrowser();
      useUIStore.getState().setShowLibrary(true);

      let state = useUIStore.getState();
      expect(state.showMixer).toBe(true);
      expect(state.loopBrowserOpen).toBe(true);
      expect(state.showLibrary).toBe(true);

      useUIStore.getState().setShowMixer(false);
      useUIStore.getState().toggleLoopBrowser();
      useUIStore.getState().setShowLibrary(false);

      state = useUIStore.getState();
      expect(state.showMixer).toBe(false);
      expect(state.loopBrowserOpen).toBe(false);
      expect(state.showLibrary).toBe(false);
    });

    it('toggles the primary arrangement/session view', () => {
      expect(useUIStore.getState().mainView).toBe('arrangement');
      useUIStore.getState().toggleMainView();
      expect(useUIStore.getState().mainView).toBe('session');
      useUIStore.getState().setMainView('arrangement');
      expect(useUIStore.getState().mainView).toBe('arrangement');
    });

    it('toggles the generation history panel', () => {
      expect(useUIStore.getState().showGenerationHistoryPanel).toBe(false);

      useUIStore.getState().toggleGenerationHistoryPanel();
      expect(useUIStore.getState().showGenerationHistoryPanel).toBe(true);

      useUIStore.getState().setShowGenerationHistoryPanel(false);
      expect(useUIStore.getState().showGenerationHistoryPanel).toBe(false);
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

      expect(entry).toBeTruthy();
      expect(entry?.kind).toBe('parameter');
      expect(entry?.searchText).toContain('volume');
    });
  });
});
