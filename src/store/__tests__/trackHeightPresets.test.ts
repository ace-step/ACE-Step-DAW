import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';
import {
  TRACK_HEIGHT_PRESETS,
  getTrackHeightForPreset,
} from '../../constants/trackHeight';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('track height presets', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  describe('TRACK_HEIGHT_PRESETS', () => {
    it('defines small, medium, large, and auto presets', () => {
      expect(TRACK_HEIGHT_PRESETS.small).toBeDefined();
      expect(TRACK_HEIGHT_PRESETS.medium).toBeDefined();
      expect(TRACK_HEIGHT_PRESETS.large).toBeDefined();
      expect(TRACK_HEIGHT_PRESETS.auto).toBeUndefined();
    });

    it('small < medium < large', () => {
      expect(TRACK_HEIGHT_PRESETS.small).toBeLessThan(TRACK_HEIGHT_PRESETS.medium);
      expect(TRACK_HEIGHT_PRESETS.medium).toBeLessThan(TRACK_HEIGHT_PRESETS.large);
    });
  });

  describe('getTrackHeightForPreset', () => {
    it('returns fixed height for small/medium/large', () => {
      expect(getTrackHeightForPreset('small', 'stems')).toBe(TRACK_HEIGHT_PRESETS.small);
      expect(getTrackHeightForPreset('medium', 'stems')).toBe(TRACK_HEIGHT_PRESETS.medium);
      expect(getTrackHeightForPreset('large', 'stems')).toBe(TRACK_HEIGHT_PRESETS.large);
    });

    it('returns track-type default for auto preset', () => {
      expect(getTrackHeightForPreset('auto', 'stems')).toBe(80);
      expect(getTrackHeightForPreset('auto', 'sample')).toBe(80);
      expect(getTrackHeightForPreset('auto', 'sequencer')).toBe(80);
      expect(getTrackHeightForPreset('auto', 'pianoRoll')).toBe(88);
    });
  });

  describe('setTrackHeightPreset (single track)', () => {
    it('sets a single track to a preset height', () => {
      const track = useProjectStore.getState().addTrack('stems');
      useProjectStore.getState().setTrackHeightPreset(track.id, 'small');
      const updated = useProjectStore.getState().project!.tracks[0];
      expect(updated.laneHeight).toBe(TRACK_HEIGHT_PRESETS.small);
    });

    it('sets auto preset to track-type default', () => {
      const track = useProjectStore.getState().addTrack('stems', 'sequencer');
      useProjectStore.getState().setTrackHeightPreset(track.id, 'auto');
      const updated = useProjectStore.getState().project!.tracks[0];
      expect(updated.laneHeight).toBe(80);
    });

    it('pushes to undo history', () => {
      const track = useProjectStore.getState().addTrack('stems');
      useProjectStore.getState().setTrackHeightPreset(track.id, 'large');
      useProjectStore.getState().undo();
      const after = useProjectStore.getState().project!.tracks[0];
      expect(after.laneHeight).not.toBe(TRACK_HEIGHT_PRESETS.large);
    });
  });

  describe('setAllTracksHeightPreset', () => {
    it('sets all tracks to the given preset', () => {
      useProjectStore.getState().addTrack('stems');
      useProjectStore.getState().addTrack('stems', 'sequencer');
      useProjectStore.getState().addTrack('stems', 'pianoRoll');
      useProjectStore.getState().setAllTracksHeightPreset('small');
      const tracks = useProjectStore.getState().project!.tracks;
      expect(tracks).toHaveLength(3);
      for (const t of tracks) {
        expect(t.laneHeight).toBe(TRACK_HEIGHT_PRESETS.small);
      }
    });

    it('auto preset uses track-type defaults', () => {
      useProjectStore.getState().addTrack('stems');
      useProjectStore.getState().addTrack('stems', 'sequencer');
      useProjectStore.getState().addTrack('stems', 'pianoRoll');
      useProjectStore.getState().setAllTracksHeightPreset('auto');
      const tracks = useProjectStore.getState().project!.tracks;
      expect(tracks[0].laneHeight).toBe(80);
      expect(tracks[1].laneHeight).toBe(80);
      expect(tracks[2].laneHeight).toBe(88);
    });

    it('pushes a single undo snapshot for all tracks', () => {
      useProjectStore.getState().addTrack('stems');
      useProjectStore.getState().addTrack('stems');
      useProjectStore.getState().setAllTracksHeightPreset('large');
      useProjectStore.getState().undo();
      const tracks = useProjectStore.getState().project!.tracks;
      for (const t of tracks) {
        expect(t.laneHeight).not.toBe(TRACK_HEIGHT_PRESETS.large);
      }
    });

    it('does nothing when no project exists', () => {
      useProjectStore.setState({ project: null });
      useProjectStore.getState().setAllTracksHeightPreset('small');
    });
  });
});
