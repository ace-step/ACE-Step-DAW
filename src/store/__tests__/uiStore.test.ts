import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore, isAnyModalOpen } from '../uiStore';

function resetStore() {
  // Fully reset the store so omitted keys cannot leak between tests.
  useUIStore.setState(useUIStore.getInitialState(), true);
}

describe('uiStore', () => {
  beforeEach(resetStore);

  // ── Main view ───────────────────────────────────────────────

  describe('main view', () => {
    it('starts in arrangement view', () => {
      expect(useUIStore.getState().mainView).toBe('arrangement');
    });

    it('setMainView switches view', () => {
      useUIStore.getState().setMainView('session');
      expect(useUIStore.getState().mainView).toBe('session');
    });

    it('toggleMainView flips between arrangement and session', () => {
      useUIStore.getState().toggleMainView();
      expect(useUIStore.getState().mainView).toBe('session');
      useUIStore.getState().toggleMainView();
      expect(useUIStore.getState().mainView).toBe('arrangement');
    });
  });

  // ── Zoom ────────────────────────────────────────────────────

  describe('zoom', () => {
    it('zoomIn sets a stepIn timeline zoom request', () => {
      useUIStore.getState().zoomIn();
      expect(useUIStore.getState().timelineZoomRequest?.mode).toBe('stepIn');
    });

    it('zoomOut sets a stepOut timeline zoom request', () => {
      useUIStore.getState().zoomOut();
      expect(useUIStore.getState().timelineZoomRequest?.mode).toBe('stepOut');
    });

    it('zoomReset sets a reset timeline zoom request', () => {
      useUIStore.getState().zoomReset();
      expect(useUIStore.getState().timelineZoomRequest?.mode).toBe('reset');
    });

    it('setPixelsPerSecond sets value directly', () => {
      useUIStore.getState().setPixelsPerSecond(200);
      expect(useUIStore.getState().pixelsPerSecond).toBe(200);
    });

    it('zoom requests increment their id', () => {
      useUIStore.getState().zoomIn();
      const firstId = useUIStore.getState().timelineZoomRequest!.id;
      useUIStore.getState().zoomOut();
      const secondId = useUIStore.getState().timelineZoomRequest!.id;
      expect(secondId).toBeGreaterThan(firstId);
    });
  });

  // ── Snap ────────────────────────────────────────────────────

  describe('snap', () => {
    it('toggleSnap flips snap state', () => {
      expect(useUIStore.getState().snapEnabled).toBe(true);
      useUIStore.getState().toggleSnap();
      expect(useUIStore.getState().snapEnabled).toBe(false);
      useUIStore.getState().toggleSnap();
      expect(useUIStore.getState().snapEnabled).toBe(true);
    });
  });

  // ── Clip selection ──────────────────────────────────────────

  describe('clip selection', () => {
    it('selectClip selects a single clip', () => {
      useUIStore.getState().selectClip('c1');
      expect(useUIStore.getState().selectedClipIds.has('c1')).toBe(true);
      expect(useUIStore.getState().lastSelectionContext).toBe('clips');
    });

    it('selectClip replaces previous selection', () => {
      useUIStore.getState().selectClip('c1');
      useUIStore.getState().selectClip('c2');
      expect(useUIStore.getState().selectedClipIds.has('c1')).toBe(false);
      expect(useUIStore.getState().selectedClipIds.has('c2')).toBe(true);
    });

    it('selectClip with multi=true adds to selection', () => {
      useUIStore.getState().selectClip('c1');
      useUIStore.getState().selectClip('c2', true);
      expect(useUIStore.getState().selectedClipIds.size).toBe(2);
    });

    it('selectClips replaces entire selection', () => {
      useUIStore.getState().selectClip('c1');
      useUIStore.getState().selectClips(['c2', 'c3']);
      const ids = useUIStore.getState().selectedClipIds;
      expect(ids.size).toBe(2);
      expect(ids.has('c2')).toBe(true);
      expect(ids.has('c3')).toBe(true);
    });

    it('deselectAll clears clip selection', () => {
      useUIStore.getState().selectClip('c1');
      useUIStore.getState().deselectAll();
      expect(useUIStore.getState().selectedClipIds.size).toBe(0);
    });
  });

  // ── Track selection ─────────────────────────────────────────

  describe('track selection', () => {
    it('selectTrack selects a single track', () => {
      useUIStore.getState().selectTrack('t1');
      expect(useUIStore.getState().selectedTrackIds.has('t1')).toBe(true);
      expect(useUIStore.getState().lastSelectionContext).toBe('tracks');
    });

    it('selectTrack with multi adds to selection', () => {
      useUIStore.getState().selectTrack('t1');
      useUIStore.getState().selectTrack('t2', true);
      expect(useUIStore.getState().selectedTrackIds.size).toBe(2);
    });

    it('selectTracks replaces entire selection', () => {
      useUIStore.getState().selectTrack('t1');
      useUIStore.getState().selectTracks(['t2', 't3']);
      expect(useUIStore.getState().selectedTrackIds.size).toBe(2);
    });

    it('deselectAllTracks clears track selection', () => {
      useUIStore.getState().selectTrack('t1');
      useUIStore.getState().deselectAllTracks();
      expect(useUIStore.getState().selectedTrackIds.size).toBe(0);
    });
  });

  // ── Dialog toggles ──────────────────────────────────────────

  describe('dialog toggles', () => {
    it('setShowNewProjectDialog opens/closes', () => {
      useUIStore.getState().setShowNewProjectDialog(true);
      expect(useUIStore.getState().showNewProjectDialog).toBe(true);
    });

    it('setShowExportDialog opens/closes', () => {
      useUIStore.getState().setShowExportDialog(true);
      expect(useUIStore.getState().showExportDialog).toBe(true);
    });

    it('setShowSettingsDialog opens/closes', () => {
      useUIStore.getState().setShowSettingsDialog(true);
      expect(useUIStore.getState().showSettingsDialog).toBe(true);
    });

    it('setShowKeyboardShortcutsDialog opens/closes', () => {
      useUIStore.getState().setShowKeyboardShortcutsDialog(true);
      expect(useUIStore.getState().showKeyboardShortcutsDialog).toBe(true);
    });
  });

  // ── Delete tracks confirmation ──────────────────────────────

  describe('delete tracks confirmation', () => {
    it('pendingDeleteTrackIds can be set and cleared', () => {
      // requestDeleteTracks requires projectStore to have tracks,
      // so test the state directly
      useUIStore.setState({ pendingDeleteTrackIds: ['t1', 't2'] });
      expect(useUIStore.getState().pendingDeleteTrackIds).toEqual(['t1', 't2']);
    });

    it('cancelDeleteTracks clears pending', () => {
      useUIStore.setState({ pendingDeleteTrackIds: ['t1'] });
      useUIStore.getState().cancelDeleteTracks();
      expect(useUIStore.getState().pendingDeleteTrackIds).toBeNull();
    });
  });

  // ── Bounce in place dialog ──────────────────────────────────

  describe('bounce in place dialog', () => {
    it('openBounceInPlaceDialog sets track id', () => {
      useUIStore.getState().openBounceInPlaceDialog('t1');
      expect(useUIStore.getState().bounceInPlaceTrackId).toBe('t1');
    });

    it('closeBounceInPlaceDialog clears track id', () => {
      useUIStore.getState().openBounceInPlaceDialog('t1');
      useUIStore.getState().closeBounceInPlaceDialog();
      expect(useUIStore.getState().bounceInPlaceTrackId).toBeNull();
    });
  });

  // ── Mixer ───────────────────────────────────────────────────

  describe('mixer', () => {
    it('setShowMixer toggles mixer visibility', () => {
      useUIStore.getState().setShowMixer(true);
      expect(useUIStore.getState().showMixer).toBe(true);
    });
  });

  // ── Tempo lane & markers ────────────────────────────────────

  describe('tempo lane and markers', () => {
    it('toggleTempoLane flips visibility', () => {
      useUIStore.getState().toggleTempoLane();
      expect(useUIStore.getState().showTempoLane).toBe(true);
      useUIStore.getState().toggleTempoLane();
      expect(useUIStore.getState().showTempoLane).toBe(false);
    });

    it('toggleArrangementMarkers flips visibility', () => {
      expect(useUIStore.getState().showArrangementMarkers).toBe(true);
      useUIStore.getState().toggleArrangementMarkers();
      expect(useUIStore.getState().showArrangementMarkers).toBe(false);
    });
  });

  // ── Auto-scroll ─────────────────────────────────────────────

  describe('auto-scroll', () => {
    it('toggleAutoScroll flips enabled', () => {
      expect(useUIStore.getState().autoScrollEnabled).toBe(true);
      useUIStore.getState().toggleAutoScroll();
      expect(useUIStore.getState().autoScrollEnabled).toBe(false);
    });

    it('setUserScrolledDuringPlayback updates flag', () => {
      useUIStore.getState().setUserScrolledDuringPlayback(true);
      expect(useUIStore.getState().userScrolledDuringPlayback).toBe(true);
    });
  });

  // ── Virtual keyboard ───────────────────────────────────────

  describe('virtual keyboard', () => {
    it('toggleVirtualKeyboard flips visibility', () => {
      useUIStore.getState().toggleVirtualKeyboard();
      expect(useUIStore.getState().showVirtualKeyboard).toBe(true);
    });

    it('setVirtualKeyboardOctave sets value', () => {
      useUIStore.getState().setVirtualKeyboardOctave(3);
      expect(useUIStore.getState().virtualKeyboardOctave).toBe(3);
    });

    it('adjustVirtualKeyboardOctave clamps to 1-7', () => {
      useUIStore.getState().setVirtualKeyboardOctave(7);
      useUIStore.getState().adjustVirtualKeyboardOctave(1);
      expect(useUIStore.getState().virtualKeyboardOctave).toBe(7);

      useUIStore.getState().setVirtualKeyboardOctave(1);
      useUIStore.getState().adjustVirtualKeyboardOctave(-1);
      expect(useUIStore.getState().virtualKeyboardOctave).toBe(1);
    });

    it('pressVirtualKeyboardPitch adds and releaseVirtualKeyboardPitch removes', () => {
      useUIStore.getState().pressVirtualKeyboardPitch(60);
      expect(useUIStore.getState().virtualKeyboardPressedPitches).toContain(60);
      useUIStore.getState().releaseVirtualKeyboardPitch(60);
      expect(useUIStore.getState().virtualKeyboardPressedPitches).not.toContain(60);
    });

    it('clearVirtualKeyboardPressedPitches empties the array', () => {
      useUIStore.getState().pressVirtualKeyboardPitch(60);
      useUIStore.getState().pressVirtualKeyboardPitch(64);
      useUIStore.getState().clearVirtualKeyboardPressedPitches();
      expect(useUIStore.getState().virtualKeyboardPressedPitches).toEqual([]);
    });
  });

  // ── Ghost notes ─────────────────────────────────────────────

  describe('ghost notes', () => {
    it('toggleGhostNotes flips visibility', () => {
      expect(useUIStore.getState().showGhostNotes).toBe(false);
      useUIStore.getState().toggleGhostNotes();
      expect(useUIStore.getState().showGhostNotes).toBe(true);
    });

    it('setShowGhostNotes sets directly', () => {
      useUIStore.getState().setShowGhostNotes(false);
      expect(useUIStore.getState().showGhostNotes).toBe(false);
    });
  });

  // ── Generation panel ────────────────────────────────────────

  describe('generation panel', () => {
    it('toggleGenerationPanel flips visibility', () => {
      useUIStore.getState().toggleGenerationPanel();
      expect(useUIStore.getState().showGenerationPanel).toBe(true);
    });

    it('setGenerationPanelView sets the view', () => {
      useUIStore.getState().setGenerationPanelView('history');
      expect(useUIStore.getState().generationPanelView).toBe('history');
    });

    it('openGenerationPanelView opens panel and sets view', () => {
      useUIStore.getState().openGenerationPanelView('settings');
      expect(useUIStore.getState().showGenerationPanel).toBe(true);
      expect(useUIStore.getState().generationPanelView).toBe('settings');
    });
  });

  // ── Spectrum analyzer ───────────────────────────────────────

  describe('spectrum analyzer', () => {
    it('toggleSpectrumAnalyzer flips visibility', () => {
      useUIStore.getState().toggleSpectrumAnalyzer();
      expect(useUIStore.getState().showSpectrumAnalyzer).toBe(true);
    });
  });

  // ── Clip inspector ──────────────────────────────────────────

  describe('clip inspector', () => {
    it('toggleClipInspector flips visibility', () => {
      expect(useUIStore.getState().showClipInspector).toBe(false);
      useUIStore.getState().toggleClipInspector();
      expect(useUIStore.getState().showClipInspector).toBe(true);
      useUIStore.getState().toggleClipInspector();
      expect(useUIStore.getState().showClipInspector).toBe(false);
    });

    it('setShowClipInspector sets value directly', () => {
      useUIStore.getState().setShowClipInspector(true);
      expect(useUIStore.getState().showClipInspector).toBe(true);
      useUIStore.getState().setShowClipInspector(false);
      expect(useUIStore.getState().showClipInspector).toBe(false);
    });
  });

  // ── Loop browser ────────────────────────────────────────────

  describe('loop browser', () => {
    it('toggleLoopBrowser flips open state', () => {
      useUIStore.getState().toggleLoopBrowser();
      expect(useUIStore.getState().loopBrowserOpen).toBe(true);
    });

    it('setLoopBrowserSearch updates search', () => {
      useUIStore.getState().setLoopBrowserSearch('bass');
      expect(useUIStore.getState().loopBrowserSearch).toBe('bass');
    });

    it('setPreviewingLoopId tracks preview', () => {
      useUIStore.getState().setPreviewingLoopId('loop-42');
      expect(useUIStore.getState().previewingLoopId).toBe('loop-42');
    });
  });

  // ── Enhancer ────────────────────────────────────────────────

  describe('enhancer', () => {
    it('enhancer state can be set directly and closeEnhancer clears it', () => {
      // openEnhancer requires a clip in projectStore, so set state directly
      useUIStore.setState({
        enhancerOpen: true,
        enhancerTarget: { clipId: 'c1', trackId: 't1', range: null, mode: 'cover' },
      });
      expect(useUIStore.getState().enhancerOpen).toBe(true);
      expect(useUIStore.getState().enhancerTarget?.clipId).toBe('c1');
    });

    it('closeEnhancer clears state', () => {
      useUIStore.setState({
        enhancerOpen: true,
        enhancerTarget: { clipId: 'c1', trackId: 't1', range: null, mode: 'cover' },
      });
      useUIStore.getState().closeEnhancer();
      expect(useUIStore.getState().enhancerOpen).toBe(false);
      expect(useUIStore.getState().enhancerTarget).toBeNull();
    });
  });

  // ── Modals (audio processing) ───────────────────────────────

  describe('audio processing modals', () => {
    it('setVocal2BGMModal sets/clears clip id', () => {
      useUIStore.getState().setVocal2BGMModal('c1');
      expect(useUIStore.getState().vocal2bgmClipId).toBe('c1');
      useUIStore.getState().setVocal2BGMModal(null);
      expect(useUIStore.getState().vocal2bgmClipId).toBeNull();
    });

    it('setAnalysisPanel sets/clears clip id', () => {
      useUIStore.getState().setAnalysisPanel('c1');
      expect(useUIStore.getState().analysisClipId).toBe('c1');
    });

    it('setStemSeparationModal sets/clears clip id', () => {
      useUIStore.getState().setStemSeparationModal('c1');
      expect(useUIStore.getState().stemSeparationClipId).toBe('c1');
    });

    it('setAudioToMidiModal sets/clears clip id', () => {
      useUIStore.getState().setAudioToMidiModal('c1');
      expect(useUIStore.getState().audioToMidiClipId).toBe('c1');
    });

    it('setShowHumToSongModal toggles', () => {
      useUIStore.getState().setShowHumToSongModal(true);
      expect(useUIStore.getState().showHumToSongModal).toBe(true);
    });
  });

  // ── Quantize dialog ─────────────────────────────────────────

  describe('quantize dialog', () => {
    it('openQuantizeDialog sets target and opens', () => {
      useUIStore.getState().openQuantizeDialog('c1', ['n1', 'n2']);
      expect(useUIStore.getState().showQuantizeDialog).toBe(true);
      expect(useUIStore.getState().quantizeTarget).toEqual({ clipId: 'c1', noteIds: ['n1', 'n2'] });
    });
  });

  // ── Slice mode ──────────────────────────────────────────────

  describe('slice mode', () => {
    it('enterSliceMode activates for a clip', () => {
      useUIStore.getState().enterSliceMode('c1');
      expect(useUIStore.getState().sliceModeClipId).toBe('c1');
    });

    it('exitSliceMode deactivates', () => {
      useUIStore.getState().enterSliceMode('c1');
      useUIStore.getState().exitSliceMode();
      expect(useUIStore.getState().sliceModeClipId).toBeNull();
    });

    it('addSliceMarker adds a marker', () => {
      useUIStore.getState().addSliceMarker('c1', 1.5);
      const markers = useUIStore.getState().sliceMarkersByClip['c1'];
      expect(markers).toContain(1.5);
    });

    it('removeSliceMarker removes by index', () => {
      useUIStore.getState().setSliceMarkers('c1', [0.5, 1.0, 1.5]);
      useUIStore.getState().removeSliceMarker('c1', 1);
      expect(useUIStore.getState().sliceMarkersByClip['c1']).toEqual([0.5, 1.5]);
    });

    it('setSliceMarkers replaces all markers for a clip', () => {
      useUIStore.getState().setSliceMarkers('c1', [0.25, 0.5, 0.75]);
      expect(useUIStore.getState().sliceMarkersByClip['c1']).toEqual([0.25, 0.5, 0.75]);
    });
  });

  // ── Accessibility ───────────────────────────────────────────

  describe('accessibility', () => {
    it('setReducedMotion toggles', () => {
      useUIStore.getState().setReducedMotion(true);
      expect(useUIStore.getState().reducedMotion).toBe(true);
    });

    it('setReducedMotionManual sets value and marks override', () => {
      useUIStore.getState().setReducedMotionManual(true);
      const state = useUIStore.getState();
      expect(state.reducedMotion).toBe(true);
      expect(state.reducedMotionOverride).toBe(true);
    });

    it('setHighContrastMode toggles', () => {
      useUIStore.getState().setHighContrastMode(true);
      expect(useUIStore.getState().highContrastMode).toBe(true);
    });

    it('setColorBlindMode toggles', () => {
      useUIStore.getState().setColorBlindMode(true);
      expect(useUIStore.getState().colorBlindMode).toBe(true);
    });
  });

  // ── Theme ───────────────────────────────────────────────────

  describe('theme', () => {
    it('setTheme changes the active theme', () => {
      useUIStore.getState().setTheme('logic-pro');
      expect(useUIStore.getState().theme).toBe('logic-pro');
    });
  });

  // ── Workspace complexity ────────────────────────────────────

  describe('workspace complexity', () => {
    it('applyWorkspaceComplexity simple hides mixer and library', () => {
      useUIStore.getState().applyWorkspaceComplexity('simple');
      const state = useUIStore.getState();
      expect(state.workspaceComplexity).toBe('simple');
      expect(state.showMixer).toBe(false);
      expect(state.showSmartControls).toBe(true);
    });

    it('applyWorkspaceComplexity advanced shows mixer and library', () => {
      useUIStore.getState().applyWorkspaceComplexity('advanced');
      const state = useUIStore.getState();
      expect(state.workspaceComplexity).toBe('advanced');
      expect(state.showMixer).toBe(true);
      expect(state.showLibrary).toBe(true);
      expect(state.showTempoLane).toBe(true);
    });
  });

  // ── Session view keyboard nav ───────────────────────────────

  describe('session view navigation', () => {
    it('setSelectedSessionSlot sets slot', () => {
      useUIStore.getState().setSelectedSessionSlot({ trackId: 't1', sceneIndex: 2 });
      expect(useUIStore.getState().selectedSessionSlot).toEqual({ trackId: 't1', sceneIndex: 2 });
    });

    it('clearSelectedSessionSlot clears', () => {
      useUIStore.getState().setSelectedSessionSlot({ trackId: 't1', sceneIndex: 0 });
      useUIStore.getState().clearSelectedSessionSlot();
      expect(useUIStore.getState().selectedSessionSlot).toBeNull();
    });
  });

  // ── Batch generate mode ─────────────────────────────────────

  describe('batch generate mode', () => {
    it('setBatchGenerateMode sets mode', () => {
      useUIStore.getState().setBatchGenerateMode('silence');
      expect(useUIStore.getState().batchGenerateMode).toBe('silence');
    });

    it('setBatchGenerateMode clears with null', () => {
      useUIStore.getState().setBatchGenerateMode('context');
      useUIStore.getState().setBatchGenerateMode(null);
      expect(useUIStore.getState().batchGenerateMode).toBeNull();
    });
  });

  // ── isAnyModalOpen ──────────────────────────────────────────

  describe('isAnyModalOpen', () => {
    it('returns false when no modals are open', () => {
      expect(isAnyModalOpen()).toBe(false);
    });

    it('returns true when command palette is open', () => {
      useUIStore.getState().openCommandPalette();
      expect(isAnyModalOpen()).toBe(true);
    });

    it('returns true when settings dialog is open', () => {
      useUIStore.getState().setShowSettingsDialog(true);
      expect(isAnyModalOpen()).toBe(true);
    });

    it('returns true when bounce in place is open', () => {
      useUIStore.getState().openBounceInPlaceDialog('t1');
      expect(isAnyModalOpen()).toBe(true);
    });

    it('returns true when delete confirmation is open', () => {
      useUIStore.setState({ pendingDeleteTrackIds: ['t1'] });
      expect(isAnyModalOpen()).toBe(true);
    });
  });

  // ── DSP backend ─────────────────────────────────────────────

  describe('DSP backend', () => {
    it('setDspBackend changes backend', () => {
      useUIStore.getState().setDspBackend('wasm');
      expect(useUIStore.getState().dspBackend).toBe('wasm');
    });
  });

  // ── Suggestion frequency ────────────────────────────────────

  describe('suggestion frequency', () => {
    it('setSuggestionFrequency changes value', () => {
      useUIStore.getState().setSuggestionFrequency('active');
      expect(useUIStore.getState().suggestionFrequency).toBe('active');
    });
  });
});
