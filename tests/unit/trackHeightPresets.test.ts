import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project, Track } from '../../src/types/project';
import { useProjectStore } from '../../src/store/projectStore';
import {
  getTrackHeightForPreset,
  TRACK_HEIGHT_PRESETS,
  type TrackHeightPreset,
} from '../../src/constants/trackHeight';

vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    trackName: 'drums',
    displayName: 'Drums',
    color: '#ef4444',
    order: 0,
    volume: 0.8,
    muted: false,
    soloed: false,
    clips: [],
    trackType: 'stems',
    ...overrides,
  } as Track;
}

function makeProject(tracks: Track[]): Project {
  return {
    id: 'project-1',
    name: 'Test',
    createdAt: 1,
    updatedAt: 1,
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    totalDuration: 128,
    measures: 64,
    tracks,
    trackPresets: [],
    generationDefaults: {
      inferenceSteps: 20,
      guidanceScale: 7.5,
      shift: 0,
      thinking: false,
      model: 'test-model',
    },
    globalCaption: '',
    automationLanes: [],
    assets: [],
  };
}

describe('Track Height Presets (#210)', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
  });

  describe('getTrackHeightForPreset', () => {
    it('returns fixed height for small/medium/large', () => {
      expect(getTrackHeightForPreset('small', 'stems')).toBe(48);
      expect(getTrackHeightForPreset('medium', 'stems')).toBe(80);
      expect(getTrackHeightForPreset('large', 'stems')).toBe(140);
    });

    it('returns type-specific default for auto preset', () => {
      expect(getTrackHeightForPreset('auto', 'stems')).toBe(64);
      expect(getTrackHeightForPreset('auto', 'sample')).toBe(64);
      expect(getTrackHeightForPreset('auto', 'sequencer')).toBe(80);
      expect(getTrackHeightForPreset('auto', 'pianoRoll')).toBe(88);
    });
  });

  describe('setTrackHeightPreset', () => {
    it('sets a single track to the small preset', () => {
      const track = makeTrack({ id: 't1', laneHeight: 64 });
      useProjectStore.getState().setProject(makeProject([track]));

      useProjectStore.getState().setTrackHeightPreset('t1', 'small');

      const updated = useProjectStore.getState().project!.tracks[0];
      expect(updated.laneHeight).toBe(48);
    });

    it('sets a single track to the large preset', () => {
      const track = makeTrack({ id: 't1', laneHeight: 64 });
      useProjectStore.getState().setProject(makeProject([track]));

      useProjectStore.getState().setTrackHeightPreset('t1', 'large');

      const updated = useProjectStore.getState().project!.tracks[0];
      expect(updated.laneHeight).toBe(140);
    });

    it('resolves auto based on track type', () => {
      const track = makeTrack({ id: 't1', trackType: 'sequencer', laneHeight: 48 });
      useProjectStore.getState().setProject(makeProject([track]));

      useProjectStore.getState().setTrackHeightPreset('t1', 'auto');

      const updated = useProjectStore.getState().project!.tracks[0];
      expect(updated.laneHeight).toBe(80); // sequencer auto default
    });

    it('does not affect other tracks', () => {
      const t1 = makeTrack({ id: 't1', laneHeight: 64 });
      const t2 = makeTrack({ id: 't2', laneHeight: 64, order: 1 });
      useProjectStore.getState().setProject(makeProject([t1, t2]));

      useProjectStore.getState().setTrackHeightPreset('t1', 'small');

      const tracks = useProjectStore.getState().project!.tracks;
      expect(tracks[0].laneHeight).toBe(48);
      expect(tracks[1].laneHeight).toBe(64);
    });

    it('is a no-op for non-existent track', () => {
      const track = makeTrack({ id: 't1', laneHeight: 64 });
      useProjectStore.getState().setProject(makeProject([track]));

      useProjectStore.getState().setTrackHeightPreset('non-existent', 'small');

      expect(useProjectStore.getState().project!.tracks[0].laneHeight).toBe(64);
    });
  });

  describe('setAllTracksHeightPreset', () => {
    it('sets all tracks to the given preset', () => {
      const t1 = makeTrack({ id: 't1', trackType: 'stems', laneHeight: 64 });
      const t2 = makeTrack({ id: 't2', trackType: 'sequencer', laneHeight: 80, order: 1 });
      useProjectStore.getState().setProject(makeProject([t1, t2]));

      useProjectStore.getState().setAllTracksHeightPreset('large');

      const tracks = useProjectStore.getState().project!.tracks;
      expect(tracks[0].laneHeight).toBe(140);
      expect(tracks[1].laneHeight).toBe(140);
    });

    it('resolves auto per track type', () => {
      const t1 = makeTrack({ id: 't1', trackType: 'stems', laneHeight: 140 });
      const t2 = makeTrack({ id: 't2', trackType: 'pianoRoll', laneHeight: 140, order: 1 });
      useProjectStore.getState().setProject(makeProject([t1, t2]));

      useProjectStore.getState().setAllTracksHeightPreset('auto');

      const tracks = useProjectStore.getState().project!.tracks;
      expect(tracks[0].laneHeight).toBe(64);  // stems auto
      expect(tracks[1].laneHeight).toBe(88);  // pianoRoll auto
    });
  });

  describe('undo support', () => {
    it('setTrackHeightPreset is undoable', () => {
      const track = makeTrack({ id: 't1', laneHeight: 64 });
      useProjectStore.getState().setProject(makeProject([track]));

      useProjectStore.getState().setTrackHeightPreset('t1', 'small');
      expect(useProjectStore.getState().project!.tracks[0].laneHeight).toBe(48);

      useProjectStore.getState().undo();
      expect(useProjectStore.getState().project!.tracks[0].laneHeight).toBe(64);
    });

    it('setAllTracksHeightPreset is undoable', () => {
      const t1 = makeTrack({ id: 't1', laneHeight: 64 });
      const t2 = makeTrack({ id: 't2', laneHeight: 80, order: 1 });
      useProjectStore.getState().setProject(makeProject([t1, t2]));

      useProjectStore.getState().setAllTracksHeightPreset('large');
      expect(useProjectStore.getState().project!.tracks[0].laneHeight).toBe(140);

      useProjectStore.getState().undo();
      expect(useProjectStore.getState().project!.tracks[0].laneHeight).toBe(64);
      expect(useProjectStore.getState().project!.tracks[1].laneHeight).toBe(80);
    });
  });

  describe('window.__store exposure', () => {
    it('store has setTrackHeightPreset and setAllTracksHeightPreset methods', () => {
      const state = useProjectStore.getState();
      expect(typeof state.setTrackHeightPreset).toBe('function');
      expect(typeof state.setAllTracksHeightPreset).toBe('function');
    });
  });
});
