/**
 * Integration test: Generation flow through real stores
 *
 * This test exercises the generation pipeline using REAL Zustand stores
 * instead of mocking them. Only external dependencies (network, audio engine)
 * are mocked.
 *
 * Pattern to follow for future integration tests:
 * - Use real stores (useProjectStore, useGenerationStore, useUIStore)
 * - Mock only: network (fetch), audio engine, file system (IndexedDB)
 * - Assert on store state changes, not on mock call counts
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { useGenerationStore, createDefaultGenerationFormState } from '../../src/store/generationStore';
import { useUIStore } from '../../src/store/uiStore';

// Only mock external I/O — NOT stores
vi.mock('../../src/services/projectStorage', () => ({
  saveProject: vi.fn(),
}));

vi.mock('../../src/hooks/useToast', () => ({
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
}));

describe('Integration: Generation → Store flow', () => {
  beforeEach(() => {
    // Reset to real initial state
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useUIStore.setState(useUIStore.getInitialState(), true);
  });

  it('creates a project, adds tracks, and sets up generation form through real stores', () => {
    // 1. Create project with real store
    useProjectStore.getState().createProject({ name: 'Integration Test', bpm: 140, keyScale: 'A minor' });
    const project = useProjectStore.getState().project;
    expect(project).not.toBeNull();
    expect(project!.name).toBe('Integration Test');
    expect(project!.bpm).toBe(140);

    // 2. Add a track with real store
    const track = useProjectStore.getState().addTrack('vocals');
    expect(track.trackType).toBe('stems');
    expect(useProjectStore.getState().project!.tracks).toHaveLength(1);

    // 3. Configure generation form with real generation store
    const genStore = useGenerationStore.getState();
    genStore.setGenerationPrompt('melodic house vocals with reverb');
    genStore.setGenerationBpm(140);
    genStore.setGenerationKeyScale('A minor');
    useGenerationStore.setState((s) => ({
      generationForm: { ...s.generationForm, selectedTrackId: track.id },
    }));

    const form = useGenerationStore.getState().generationForm;
    expect(form.prompt).toBe('melodic house vocals with reverb');
    expect(form.bpm).toBe(140);
    expect(form.keyScale).toBe('A minor');
    expect(form.selectedTrackId).toBe(track.id);

    // 4. Toggle generation panel via UI store
    useUIStore.getState().setShowGenerationPanel(true);
    expect(useUIStore.getState().showGenerationPanel).toBe(true);
  });

  it('submitGenerationRequest builds correct params from store state', () => {
    // Setup
    useProjectStore.getState().createProject({ name: 'Submit Test', bpm: 120 });
    const track = useProjectStore.getState().addTrack('drums');

    useGenerationStore.setState({
      generationForm: {
        ...createDefaultGenerationFormState(),
        prompt: 'drum and bass breakbeat',
        bpm: 174,
        keyScale: 'C minor',
        selectedTrackId: track.id,
        inferenceSteps: 50,
        guidanceScale: 7.5,
        temperature: 0.8,
      },
    });

    // Submit through real store action
    const params = useGenerationStore.getState().submitGenerationRequest({ globalCaption: '' });

    expect(params).not.toBeNull();
    expect(params!.prompt).toBe('drum and bass breakbeat');
    expect(params!.bpm).toBe(174);
    expect(params!.keyScale).toBe('C minor');
    expect(params!.trackId).toBe(track.id);
    expect(params!.inferenceSteps).toBe(50);
    expect(params!.guidanceScale).toBe(7.5);
  });

  it('generation store job lifecycle: add → update → complete', () => {
    const genStore = useGenerationStore.getState();

    // Add a generation job
    genStore.addJob({
      id: 'job-1',
      clipId: 'clip-1',
      trackName: 'Drums',
      status: 'generating',
      progress: 'Starting...',
      stage: 'init',
      progressPercent: 0,
      etaSeconds: null,
      etaConfidence: 'low',
    });

    let jobs = useGenerationStore.getState().jobs;
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('generating');

    // Update progress
    genStore.updateJob('job-1', {
      progress: 'Diffusion pass 50%',
      stage: 'diffusion',
      progressPercent: 50,
    });

    jobs = useGenerationStore.getState().jobs;
    expect(jobs[0].progressPercent).toBe(50);
    expect(jobs[0].stage).toBe('diffusion');

    // Complete
    genStore.updateJob('job-1', { status: 'done', progressPercent: 100 });
    jobs = useGenerationStore.getState().jobs;
    expect(jobs[0].status).toBe('done');
    expect(jobs[0].progressPercent).toBe(100);
  });

  it('advanced param setters clamp values correctly through real store', () => {
    const gen = useGenerationStore.getState();

    // Inference steps: clamped to 1-200
    gen.setGenerationInferenceSteps(0);
    expect(useGenerationStore.getState().generationForm.inferenceSteps).toBe(1);
    gen.setGenerationInferenceSteps(999);
    expect(useGenerationStore.getState().generationForm.inferenceSteps).toBe(200);

    // Guidance scale: clamped to 0-20
    gen.setGenerationGuidanceScale(-5);
    expect(useGenerationStore.getState().generationForm.guidanceScale).toBe(0);
    gen.setGenerationGuidanceScale(50);
    expect(useGenerationStore.getState().generationForm.guidanceScale).toBe(20);

    // Shift: clamped to 0-10
    gen.setGenerationShift(-1);
    expect(useGenerationStore.getState().generationForm.shift).toBe(0);
    gen.setGenerationShift(100);
    expect(useGenerationStore.getState().generationForm.shift).toBe(10);
  });

  it('project track operations work end-to-end: add → configure → undo → redo', () => {
    useProjectStore.getState().createProject({ name: 'Undo Test' });

    // Add track
    const track = useProjectStore.getState().addTrack('vocals');
    expect(useProjectStore.getState().project!.tracks).toHaveLength(1);

    // Update track
    useProjectStore.getState().updateTrack(track.id, {
      displayName: 'Lead Vocals',
      volume: 0.6,
      color: '#ff0000',
    });
    const updated = useProjectStore.getState().project!.tracks[0];
    expect(updated.displayName).toBe('Lead Vocals');
    expect(updated.volume).toBe(0.6);

    // Undo
    useProjectStore.getState().undo();
    const afterUndo = useProjectStore.getState().project!.tracks[0];
    expect(afterUndo.displayName).not.toBe('Lead Vocals');

    // Redo
    useProjectStore.getState().redo();
    const afterRedo = useProjectStore.getState().project!.tracks[0];
    expect(afterRedo.displayName).toBe('Lead Vocals');
  });
});
