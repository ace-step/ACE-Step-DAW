import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type {
  TrainingDataTrack,
  CustomModel,
  TrainingJobStatus,
  TrainingStage,
} from '../types/api';
import {
  uploadTrainingTrack,
  submitTrainingJob,
  queryTrainingStatus,
  deleteCustomModel as deleteCustomModelApi,
  listCustomModels,
} from '../services/aceStepApi';

const MIN_TRAINING_TRACKS = 3;

export interface TrainingJobState {
  jobId: string;
  name: string;
  description: string;
  status: TrainingJobStatus;
  stage: TrainingStage;
  progressPercent: number;
  error?: string;
  /** Snapshot of submitted track count (captured at job creation, immune to later edits) */
  submittedTrackCount: number;
  /** Snapshot of style tags from submitted tracks */
  submittedStyleTags: string[];
}

export interface TrainingDataSummary {
  trackCount: number;
  totalDuration: number;
  totalSizeBytes: number;
  genres: string[];
}

export interface CustomModelStore {
  trainingTracks: TrainingDataTrack[];
  customModels: CustomModel[];
  trainingJobs: Record<string, TrainingJobState>;
  isUploading: boolean;
  uploadError: string | null;
  trainingError: string | null;

  // Training data management
  addTrainingTrack: (file: File) => Promise<void>;
  removeTrainingTrack: (id: string) => void;
  clearTrainingTracks: () => void;

  // Training workflow
  startTraining: (name: string, description: string) => Promise<void>;
  pollTrainingJob: (jobId: string) => Promise<void>;
  canStartTraining: () => boolean;

  // Custom model management
  deleteModel: (modelId: string) => Promise<void>;
  refreshCustomModels: () => Promise<void>;

  // Computed
  getTrainingDataSummary: () => TrainingDataSummary;
}

export const useCustomModelStore = create<CustomModelStore>()(
  persist(
    (set, get) => ({
      trainingTracks: [],
      customModels: [],
      trainingJobs: {},
      isUploading: false,
      uploadError: null,
      trainingError: null,

      addTrainingTrack: async (file: File) => {
        set({ isUploading: true, uploadError: null });
        try {
          const response = await uploadTrainingTrack(file);
          const track: TrainingDataTrack = {
            id: response.track_id,
            filename: response.filename,
            duration: response.duration,
            bpm: response.bpm,
            genre: response.genre,
            sizeBytes: response.size_bytes,
            mimeType: file.type,
            uploadedAt: Date.now(),
          };
          set((s) => ({
            trainingTracks: [...s.trainingTracks, track],
            isUploading: false,
          }));
        } catch (err) {
          set({
            isUploading: false,
            uploadError: err instanceof Error ? err.message : String(err),
          });
        }
      },

      removeTrainingTrack: (id: string) => {
        set((s) => ({
          trainingTracks: s.trainingTracks.filter((t) => t.id !== id),
        }));
      },

      clearTrainingTracks: () => {
        set({ trainingTracks: [] });
      },

      startTraining: async (name: string, description: string) => {
        const { trainingTracks } = get();
        if (trainingTracks.length < MIN_TRAINING_TRACKS) {
          set({ trainingError: `At least ${MIN_TRAINING_TRACKS} reference tracks required` });
          return;
        }

        set({ trainingError: null });
        try {
          const response = await submitTrainingJob({
            name,
            description,
            track_ids: trainingTracks.map((t) => t.id),
          });

          // Snapshot track metadata at submission time so it's immune to
          // later edits while the job runs.
          const genres = new Set<string>();
          for (const t of trainingTracks) {
            for (const g of t.genre) genres.add(g);
          }

          const jobState: TrainingJobState = {
            jobId: response.job_id,
            name,
            description,
            status: response.status,
            stage: 'uploading',
            progressPercent: 0,
            submittedTrackCount: trainingTracks.length,
            submittedStyleTags: Array.from(genres),
          };

          set((s) => ({
            trainingJobs: { ...s.trainingJobs, [response.job_id]: jobState },
          }));
        } catch (err) {
          set({
            trainingError: err instanceof Error ? err.message : String(err),
          });
        }
      },

      pollTrainingJob: async (jobId: string) => {
        try {
          const response = await queryTrainingStatus(jobId);

          set((s) => {
            const existing = s.trainingJobs[jobId];
            if (!existing) return {};

            const updatedJob: TrainingJobState = {
              ...existing,
              status: response.status,
              stage: response.stage,
              progressPercent: response.progress_percent,
              error: response.error,
            };

            return {
              trainingJobs: { ...s.trainingJobs, [jobId]: updatedJob },
            };
          });

          // When training completes, refresh custom models from the server so
          // we use the canonical persisted model (including its real id) and
          // avoid appending duplicate local entries on repeated polls.
          if (response.status === 'complete' && response.model_path) {
            await get().refreshCustomModels();
          }
        } catch {
          // Polling failures are transient — don't update state
        }
      },

      canStartTraining: () => {
        const { trainingTracks, trainingJobs } = get();
        if (trainingTracks.length < MIN_TRAINING_TRACKS) return false;

        // Check if any job is actively training
        const hasActiveJob = Object.values(trainingJobs).some(
          (j) => j.status !== 'complete' && j.status !== 'failed',
        );
        return !hasActiveJob;
      },

      deleteModel: async (modelId: string) => {
        set({ trainingError: null });
        try {
          await deleteCustomModelApi(modelId);
          set((s) => ({
            customModels: s.customModels.filter((m) => m.id !== modelId),
          }));
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Failed to delete custom model.';
          set({ trainingError: message });
        }
      },

      refreshCustomModels: async () => {
        try {
          const response = await listCustomModels();
          const models: CustomModel[] = response.models.map((m) => ({
            id: m.id,
            name: m.name,
            description: m.description,
            trackCount: m.track_count,
            styleTags: m.style_tags,
            trainedAt: m.trained_at,
            trainingJobId: m.training_job_id,
            modelPath: m.model_path,
          }));
          set({ customModels: models });
        } catch {
          // Silently fail — models stay as cached
        }
      },

      getTrainingDataSummary: () => {
        const { trainingTracks } = get();
        const genres = new Set<string>();
        let totalDuration = 0;
        let totalSizeBytes = 0;

        for (const track of trainingTracks) {
          totalDuration += track.duration;
          totalSizeBytes += track.sizeBytes;
          for (const g of track.genre) genres.add(g);
        }

        return {
          trackCount: trainingTracks.length,
          totalDuration,
          totalSizeBytes,
          genres: Array.from(genres),
        };
      },
    }),
    {
      name: 'ace-step-custom-models',
      storage: createJSONStorage(() => localStorage),
      // trainingJobs are intentionally NOT persisted — they represent
      // ephemeral server-side state that should be re-polled on reload.
      partialize: (state) => ({
        customModels: state.customModels,
        trainingTracks: state.trainingTracks,
      }),
    },
  ),
);
