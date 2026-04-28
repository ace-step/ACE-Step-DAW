/**
 * Integration test: Generation → Store flow
 *
 * Tests that generation operations correctly update clip status,
 * track state, and generation store without mocking stores.
 * Only network/API calls are mocked.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useProjectStore } from '../../src/store/projectStore';
import { useGenerationStore } from '../../src/store/generationStore';
import { resetAllStores, createTestProject } from './setup';

describe('Generation → Store Integration', () => {
  let tracks: ReturnType<typeof createTestProject>;

  beforeEach(() => {
    resetAllStores();
    tracks = createTestProject();
  });

  // ── Generation lock ──

  it('acquires and releases generation lock', () => {
    expect(useGenerationStore.getState().isGenerating).toBe(false);

    const acquired = useGenerationStore.getState().tryAcquireGenerationLock();
    expect(acquired).toBe(true);
    expect(useGenerationStore.getState().isGenerating).toBe(true);

    useGenerationStore.getState().setIsGenerating(false);
    expect(useGenerationStore.getState().isGenerating).toBe(false);
  });

  it('prevents double lock acquisition', () => {
    useGenerationStore.getState().tryAcquireGenerationLock();
    const second = useGenerationStore.getState().tryAcquireGenerationLock();
    expect(second).toBe(false);

    // Cleanup
    useGenerationStore.getState().setIsGenerating(false);
  });

  // ── Clip status transitions ──

  it('transitions clip from idle → queued → generating → ready', () => {
    const clip = useProjectStore.getState().addClip(tracks.vocals.id, {
      startTime: 0,
      duration: 10,
    });

    // Initial state (new clips start as 'empty')
    expect(clip.generationStatus).toBe('empty');

    // Queue
    useProjectStore.getState().updateClipStatus(clip.id, 'queued');
    let updated = useProjectStore.getState().getClipById(clip.id);
    expect(updated?.generationStatus).toBe('queued');

    // Generating
    useProjectStore.getState().updateClipStatus(clip.id, 'generating');
    updated = useProjectStore.getState().getClipById(clip.id);
    expect(updated?.generationStatus).toBe('generating');

    // Ready
    useProjectStore.getState().updateClipStatus(clip.id, 'ready', {
      isolatedAudioKey: 'audio:test:clip:isolated',
      waveformPeaks: [0.1, 0.5, 0.3],
    });
    updated = useProjectStore.getState().getClipById(clip.id);
    expect(updated?.generationStatus).toBe('ready');
    expect(updated?.isolatedAudioKey).toBe('audio:test:clip:isolated');
    expect(updated?.waveformPeaks).toEqual([0.1, 0.5, 0.3]);
  });

  it('transitions clip to error state with message', () => {
    const clip = useProjectStore.getState().addClip(tracks.vocals.id, {
      startTime: 0,
      duration: 10,
    });

    useProjectStore.getState().updateClipStatus(clip.id, 'error', {
      errorMessage: 'CUDA out of memory',
    });

    const updated = useProjectStore.getState().getClipById(clip.id);
    expect(updated?.generationStatus).toBe('error');
  });

  // ── Generation jobs ──

  it('adds and updates generation jobs', () => {
    useGenerationStore.getState().addJob({
      id: 'job-1',
      clipId: 'clip-1',
      trackName: 'vocals',
      status: 'queued',
      progress: 'Queued',
      stage: 'Queued',
      progressPercent: null,
      etaSeconds: null,
      etaConfidence: 'none',
    });

    const jobs = useGenerationStore.getState().jobs;
    expect(jobs).toHaveLength(1);
    expect(jobs[0].status).toBe('queued');

    useGenerationStore.getState().updateJob('job-1', {
      status: 'generating',
      progress: 'Generating...',
      progressPercent: 50,
    });

    const updatedJobs = useGenerationStore.getState().jobs;
    expect(updatedJobs[0].status).toBe('generating');
    expect(updatedJobs[0].progressPercent).toBe(50);
  });

  // ── Clip version management ──

  it('saves and restores clip versions', () => {
    const clip = useProjectStore.getState().addClip(tracks.vocals.id, {
      startTime: 0,
      duration: 10,
    });

    // Mark as ready with audio
    useProjectStore.getState().updateClipStatus(clip.id, 'ready', {
      isolatedAudioKey: 'audio:v1',
      waveformPeaks: [0.1],
    });

    // Save version
    useProjectStore.getState().saveClipVersion(clip.id);

    // Update clip with new audio
    useProjectStore.getState().updateClipStatus(clip.id, 'ready', {
      isolatedAudioKey: 'audio:v2',
      waveformPeaks: [0.5],
    });

    // Verify we have a version history
    const updatedClip = useProjectStore.getState().getClipById(clip.id);
    expect(updatedClip?.versions).toBeDefined();
    expect(updatedClip?.versions?.length).toBeGreaterThanOrEqual(1);
  });

  // ── Track operations during generation ──

  it('can add clips while project has other clips generating', () => {
    const clip1 = useProjectStore.getState().addClip(tracks.vocals.id, {
      startTime: 0,
      duration: 10,
    });
    useProjectStore.getState().updateClipStatus(clip1.id, 'generating');

    // Should still be able to add clips to other tracks
    const clip2 = useProjectStore.getState().addClip(tracks.drums.id, {
      startTime: 0,
      duration: 10,
    });

    expect(clip2.id).toBeDefined();
    const project = useProjectStore.getState().project!;
    const drumTrack = project.tracks.find((t) => t.id === tracks.drums.id);
    expect(drumTrack?.clips).toHaveLength(1);
  });

  // ── Multi-track state consistency ──

  it('maintains track independence during operations', () => {
    // Add clips to all tracks
    const vocalClip = useProjectStore.getState().addClip(tracks.vocals.id, { startTime: 0, duration: 10 });
    const drumClip = useProjectStore.getState().addClip(tracks.drums.id, { startTime: 0, duration: 10 });

    // Update one track's clip status
    useProjectStore.getState().updateClipStatus(vocalClip.id, 'ready', {
      isolatedAudioKey: 'audio:vocal',
    });

    // Verify other track is unaffected
    const drum = useProjectStore.getState().getClipById(drumClip.id);
    expect(drum?.generationStatus).toBe('empty');
    expect(drum?.isolatedAudioKey).toBeNull();
  });

  // ── Generation order ──

  it('returns tracks in generation order', () => {
    const orderedTracks = useProjectStore.getState().getTracksInGenerationOrder();
    expect(orderedTracks.length).toBeGreaterThan(0);
    // Each track should have an id
    for (const track of orderedTracks) {
      expect(track.id).toBeDefined();
    }
  });

  // ── Generation history ──

  it('records generation history entries', () => {
    const recordId = useGenerationStore.getState().upsertGenerationHistoryRecord({
      clipId: 'clip-1',
      trackId: tracks.vocals.id,
      trackName: 'vocals',
      prompt: 'Ethereal melody',
      model: 'ace-step-1.5',
      duration: 30,
      status: 'queued',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      startedAt: null,
      completedAt: null,
      taskId: undefined,
      audioKey: null,
      audioDuration: 30,
      error: undefined,
    });

    expect(recordId).toBeDefined();
    const history = useGenerationStore.getState().generationHistory;
    expect(history.length).toBeGreaterThan(0);
  });
});
