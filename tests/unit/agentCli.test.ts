import { beforeEach, describe, expect, it } from 'vitest';
import { getAgentCliRuntime } from '../../src/services/agentCli';
import { usePostProductionStore } from '../../src/store/postProductionStore';
import { useProjectStore } from '../../src/store/projectStore';
import { useTransportStore } from '../../src/store/transportStore';
import { useUIStore } from '../../src/store/uiStore';

describe('agent CLI runtime', () => {
  beforeEach(() => {
    localStorage.clear();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useTransportStore.setState(useTransportStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
    usePostProductionStore.setState(usePostProductionStore.getInitialState(), true);
  });

  it('lists stable command descriptors', () => {
    const commands = getAgentCliRuntime().listCommands();
    expect(commands.find((item) => item.id === 'project.create')).toBeDefined();
    expect(commands.find((item) => item.id === 'track.add')).toBeDefined();
    expect(commands.find((item) => item.id === 'pianoroll.note.add')).toBeDefined();
    expect(commands.find((item) => item.id === 'postProduction.startRepair')).toBeDefined();
    expect(commands.find((item) => item.id === 'clip.cover.open')).toBeDefined();
  });

  it('creates a core music workflow through the shared command runtime', async () => {
    const runtime = getAgentCliRuntime();

    const projectResult = await runtime.execute('project.create', { name: 'CLI Test', bpm: 128 });
    expect(projectResult.ok).toBe(true);

    const trackResult = await runtime.execute('track.add', { trackName: 'keyboard', trackType: 'pianoRoll' });
    expect(trackResult.ok).toBe(true);
    if (!trackResult.ok) throw new Error('Expected track add to succeed');

    const clipResult = await runtime.execute('clip.createMidi', {
      trackId: (trackResult.value as { id: string }).id,
      startTime: 0,
      duration: 4,
    });
    expect(clipResult.ok).toBe(true);
    if (!clipResult.ok) throw new Error('Expected MIDI clip creation to succeed');

    const noteResult = await runtime.execute('pianoroll.note.add', {
      clipId: (clipResult.value as { id: string }).id,
      pitch: 60,
      startBeat: 0,
      durationBeats: 1,
      velocity: 0.8,
    });
    expect(noteResult.ok).toBe(true);

    const playResult = await runtime.execute('transport.play');
    expect(playResult.ok).toBe(true);
    expect(useTransportStore.getState().isPlaying).toBe(true);
  });

  it('stops a batch on the first failure', async () => {
    const batch = await getAgentCliRuntime().batch([
      { id: 'project.create', args: { name: 'Batch Project' } },
      { id: 'track.add.piano' },
      { id: 'pianoroll.note.add', args: { clipId: 'missing-clip', pitch: 60, startBeat: 0, durationBeats: 1, velocity: 0.8 } },
      { id: 'transport.play' },
    ]);

    expect(batch.ok).toBe(false);
    expect(batch.failedIndex).toBe(2);
    expect(batch.results).toHaveLength(3);
    expect(useTransportStore.getState().isPlaying).toBe(false);
  });

  it('shares overlapping command ids with the command palette surface', async () => {
    useProjectStore.getState().createProject({ name: 'Palette Bridge' });
    const paletteIds = useUIStore.getState().getCommandPaletteRegistry().map((item) => item.id);
    expect(paletteIds).toContain('transport.play');
    expect(paletteIds).toContain('panel.toggle.library');
    expect(paletteIds).toContain('track.add.piano');
    expect(paletteIds).toContain('postProduction.open');
  });

  it('opens and reads the post-production task state through the shared runtime', async () => {
    const runtime = getAgentCliRuntime();
    await runtime.execute('project.create', { name: 'Post Production Project' });

    const openResult = await runtime.execute('postProduction.open', { taskType: 'repair' });
    expect(openResult.ok).toBe(true);
    expect(usePostProductionStore.getState().isOpen).toBe(true);

    const stateResult = await runtime.execute('postProduction.getTaskState');
    expect(stateResult.ok).toBe(true);
    if (!stateResult.ok) throw new Error('Expected task state result');
    expect((stateResult.value as { taskType: string }).taskType).toBe('repair');
  });

  it('returns a structured error when post-production cannot advance to the next step yet', async () => {
    const runtime = getAgentCliRuntime();
    await runtime.execute('project.create', { name: 'Post Production Guard Rails' });

    const nextResult = await runtime.execute('postProduction.runNextStep');
    expect(nextResult.ok).toBe(false);
    if (nextResult.ok) throw new Error('Expected next-step command to fail');
    expect(nextResult.error.code).toBe('POST_PRODUCTION_TASK_NOT_READY');
  });
});
