import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('sequencer per-step parameter locks and probability', () => {
  let trackId: string;
  let rowId: string;

  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('drums', 'sequencer');
    trackId = track.id;
    rowId = track.sequencerPattern!.rows[0].id;
  });

  const getStep = (stepIdx: number) => {
    const track = useProjectStore.getState().project!.tracks[0];
    return track.sequencerPattern!.rows[0].steps[stepIdx];
  };

  describe('step initialization defaults', () => {
    it('initializes steps with probability=1 and empty stepParams', () => {
      const step = getStep(0);
      expect(step.probability).toBe(1);
      expect(step.stepParams).toEqual({});
    });

    it('all steps in all rows have probability and stepParams', () => {
      const track = useProjectStore.getState().project!.tracks[0];
      for (const row of track.sequencerPattern!.rows) {
        for (const step of row.steps) {
          expect(step.probability).toBe(1);
          expect(step.stepParams).toEqual({});
        }
      }
    });
  });

  describe('setSequencerStepProbability', () => {
    it('sets probability on a step', () => {
      useProjectStore.getState().setSequencerStepProbability(trackId, rowId, 0, 0.5);
      expect(getStep(0).probability).toBe(0.5);
    });

    it('clamps probability to 0-1 range', () => {
      useProjectStore.getState().setSequencerStepProbability(trackId, rowId, 0, 1.5);
      expect(getStep(0).probability).toBe(1);

      useProjectStore.getState().setSequencerStepProbability(trackId, rowId, 0, -0.3);
      expect(getStep(0).probability).toBe(0);
    });

    it('does not affect other step properties', () => {
      useProjectStore.getState().toggleSequencerStep(trackId, rowId, 0);
      useProjectStore.getState().setSequencerStepVelocity(trackId, rowId, 0, 0.6);
      useProjectStore.getState().setSequencerStepProbability(trackId, rowId, 0, 0.75);

      const step = getStep(0);
      expect(step.active).toBe(true);
      expect(step.velocity).toBe(0.6);
      expect(step.probability).toBe(0.75);
    });
  });

  describe('setSequencerStepParams', () => {
    it('sets a single param lock on a step', () => {
      useProjectStore.getState().setSequencerStepParams(trackId, rowId, 0, { pitch: 0.7 });
      expect(getStep(0).stepParams).toEqual({ pitch: 0.7 });
    });

    it('merges new params with existing params', () => {
      useProjectStore.getState().setSequencerStepParams(trackId, rowId, 0, { pitch: 0.7 });
      useProjectStore.getState().setSequencerStepParams(trackId, rowId, 0, { decay: 0.3 });
      expect(getStep(0).stepParams).toEqual({ pitch: 0.7, decay: 0.3 });
    });

    it('overwrites existing param value', () => {
      useProjectStore.getState().setSequencerStepParams(trackId, rowId, 0, { pitch: 0.7 });
      useProjectStore.getState().setSequencerStepParams(trackId, rowId, 0, { pitch: 0.9 });
      expect(getStep(0).stepParams).toEqual({ pitch: 0.9 });
    });

    it('does not affect other step properties', () => {
      useProjectStore.getState().toggleSequencerStep(trackId, rowId, 0);
      useProjectStore.getState().setSequencerStepProbability(trackId, rowId, 0, 0.5);
      useProjectStore.getState().setSequencerStepParams(trackId, rowId, 0, { decay: 0.4 });

      const step = getStep(0);
      expect(step.active).toBe(true);
      expect(step.probability).toBe(0.5);
      expect(step.stepParams).toEqual({ decay: 0.4 });
    });
  });

  describe('clearSequencerStepParam', () => {
    it('removes a single param lock from a step', () => {
      useProjectStore.getState().setSequencerStepParams(trackId, rowId, 0, { pitch: 0.7, decay: 0.3 });
      useProjectStore.getState().clearSequencerStepParam(trackId, rowId, 0, 'pitch');
      expect(getStep(0).stepParams).toEqual({ decay: 0.3 });
    });

    it('is a no-op for non-existent param', () => {
      useProjectStore.getState().setSequencerStepParams(trackId, rowId, 0, { pitch: 0.7 });
      useProjectStore.getState().clearSequencerStepParam(trackId, rowId, 0, 'decay');
      expect(getStep(0).stepParams).toEqual({ pitch: 0.7 });
    });
  });

  describe('probability preserved through toggleSequencerStep', () => {
    it('preserves probability when toggling step off and on', () => {
      useProjectStore.getState().toggleSequencerStep(trackId, rowId, 0);
      useProjectStore.getState().setSequencerStepProbability(trackId, rowId, 0, 0.5);
      useProjectStore.getState().toggleSequencerStep(trackId, rowId, 0); // off
      useProjectStore.getState().toggleSequencerStep(trackId, rowId, 0); // on

      // After toggling off+on, probability should be preserved
      expect(getStep(0).probability).toBe(0.5);
    });
  });

  describe('step params preserved through batch operations', () => {
    it('batchSetSequencerSteps preserves probability and stepParams', () => {
      useProjectStore.getState().setSequencerStepProbability(trackId, rowId, 0, 0.5);
      useProjectStore.getState().setSequencerStepParams(trackId, rowId, 0, { pitch: 0.7 });

      useProjectStore.getState().batchSetSequencerSteps(trackId, [
        { rowId, stepIndex: 0, active: true, velocity: 0.9 },
      ]);

      const step = getStep(0);
      expect(step.active).toBe(true);
      expect(step.velocity).toBe(0.9);
      expect(step.probability).toBe(0.5);
      expect(step.stepParams).toEqual({ pitch: 0.7 });
    });
  });

  describe('added bars get proper defaults', () => {
    it('new steps from setSequencerBars have probability=1 and stepParams={}', () => {
      useProjectStore.getState().setSequencerBars(trackId, 2);
      const track = useProjectStore.getState().project!.tracks[0];
      const lastStep = track.sequencerPattern!.rows[0].steps[31]; // step index 31 = last step of bar 2
      expect(lastStep.probability).toBe(1);
      expect(lastStep.stepParams).toEqual({});
    });
  });
});
