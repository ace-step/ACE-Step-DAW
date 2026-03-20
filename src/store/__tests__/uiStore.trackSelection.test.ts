import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from '../uiStore';

describe('UIStore track selection', () => {
  beforeEach(() => {
    useUIStore.setState({
      selectedTrackIds: new Set(),
      selectedClipIds: new Set(),
      lastSelectionContext: null,
    });
  });

  describe('selectTrack', () => {
    it('selects a single track and clears previous selection', () => {
      useUIStore.getState().selectTrack('track-1');
      expect(useUIStore.getState().selectedTrackIds).toEqual(new Set(['track-1']));

      useUIStore.getState().selectTrack('track-2');
      expect(useUIStore.getState().selectedTrackIds).toEqual(new Set(['track-2']));
    });

    it('toggles track in multi-select mode', () => {
      useUIStore.getState().selectTrack('track-1');
      useUIStore.getState().selectTrack('track-2', true);
      expect(useUIStore.getState().selectedTrackIds).toEqual(new Set(['track-1', 'track-2']));

      useUIStore.getState().selectTrack('track-1', true);
      expect(useUIStore.getState().selectedTrackIds).toEqual(new Set(['track-2']));
    });

    it('sets lastSelectionContext to tracks', () => {
      useUIStore.getState().selectTrack('track-1');
      expect(useUIStore.getState().lastSelectionContext).toBe('tracks');
    });
  });

  describe('selectTracks', () => {
    it('selects multiple tracks', () => {
      useUIStore.getState().selectTracks(['track-1', 'track-2', 'track-3']);
      expect(useUIStore.getState().selectedTrackIds).toEqual(new Set(['track-1', 'track-2', 'track-3']));
    });

    it('sets lastSelectionContext to tracks', () => {
      useUIStore.getState().selectTracks(['track-1']);
      expect(useUIStore.getState().lastSelectionContext).toBe('tracks');
    });
  });

  describe('deselectAllTracks', () => {
    it('clears track selection', () => {
      useUIStore.getState().selectTracks(['track-1', 'track-2']);
      useUIStore.getState().deselectAllTracks();
      expect(useUIStore.getState().selectedTrackIds).toEqual(new Set());
    });
  });

  describe('deselectAll', () => {
    it('clears both clip and track selections', () => {
      useUIStore.getState().selectClip('clip-1');
      useUIStore.getState().selectTrack('track-1');
      useUIStore.getState().deselectAll();
      expect(useUIStore.getState().selectedClipIds).toEqual(new Set());
      expect(useUIStore.getState().selectedTrackIds).toEqual(new Set());
      expect(useUIStore.getState().lastSelectionContext).toBeNull();
    });
  });

  describe('lastSelectionContext', () => {
    it('selectClip sets context to clips', () => {
      useUIStore.getState().selectClip('clip-1');
      expect(useUIStore.getState().lastSelectionContext).toBe('clips');
    });

    it('selectClips sets context to clips', () => {
      useUIStore.getState().selectClips(['clip-1', 'clip-2']);
      expect(useUIStore.getState().lastSelectionContext).toBe('clips');
    });

    it('selectTrack sets context to tracks', () => {
      useUIStore.getState().selectTrack('track-1');
      expect(useUIStore.getState().lastSelectionContext).toBe('tracks');
    });

    it('selectTracks sets context to tracks', () => {
      useUIStore.getState().selectTracks(['track-1']);
      expect(useUIStore.getState().lastSelectionContext).toBe('tracks');
    });
  });
});
