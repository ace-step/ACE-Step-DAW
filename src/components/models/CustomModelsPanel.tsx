import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useCustomModelStore } from '../../store/customModelStore';
import { Z } from '../../utils/zIndex';
import type { TrainingDataTrack, CustomModel } from '../../types/api';
import type { TrainingJobState } from '../../store/customModelStore';

type Tab = 'upload' | 'training' | 'models';

const ACCEPTED_TYPES = '.wav,.mp3,.flac,.ogg,.aac';
const ACCEPTED_MIME_TYPES = ['audio/wav', 'audio/mpeg', 'audio/flac', 'audio/ogg', 'audio/aac', 'audio/x-wav'];
const MIN_TRACKS = 3;
const RECOMMENDED_TRACKS = 10;

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function TrainingTrackRow({
  track,
  onRemove,
}: {
  track: TrainingDataTrack;
  onRemove: (id: string) => void;
}) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-800/60 border border-zinc-700/50 hover:bg-zinc-800 group"
      data-testid="training-track-row"
      data-track-id={track.id}
    >
      <div className="flex-shrink-0 w-5 h-5 rounded bg-zinc-700/60 flex items-center justify-center">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M2 3h8M2 6h8M2 9h5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" className="text-zinc-400" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-zinc-200 truncate" title={track.filename}>
          {track.filename}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-[10px] text-zinc-500">{formatDuration(track.duration)}</span>
          {track.bpm !== null && (
            <span className="text-[10px] text-zinc-500 font-mono">{track.bpm} BPM</span>
          )}
          {track.genre.length > 0 && (
            <span className="text-[10px] px-1 py-px rounded bg-zinc-700/60 text-zinc-400">
              {track.genre.join(', ')}
            </span>
          )}
          <span className="text-[10px] text-zinc-600">{formatFileSize(track.sizeBytes)}</span>
        </div>
      </div>
      <button
        onClick={() => onRemove(track.id)}
        className="p-1 text-zinc-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded hover:bg-zinc-700/50"
        title="Remove track"
        aria-label={`Remove ${track.filename}`}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M3 3l6 6M9 3l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function TrainingProgress({ job }: { job: TrainingJobState }) {
  const stageLabels: Record<string, string> = {
    uploading: 'Uploading tracks',
    preprocessing: 'Preprocessing audio',
    training: 'Training model',
    validating: 'Validating quality',
    complete: 'Training complete',
    failed: 'Training failed',
  };

  const isFailed = job.status === 'failed';
  const isComplete = job.status === 'complete';

  return (
    <div
      className={`rounded-lg border p-3 ${
        isFailed
          ? 'border-red-800/50 bg-red-900/20'
          : isComplete
            ? 'border-emerald-800/50 bg-emerald-900/20'
            : 'border-zinc-700/50 bg-zinc-800/60'
      }`}
      data-testid="training-job"
      data-job-id={job.jobId}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-zinc-200">{job.name}</span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
            isFailed
              ? 'bg-red-900/60 text-red-300'
              : isComplete
                ? 'bg-emerald-900/60 text-emerald-300'
                : 'bg-indigo-900/60 text-indigo-300'
          }`}
        >
          {stageLabels[job.stage] ?? job.stage}
        </span>
      </div>

      {!isComplete && !isFailed && (
        <div className="space-y-1">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-900/60"
            role="progressbar"
            aria-label={`Training progress for ${job.name}`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(job.progressPercent)}
          >
            <div
              className="h-full rounded-full bg-indigo-500 transition-all duration-500"
              style={{ width: `${job.progressPercent}%` }}
            />
          </div>
          <div className="text-[10px] text-zinc-500 text-right tabular-nums">
            {Math.round(job.progressPercent)}%
          </div>
        </div>
      )}

      {isFailed && job.error && (
        <p className="text-[10px] text-red-400 mt-1">{job.error}</p>
      )}
    </div>
  );
}

function CustomModelCard({
  model,
  onDelete,
}: {
  model: CustomModel;
  onDelete: (id: string) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <div
      className="rounded-lg border border-zinc-700/50 bg-zinc-800/60 p-3 hover:bg-zinc-800"
      data-testid="custom-model-card"
      data-model-id={model.id}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-zinc-200 truncate">{model.name}</div>
          {model.description && (
            <div className="text-[10px] text-zinc-500 mt-0.5 line-clamp-2">{model.description}</div>
          )}
        </div>
        <div className="flex-shrink-0">
          <div className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-900/40 text-emerald-400 font-medium">
            Custom
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-2">
        <span className="text-[10px] text-zinc-500">
          {model.trackCount} tracks
        </span>
        <span className="text-[10px] text-zinc-500">
          {new Date(model.trainedAt).toLocaleDateString()}
        </span>
      </div>

      {model.styleTags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {model.styleTags.map((tag) => (
            <span
              key={tag}
              className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-700/60 text-zinc-400"
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        {confirmDelete ? (
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-400">Delete this model?</span>
            <button
              onClick={() => { onDelete(model.id); setConfirmDelete(false); }}
              className="px-2 py-0.5 text-[10px] rounded bg-red-600 hover:bg-red-500 text-white font-medium"
              aria-label={`Confirm delete ${model.name}`}
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="px-2 py-0.5 text-[10px] rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-300"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmDelete(true)}
            className="px-2 py-0.5 text-[10px] rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-700/50 transition-colors"
            aria-label={`Delete ${model.name}`}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  );
}

export function CustomModelsPanel() {
  const show = useUIStore((s) => s.showCustomModels);
  const setShow = useUIStore((s) => s.setShowCustomModels);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const trainingTracks = useCustomModelStore((s) => s.trainingTracks);
  const customModels = useCustomModelStore((s) => s.customModels);
  const trainingJobs = useCustomModelStore((s) => s.trainingJobs);
  const isUploading = useCustomModelStore((s) => s.isUploading);
  const uploadError = useCustomModelStore((s) => s.uploadError);
  const trainingError = useCustomModelStore((s) => s.trainingError);
  const addTrainingTrack = useCustomModelStore((s) => s.addTrainingTrack);
  const removeTrainingTrack = useCustomModelStore((s) => s.removeTrainingTrack);
  const clearTrainingTracks = useCustomModelStore((s) => s.clearTrainingTracks);
  const startTraining = useCustomModelStore((s) => s.startTraining);
  const canStartTraining = useCustomModelStore((s) => s.canStartTraining);
  const deleteModel = useCustomModelStore((s) => s.deleteModel);
  const refreshCustomModels = useCustomModelStore((s) => s.refreshCustomModels);
  const getTrainingDataSummary = useCustomModelStore((s) => s.getTrainingDataSummary);
  const pollTrainingJob = useCustomModelStore((s) => s.pollTrainingJob);

  const [activeTab, setActiveTab] = useState<Tab>('upload');
  const [modelName, setModelName] = useState('');
  const [modelDescription, setModelDescription] = useState('');
  const [isDragOver, setIsDragOver] = useState(false);

  // Refresh custom models when panel opens
  useEffect(() => {
    if (show) {
      void refreshCustomModels();
    }
  }, [show, refreshCustomModels]);

  // Poll active training jobs
  useEffect(() => {
    if (!show) return;

    const activeJobIds = Object.values(trainingJobs)
      .filter((j) => j.status !== 'complete' && j.status !== 'failed')
      .map((j) => j.jobId);

    if (activeJobIds.length === 0) return;

    const interval = setInterval(() => {
      for (const jobId of activeJobIds) {
        void pollTrainingJob(jobId);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [show, trainingJobs, pollTrainingJob]);

  const handleFileSelect = useCallback(
    async (files: FileList | null) => {
      if (!files) return;
      for (const file of Array.from(files)) {
        if (ACCEPTED_MIME_TYPES.includes(file.type) || file.name.match(/\.(wav|mp3|flac|ogg|aac)$/i)) {
          await addTrainingTrack(file);
        }
      }
    },
    [addTrainingTrack],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      void handleFileSelect(e.dataTransfer.files);
    },
    [handleFileSelect],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleStartTraining = useCallback(async () => {
    if (!modelName.trim()) return;
    const existingJobIds = new Set(Object.keys(trainingJobs));
    await startTraining(modelName.trim(), modelDescription.trim());

    // Only switch to Training tab if a new job was actually created
    const latestJobs = useCustomModelStore.getState().trainingJobs;
    const hasNewJob = Object.keys(latestJobs).some((id) => !existingJobIds.has(id));
    if (hasNewJob) {
      setActiveTab('training');
    }
  }, [modelName, modelDescription, startTraining, trainingJobs]);

  const handleDeleteModel = useCallback(
    async (modelId: string) => {
      await deleteModel(modelId);
    },
    [deleteModel],
  );

  const summary = useMemo(() => getTrainingDataSummary(), [getTrainingDataSummary, trainingTracks]);

  const activeJobs = useMemo(
    () => Object.values(trainingJobs).filter((j) => j.status !== 'complete' && j.status !== 'failed'),
    [trainingJobs],
  );

  const completedJobs = useMemo(
    () => Object.values(trainingJobs).filter((j) => j.status === 'complete' || j.status === 'failed'),
    [trainingJobs],
  );

  if (!show) return null;

  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: 'upload', label: 'Training Data', badge: trainingTracks.length },
    { id: 'training', label: 'Training', badge: activeJobs.length > 0 ? activeJobs.length : undefined },
    { id: 'models', label: 'My Models', badge: customModels.length > 0 ? customModels.length : undefined },
  ];

  return (
    <div
      data-testid="custom-models-panel"
      className="fixed top-10 right-0 bottom-6 w-80 bg-zinc-900/95 backdrop-blur-md border-l border-zinc-700/50 flex flex-col shadow-2xl"
      style={{ zIndex: Z.panel }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-700/50">
        <h2 className="text-sm font-semibold text-zinc-200">Custom Models</h2>
        <button
          data-testid="custom-models-close"
          onClick={() => setShow(false)}
          className="p-1 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 rounded transition-colors"
          title="Close"
          aria-label="Close custom models panel"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-700/50" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-label={tab.label}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
              activeTab === tab.id
                ? 'text-indigo-400 border-b-2 border-indigo-400'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && (
              <span
                className={`text-[9px] px-1 py-px rounded-full font-medium ${
                  activeTab === tab.id ? 'bg-indigo-900/60 text-indigo-300' : 'bg-zinc-700/60 text-zinc-400'
                }`}
              >
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Upload Tab */}
        {activeTab === 'upload' && (
          <div className="px-4 py-3 space-y-3">
            {/* Upload zone */}
            <div
              className={`rounded-lg border-2 border-dashed p-4 text-center transition-colors cursor-pointer ${
                isDragOver
                  ? 'border-indigo-500 bg-indigo-900/20'
                  : 'border-zinc-700/50 hover:border-zinc-600'
              }`}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              aria-label="Upload reference tracks"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPTED_TYPES}
                multiple
                className="hidden"
                onChange={(e) => void handleFileSelect(e.target.files)}
                aria-hidden="true"
              />
              {isUploading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="h-4 w-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
                  <span className="text-xs text-zinc-400">Uploading...</span>
                </div>
              ) : (
                <>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" className="mx-auto mb-2 text-zinc-500">
                    <path d="M12 15V3m0 0L8 7m4-4l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    <path d="M2 17l.621 2.485A2 2 0 004.561 21h14.878a2 2 0 001.94-1.515L22 17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p className="text-xs text-zinc-400 mb-1">
                    Drop audio files here or click to browse
                  </p>
                  <p className="text-[10px] text-zinc-600">
                    WAV, MP3, FLAC, OGG, AAC
                  </p>
                </>
              )}
            </div>

            {uploadError && (
              <div className="text-[10px] text-red-400 px-2 py-1 rounded bg-red-900/20 border border-red-800/30">
                {uploadError}
              </div>
            )}

            {/* Track count guidance */}
            <div className="flex items-center justify-between px-1">
              <span className="text-[10px] text-zinc-500">
                {summary.trackCount} / {MIN_TRACKS} min tracks
                {summary.trackCount >= MIN_TRACKS && summary.trackCount < RECOMMENDED_TRACKS && (
                  <span className="text-zinc-600"> ({RECOMMENDED_TRACKS} recommended)</span>
                )}
              </span>
              {summary.trackCount > 0 && (
                <span className="text-[10px] text-zinc-600">
                  {formatDuration(summary.totalDuration)} total
                </span>
              )}
            </div>

            {/* Progress bar for track count */}
            <div className="h-1 w-full rounded-full bg-zinc-800 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  summary.trackCount >= RECOMMENDED_TRACKS
                    ? 'bg-emerald-500'
                    : summary.trackCount >= MIN_TRACKS
                      ? 'bg-indigo-500'
                      : 'bg-zinc-600'
                }`}
                style={{ width: `${Math.min(100, (summary.trackCount / RECOMMENDED_TRACKS) * 100)}%` }}
              />
            </div>

            {/* Track list */}
            {trainingTracks.length > 0 && (
              <div className="space-y-1.5">
                {trainingTracks.map((track) => (
                  <TrainingTrackRow
                    key={track.id}
                    track={track}
                    onRemove={removeTrainingTrack}
                  />
                ))}
              </div>
            )}

            {/* Actions */}
            {trainingTracks.length > 0 && (
              <div className="flex items-center justify-between pt-2 border-t border-zinc-800">
                <button
                  onClick={clearTrainingTracks}
                  className="text-[10px] text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  Clear all
                </button>
              </div>
            )}

            {/* Model name + start training */}
            {summary.trackCount >= MIN_TRACKS && (
              <div className="space-y-2 pt-2 border-t border-zinc-800">
                <div>
                  <label className="text-[10px] text-zinc-500 block mb-1" htmlFor="model-name">
                    Model Name
                  </label>
                  <input
                    id="model-name"
                    type="text"
                    value={modelName}
                    onChange={(e) => setModelName(e.target.value)}
                    placeholder="e.g., My Rock Style"
                    className="w-full px-2.5 py-1.5 rounded bg-zinc-800 border border-zinc-700/50 text-xs text-zinc-200 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-zinc-500 block mb-1" htmlFor="model-description">
                    Description (optional)
                  </label>
                  <textarea
                    id="model-description"
                    value={modelDescription}
                    onChange={(e) => setModelDescription(e.target.value)}
                    placeholder="Describe the style..."
                    rows={2}
                    className="w-full px-2.5 py-1.5 rounded bg-zinc-800 border border-zinc-700/50 text-xs text-zinc-200 placeholder-zinc-600 focus:border-indigo-500 focus:outline-none resize-none"
                  />
                </div>

                {trainingError && (
                  <div className="text-[10px] text-red-400 px-2 py-1 rounded bg-red-900/20 border border-red-800/30">
                    {trainingError}
                  </div>
                )}

                <button
                  onClick={() => void handleStartTraining()}
                  disabled={!canStartTraining() || !modelName.trim()}
                  className="w-full px-3 py-2 text-xs font-medium rounded transition-colors bg-indigo-600 hover:bg-indigo-500 text-white disabled:bg-zinc-700 disabled:text-zinc-500 disabled:cursor-not-allowed"
                  aria-label="Start training"
                >
                  Start Training ({summary.trackCount} tracks)
                </button>
              </div>
            )}
          </div>
        )}

        {/* Training Tab */}
        {activeTab === 'training' && (
          <div className="px-4 py-3 space-y-3">
            {activeJobs.length === 0 && completedJobs.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-xs text-zinc-500">No training jobs</p>
                <p className="text-[10px] text-zinc-600 mt-1">
                  Upload tracks and start training to create a custom model
                </p>
              </div>
            ) : (
              <>
                {activeJobs.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
                      Active
                    </h3>
                    {activeJobs.map((job) => (
                      <TrainingProgress key={job.jobId} job={job} />
                    ))}
                  </div>
                )}
                {completedJobs.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
                      Completed
                    </h3>
                    {completedJobs.map((job) => (
                      <TrainingProgress key={job.jobId} job={job} />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Models Tab */}
        {activeTab === 'models' && (
          <div className="px-4 py-3 space-y-3">
            {customModels.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-xs text-zinc-500">No custom models yet</p>
                <p className="text-[10px] text-zinc-600 mt-1">
                  Train a model from your reference tracks to get started
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {customModels.map((model) => (
                  <CustomModelCard
                    key={model.id}
                    model={model}
                    onDelete={handleDeleteModel}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
