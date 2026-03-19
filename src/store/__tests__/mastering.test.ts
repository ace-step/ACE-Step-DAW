import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectStore } from '../projectStore';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

describe('projectStore mastering', () => {
  beforeEach(() => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
  });

  it('analyzes and enables the master bus chain', async () => {
    const drums = useProjectStore.getState().addTrack('drums');
    useProjectStore.getState().addClip(drums.id, {
      startTime: 0,
      duration: 4,
      prompt: 'tight drums',
      lyrics: '',
    });

    await useProjectStore.getState().analyzeMastering();

    const mastering = useProjectStore.getState().project!.mastering!;
    expect(mastering.enabled).toBe(true);
    expect(mastering.status).toBe('ready');
    expect(mastering.analysis).not.toBeNull();
    expect(mastering.outputLufs).not.toBeNull();
  });

  it('updates preset and loudness target without dropping analysis', async () => {
    const drums = useProjectStore.getState().addTrack('drums');
    useProjectStore.getState().addClip(drums.id, {
      startTime: 0,
      duration: 4,
      prompt: 'tight drums',
      lyrics: '',
    });
    await useProjectStore.getState().analyzeMastering();

    useProjectStore.getState().setMasteringPreset('warm');
    useProjectStore.getState().setMasteringLoudnessTarget(-8);

    const mastering = useProjectStore.getState().project!.mastering!;
    expect(mastering.preset).toBe('warm');
    expect(mastering.loudnessTarget).toBe(-8);
    expect(mastering.analysis).not.toBeNull();
    expect(mastering.chain.makeupGain).toBeGreaterThan(0);
  });

  it('removes mastering non-destructively', async () => {
    const drums = useProjectStore.getState().addTrack('drums');
    useProjectStore.getState().addClip(drums.id, {
      startTime: 0,
      duration: 4,
      prompt: 'tight drums',
      lyrics: '',
    });
    await useProjectStore.getState().analyzeMastering();

    useProjectStore.getState().removeMastering();

    const mastering = useProjectStore.getState().project!.mastering!;
    expect(mastering.enabled).toBe(false);
    expect(mastering.analysis).toBeNull();
    expect(mastering.status).toBe('idle');
  });
});
