import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('sequencer row sample assignment and clearing', () => {
  let trackId: string;
  let rowId: string;

  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('drums', 'sequencer');
    trackId = track.id;
    rowId = track.sequencerPattern!.rows[0].id;
  });

  const getRow = (rid?: string) => {
    const track = useProjectStore.getState().project!.tracks[0];
    return track.sequencerPattern!.rows.find((r) => r.id === (rid ?? rowId))!;
  };

  describe('setSequencerRowSample', () => {
    it('updates sampleKey on the target row', () => {
      useProjectStore.getState().setSequencerRowSample(trackId, rowId, 'user-sample-abc');
      expect(getRow().sampleKey).toBe('user-sample-abc');
    });

    it('updates sampleName when provided', () => {
      useProjectStore.getState().setSequencerRowSample(trackId, rowId, 'user-sample-abc', 'My Kick');
      expect(getRow().sampleKey).toBe('user-sample-abc');
      expect(getRow().sampleName).toBe('My Kick');
    });

    it('clears sampleName when not provided', () => {
      // First set a sampleName
      useProjectStore.getState().setSequencerRowSample(trackId, rowId, 'user-sample-abc', 'My Kick');
      expect(getRow().sampleName).toBe('My Kick');

      // Then set without sampleName
      useProjectStore.getState().setSequencerRowSample(trackId, rowId, 'snare');
      expect(getRow().sampleKey).toBe('snare');
      expect(getRow().sampleName).toBeUndefined();
    });

    it('does not affect other rows', () => {
      const secondRowId = useProjectStore.getState().project!.tracks[0].sequencerPattern!.rows[1].id;
      const originalKey = getRow(secondRowId).sampleKey;

      useProjectStore.getState().setSequencerRowSample(trackId, rowId, 'user-sample-xyz', 'Custom');
      expect(getRow(secondRowId).sampleKey).toBe(originalKey);
      expect(getRow(secondRowId).sampleName).toBeUndefined();
    });

    it('is a no-op when project is null', () => {
      useProjectStore.setState({ project: null });
      // Should not throw
      useProjectStore.getState().setSequencerRowSample(trackId, rowId, 'test');
    });
  });

  describe('clearSequencerRowSample', () => {
    it('resets sampleKey to the row default and clears sampleName', () => {
      // Assign a custom sample first
      useProjectStore.getState().setSequencerRowSample(trackId, rowId, 'user-sample-abc', 'Custom Kick');
      expect(getRow().sampleKey).toBe('user-sample-abc');
      expect(getRow().sampleName).toBe('Custom Kick');

      // Clear it
      useProjectStore.getState().clearSequencerRowSample(trackId, rowId);
      // sampleName should be cleared
      expect(getRow().sampleName).toBeUndefined();
      // sampleKey should still exist (reset to built-in default)
      expect(typeof getRow().sampleKey).toBe('string');
      // Should not be the user sample anymore
      expect(getRow().sampleKey).not.toBe('user-sample-abc');
    });

    it('is a no-op when project is null', () => {
      useProjectStore.setState({ project: null });
      // Should not throw
      useProjectStore.getState().clearSequencerRowSample(trackId, rowId);
    });
  });
});
