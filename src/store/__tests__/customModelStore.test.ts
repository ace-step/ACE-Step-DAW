import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCustomModelStore } from '../customModelStore';
import type { TrainingDataTrack, CustomModel } from '../../types/api';

// Mock the API module
vi.mock('../../services/aceStepApi', () => ({
  uploadTrainingTrack: vi.fn(),
  submitTrainingJob: vi.fn(),
  queryTrainingStatus: vi.fn(),
  deleteCustomModel: vi.fn(),
  listCustomModels: vi.fn(),
}));

import {
  uploadTrainingTrack,
  submitTrainingJob,
  queryTrainingStatus,
  deleteCustomModel,
  listCustomModels,
} from '../../services/aceStepApi';

function resetStore() {
  useCustomModelStore.setState(useCustomModelStore.getState(), true);
  // Clear persisted state
  useCustomModelStore.setState({
    trainingTracks: [],
    customModels: [],
    trainingJobs: {},
    isUploading: false,
    uploadError: null,
    trainingError: null,
  });
}

describe('customModelStore', () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('has empty training tracks', () => {
      expect(useCustomModelStore.getState().trainingTracks).toEqual([]);
    });

    it('has empty custom models', () => {
      expect(useCustomModelStore.getState().customModels).toEqual([]);
    });

    it('has no training jobs', () => {
      expect(useCustomModelStore.getState().trainingJobs).toEqual({});
    });

    it('is not uploading', () => {
      expect(useCustomModelStore.getState().isUploading).toBe(false);
    });
  });

  describe('addTrainingTrack', () => {
    it('uploads a file and adds it to training tracks', async () => {
      const mockFile = new File(['audio data'], 'test.wav', { type: 'audio/wav' });
      vi.mocked(uploadTrainingTrack).mockResolvedValue({
        track_id: 'track-1',
        filename: 'test.wav',
        duration: 180,
        bpm: 120,
        genre: ['rock'],
        size_bytes: 1024,
      });

      await useCustomModelStore.getState().addTrainingTrack(mockFile);

      const tracks = useCustomModelStore.getState().trainingTracks;
      expect(tracks).toHaveLength(1);
      expect(tracks[0].id).toBe('track-1');
      expect(tracks[0].filename).toBe('test.wav');
      expect(tracks[0].duration).toBe(180);
      expect(tracks[0].bpm).toBe(120);
      expect(tracks[0].genre).toEqual(['rock']);
      expect(tracks[0].sizeBytes).toBe(1024);
      expect(tracks[0].mimeType).toBe('audio/wav');
    });

    it('sets uploading state during upload', async () => {
      let resolveUpload: (value: unknown) => void;
      const uploadPromise = new Promise((resolve) => { resolveUpload = resolve; });
      vi.mocked(uploadTrainingTrack).mockReturnValue(uploadPromise as never);

      const mockFile = new File(['data'], 'test.wav', { type: 'audio/wav' });
      const addPromise = useCustomModelStore.getState().addTrainingTrack(mockFile);

      expect(useCustomModelStore.getState().isUploading).toBe(true);

      resolveUpload!({
        track_id: 'track-1',
        filename: 'test.wav',
        duration: 60,
        bpm: null,
        genre: [],
        size_bytes: 512,
      });
      await addPromise;

      expect(useCustomModelStore.getState().isUploading).toBe(false);
    });

    it('sets upload error on failure', async () => {
      vi.mocked(uploadTrainingTrack).mockRejectedValue(new Error('Upload failed'));
      const mockFile = new File(['data'], 'test.wav', { type: 'audio/wav' });

      await useCustomModelStore.getState().addTrainingTrack(mockFile);

      expect(useCustomModelStore.getState().uploadError).toBe('Upload failed');
      expect(useCustomModelStore.getState().isUploading).toBe(false);
    });
  });

  describe('removeTrainingTrack', () => {
    it('removes a track by id', () => {
      const track: TrainingDataTrack = {
        id: 'track-1',
        filename: 'test.wav',
        duration: 120,
        bpm: 120,
        genre: ['pop'],
        sizeBytes: 1024,
        mimeType: 'audio/wav',
        uploadedAt: Date.now(),
      };
      useCustomModelStore.setState({ trainingTracks: [track] });

      useCustomModelStore.getState().removeTrainingTrack('track-1');

      expect(useCustomModelStore.getState().trainingTracks).toHaveLength(0);
    });

    it('does nothing for non-existent id', () => {
      const track: TrainingDataTrack = {
        id: 'track-1',
        filename: 'test.wav',
        duration: 120,
        bpm: 120,
        genre: ['pop'],
        sizeBytes: 1024,
        mimeType: 'audio/wav',
        uploadedAt: Date.now(),
      };
      useCustomModelStore.setState({ trainingTracks: [track] });

      useCustomModelStore.getState().removeTrainingTrack('nonexistent');

      expect(useCustomModelStore.getState().trainingTracks).toHaveLength(1);
    });
  });

  describe('clearTrainingTracks', () => {
    it('removes all tracks', () => {
      useCustomModelStore.setState({
        trainingTracks: [
          { id: 't1', filename: 'a.wav', duration: 60, bpm: 120, genre: [], sizeBytes: 100, mimeType: 'audio/wav', uploadedAt: 1 },
          { id: 't2', filename: 'b.wav', duration: 90, bpm: 140, genre: [], sizeBytes: 200, mimeType: 'audio/wav', uploadedAt: 2 },
        ],
      });

      useCustomModelStore.getState().clearTrainingTracks();

      expect(useCustomModelStore.getState().trainingTracks).toHaveLength(0);
    });
  });

  describe('startTraining', () => {
    it('submits training job and starts polling', async () => {
      useCustomModelStore.setState({
        trainingTracks: [
          { id: 't1', filename: 'a.wav', duration: 60, bpm: 120, genre: ['rock'], sizeBytes: 100, mimeType: 'audio/wav', uploadedAt: 1 },
          { id: 't2', filename: 'b.wav', duration: 90, bpm: 140, genre: ['rock'], sizeBytes: 200, mimeType: 'audio/wav', uploadedAt: 2 },
          { id: 't3', filename: 'c.wav', duration: 70, bpm: 130, genre: ['rock'], sizeBytes: 150, mimeType: 'audio/wav', uploadedAt: 3 },
        ],
      });

      vi.mocked(submitTrainingJob).mockResolvedValue({
        job_id: 'job-1',
        status: 'pending',
      });

      await useCustomModelStore.getState().startTraining('My Model', 'A custom model');

      expect(submitTrainingJob).toHaveBeenCalledWith({
        name: 'My Model',
        description: 'A custom model',
        track_ids: ['t1', 't2', 't3'],
      });

      const jobs = useCustomModelStore.getState().trainingJobs;
      expect(jobs['job-1']).toBeDefined();
      expect(jobs['job-1'].status).toBe('pending');
      expect(jobs['job-1'].submittedTrackCount).toBe(3);
      expect(jobs['job-1'].submittedStyleTags).toEqual(['rock']);
    });

    it('requires minimum 3 tracks', async () => {
      useCustomModelStore.setState({
        trainingTracks: [
          { id: 't1', filename: 'a.wav', duration: 60, bpm: 120, genre: [], sizeBytes: 100, mimeType: 'audio/wav', uploadedAt: 1 },
        ],
      });

      await useCustomModelStore.getState().startTraining('My Model', '');

      expect(submitTrainingJob).not.toHaveBeenCalled();
      expect(useCustomModelStore.getState().trainingError).toContain('3');
    });

    it('sets training error on API failure', async () => {
      useCustomModelStore.setState({
        trainingTracks: [
          { id: 't1', filename: 'a.wav', duration: 60, bpm: 120, genre: [], sizeBytes: 100, mimeType: 'audio/wav', uploadedAt: 1 },
          { id: 't2', filename: 'b.wav', duration: 90, bpm: 140, genre: [], sizeBytes: 200, mimeType: 'audio/wav', uploadedAt: 2 },
          { id: 't3', filename: 'c.wav', duration: 70, bpm: 130, genre: [], sizeBytes: 150, mimeType: 'audio/wav', uploadedAt: 3 },
        ],
      });

      vi.mocked(submitTrainingJob).mockRejectedValue(new Error('Server error'));

      await useCustomModelStore.getState().startTraining('My Model', '');

      expect(useCustomModelStore.getState().trainingError).toBe('Server error');
    });
  });

  describe('pollTrainingJob', () => {
    it('updates job progress on poll', async () => {
      useCustomModelStore.setState({
        trainingJobs: {
          'job-1': { jobId: 'job-1', status: 'training', stage: 'training', progressPercent: 30, name: 'Test', description: '', submittedTrackCount: 3, submittedStyleTags: [] },
        },
      });

      vi.mocked(queryTrainingStatus).mockResolvedValue({
        job_id: 'job-1',
        status: 'training',
        stage: 'training',
        progress_percent: 60,
      });

      await useCustomModelStore.getState().pollTrainingJob('job-1');

      const job = useCustomModelStore.getState().trainingJobs['job-1'];
      expect(job.progressPercent).toBe(60);
      expect(job.status).toBe('training');
    });

    it('refreshes custom models from server when training completes', async () => {
      useCustomModelStore.setState({
        trainingJobs: {
          'job-1': { jobId: 'job-1', status: 'training', stage: 'validating', progressPercent: 90, name: 'My Model', description: 'A model', submittedTrackCount: 3, submittedStyleTags: ['rock', 'pop'] },
        },
      });

      vi.mocked(queryTrainingStatus).mockResolvedValue({
        job_id: 'job-1',
        status: 'complete',
        stage: 'complete',
        progress_percent: 100,
        model_path: '/models/custom/my-model',
      });

      vi.mocked(listCustomModels).mockResolvedValue({
        models: [{
          id: 'server-model-1',
          name: 'My Model',
          description: 'A model',
          track_count: 3,
          style_tags: ['rock', 'pop'],
          trained_at: 1000,
          model_path: '/models/custom/my-model',
          training_job_id: 'job-1',
        }],
      });

      await useCustomModelStore.getState().pollTrainingJob('job-1');

      expect(listCustomModels).toHaveBeenCalled();
      const models = useCustomModelStore.getState().customModels;
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('server-model-1');
      expect(models[0].name).toBe('My Model');
      expect(models[0].modelPath).toBe('/models/custom/my-model');
    });
  });

  describe('deleteModel', () => {
    it('removes custom model from state and calls API', async () => {
      const model: CustomModel = {
        id: 'model-1',
        name: 'My Model',
        description: '',
        trackCount: 3,
        styleTags: ['rock'],
        trainedAt: Date.now(),
        trainingJobId: 'job-1',
        modelPath: '/models/custom/model-1',
      };
      useCustomModelStore.setState({ customModels: [model] });

      vi.mocked(deleteCustomModel).mockResolvedValue(undefined);

      await useCustomModelStore.getState().deleteModel('model-1');

      expect(deleteCustomModel).toHaveBeenCalledWith('model-1');
      expect(useCustomModelStore.getState().customModels).toHaveLength(0);
    });

    it('sets trainingError on API failure and keeps model in state', async () => {
      const model: CustomModel = {
        id: 'model-1',
        name: 'My Model',
        description: '',
        trackCount: 3,
        styleTags: ['rock'],
        trainedAt: Date.now(),
        trainingJobId: 'job-1',
        modelPath: '/models/custom/model-1',
      };
      useCustomModelStore.setState({ customModels: [model] });

      vi.mocked(deleteCustomModel).mockRejectedValue(new Error('Server error'));

      await useCustomModelStore.getState().deleteModel('model-1');

      expect(useCustomModelStore.getState().trainingError).toBe('Server error');
      expect(useCustomModelStore.getState().customModels).toHaveLength(1);
    });
  });

  describe('refreshCustomModels', () => {
    it('loads custom models from server', async () => {
      vi.mocked(listCustomModels).mockResolvedValue({
        models: [
          {
            id: 'model-1',
            name: 'My Model',
            description: 'A model',
            track_count: 5,
            style_tags: ['rock', 'pop'],
            trained_at: 1000,
            model_path: '/models/custom/model-1',
            training_job_id: 'job-1',
          },
        ],
      });

      await useCustomModelStore.getState().refreshCustomModels();

      const models = useCustomModelStore.getState().customModels;
      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('My Model');
      expect(models[0].trackCount).toBe(5);
      expect(models[0].styleTags).toEqual(['rock', 'pop']);
    });
  });

  describe('canStartTraining', () => {
    it('returns false with fewer than 3 tracks', () => {
      useCustomModelStore.setState({
        trainingTracks: [
          { id: 't1', filename: 'a.wav', duration: 60, bpm: 120, genre: [], sizeBytes: 100, mimeType: 'audio/wav', uploadedAt: 1 },
        ],
      });

      expect(useCustomModelStore.getState().canStartTraining()).toBe(false);
    });

    it('returns true with 3+ tracks and no active training', () => {
      useCustomModelStore.setState({
        trainingTracks: [
          { id: 't1', filename: 'a.wav', duration: 60, bpm: 120, genre: [], sizeBytes: 100, mimeType: 'audio/wav', uploadedAt: 1 },
          { id: 't2', filename: 'b.wav', duration: 90, bpm: 140, genre: [], sizeBytes: 200, mimeType: 'audio/wav', uploadedAt: 2 },
          { id: 't3', filename: 'c.wav', duration: 70, bpm: 130, genre: [], sizeBytes: 150, mimeType: 'audio/wav', uploadedAt: 3 },
        ],
      });

      expect(useCustomModelStore.getState().canStartTraining()).toBe(true);
    });

    it('returns false during active training', () => {
      useCustomModelStore.setState({
        trainingTracks: [
          { id: 't1', filename: 'a.wav', duration: 60, bpm: 120, genre: [], sizeBytes: 100, mimeType: 'audio/wav', uploadedAt: 1 },
          { id: 't2', filename: 'b.wav', duration: 90, bpm: 140, genre: [], sizeBytes: 200, mimeType: 'audio/wav', uploadedAt: 2 },
          { id: 't3', filename: 'c.wav', duration: 70, bpm: 130, genre: [], sizeBytes: 150, mimeType: 'audio/wav', uploadedAt: 3 },
        ],
        trainingJobs: {
          'job-1': { jobId: 'job-1', status: 'training', stage: 'training', progressPercent: 50, name: 'Test', description: '', submittedTrackCount: 3, submittedStyleTags: [] },
        },
      });

      expect(useCustomModelStore.getState().canStartTraining()).toBe(false);
    });
  });

  describe('getTrainingDataSummary', () => {
    it('returns summary of uploaded tracks', () => {
      useCustomModelStore.setState({
        trainingTracks: [
          { id: 't1', filename: 'a.wav', duration: 60, bpm: 120, genre: ['rock'], sizeBytes: 1000, mimeType: 'audio/wav', uploadedAt: 1 },
          { id: 't2', filename: 'b.wav', duration: 90, bpm: 140, genre: ['pop'], sizeBytes: 2000, mimeType: 'audio/wav', uploadedAt: 2 },
          { id: 't3', filename: 'c.wav', duration: 70, bpm: 130, genre: ['rock', 'pop'], sizeBytes: 1500, mimeType: 'audio/wav', uploadedAt: 3 },
        ],
      });

      const summary = useCustomModelStore.getState().getTrainingDataSummary();

      expect(summary.trackCount).toBe(3);
      expect(summary.totalDuration).toBe(220);
      expect(summary.totalSizeBytes).toBe(4500);
      expect(summary.genres).toContain('rock');
      expect(summary.genres).toContain('pop');
    });
  });
});
