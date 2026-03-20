import { beforeEach, describe, expect, it } from 'vitest';
import { buildPostProductionTask, openPostProduction, runPostProductionTask } from '../../src/services/postProductionOrchestrator';
import { usePostProductionStore } from '../../src/store/postProductionStore';
import { useProjectStore } from '../../src/store/projectStore';
import { useUIStore } from '../../src/store/uiStore';

describe('post-production orchestrator', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    usePostProductionStore.setState(usePostProductionStore.getInitialState(), true);
  });

  it('hydrates repair defaults from the current clip selection', () => {
    useProjectStore.getState().createProject({ name: 'Repair Defaults' });
    const track = useProjectStore.getState().addTrack('vocals');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 4,
      duration: 6,
      prompt: 'repair this chorus phrase',
      globalCaption: 'cinematic folk ballad',
      lyrics: 'mountains echo softly',
    });
    useUIStore.getState().selectClip(clip.id);

    const task = buildPostProductionTask('repair');
    expect(task.targetClipIds).toEqual([clip.id]);
    expect(task.prompt).toBe('repair this chorus phrase');
    expect(task.globalCaption).toBe('cinematic folk ballad');
    expect(task.timeRange).toEqual({ startTime: 4, endTime: 10 });
  });

  it('returns a structured repair error when the selected clip has no generated audio', async () => {
    useProjectStore.getState().createProject({ name: 'Repair Validation' });
    const track = useProjectStore.getState().addTrack('vocals');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 8,
      prompt: 'fix one wrong lyric',
      globalCaption: 'lyrical pop',
      lyrics: 'hello world',
    });

    openPostProduction('repair', {
      targetClipIds: [clip.id],
      timeRange: { startTime: 1, endTime: 2 },
    });
    const task = await runPostProductionTask();
    expect(task.status).toBe('error');
    expect(task.lastError?.code).toBe('AUDIO_SOURCE_REQUIRED');
  });
});
