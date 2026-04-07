import { v4 as uuidv4 } from 'uuid';
import { useProjectStore } from '../store/projectStore';
import {
  useGenerationStore,
  deriveGenerationJobProgress,
  type VariationSessionParams,
  type VariationStatus,
  type ModelOverride,
} from '../store/generationStore';
import { useModelStore } from '../store/modelStore';
import { useUIStore } from '../store/uiStore';
import type { LegoTaskParams, Text2MusicTaskParams, CoverTaskParams, RepaintTaskParams, RepaintMode, TaskResultEntry, TaskResultItem } from '../types/api';
import type { Clip, InferredMetas } from '../types/project';
import * as api from './aceStepApi';
import { generateSilenceWav } from './silenceGenerator';
import { saveAudioBlob, loadAudioBlobByKey } from './audioFileManager';
import { getAudioEngine } from '../hooks/useAudioEngine';
import { toastError, toastInfo, toastSuccess } from '../hooks/useToast';
import { audioBufferToWavBlob } from '../utils/wav';
import { computeWaveformPeaks } from '../utils/waveformPeaks';
import { CLIP_WAVEFORM_PEAK_COUNT } from '../utils/clipAudio';
import { POLL_INTERVAL_MS, MAX_POLL_DURATION_MS } from '../constants/defaults';
import { extractContextAudioLazy } from './lazyContextAudioExtractor';
import { computeEta } from '../utils/generationProgress';
import { createDebugLogger } from '../utils/debugLogger';

const logger = createDebugLogger('ace-step:generation');

/**
 * Resolve a clip's saved contextWindow to absolute project times.
 * New format: relative offsets `{ offsetStart, offsetEnd, trackIds }`.
 * Legacy format: absolute times `{ startTime, endTime }`.
 */
export function resolveContextWindow(clip: Clip): { startTime: number; endTime: number; trackIds: string[] } | null {
  const saved = clip.generationParams?.contextWindow;
  if (!saved) return null;
  if ('offsetStart' in saved) {
    return {
      startTime: clip.startTime + saved.offsetStart,
      endTime: clip.startTime + saved.offsetEnd,
      trackIds: saved.trackIds,
    };
  }
  // Legacy absolute format
  return { startTime: saved.startTime, endTime: saved.endTime, trackIds: [] };
}

function extractProgressMetadata(entry: TaskResultEntry): { stage: string | null; progressPercent: number | null } {
  let stage: string | null = null;
  let progressPercent: number | null = null;

  const rawResult = entry.result?.trim();
  if (rawResult?.startsWith('[')) {
    try {
      const resultItems = JSON.parse(rawResult) as TaskResultItem[];
      const firstResult = resultItems?.[0];
      stage = firstResult?.stage?.trim() || null;
      progressPercent = typeof firstResult?.progress === 'number' ? firstResult.progress : null;
    } catch {
      // Ignore partial/non-JSON progress payloads and fall back to progress_text parsing.
    }
  }

  return { stage, progressPercent };
}

export interface GenerationOutcome {
  cumulativeBlob: Blob | null;
  succeeded: boolean;
  errorMessage?: string;
}

export interface ClipInternalOptions {
  /** Force src_audio to silence instead of previousCumulativeBlob */
  forceSilence?: boolean;
  /** Override the clip's prompt with this local description */
  localDescription?: string;
  /** Override the clip's globalCaption with this value */
  globalCaptionOverride?: string;
  /** Override the clip's lyrics (vocals/backing_vocals) */
  lyricsOverride?: string;
  /** Shared explicit seed — if set, use_random_seed=false is sent */
  sharedSeed?: number;
  /**
   * Server-side absolute or relative path to the context audio file.
   * When provided the blob upload is skipped entirely and the server reads
   * the file directly from disk (requires client and server on the same host).
   */
  srcAudioPath?: string;
  /** Chunk mask mode: "auto" = model auto-decides (value 2), "explicit" = 0/1 mask from repaint range */
  chunkMaskMode?: 'explicit' | 'auto';
  /** Override the default repainting range (clip.startTime → clip.startTime + clip.duration) */
  repaintRange?: { start: number; end: number };
  /** Context window time range — when set, repainting_start/end and audio_duration
   *  are made relative to ctxStart so the backend sees only the context region. */
  contextWindow?: { startTime: number; endTime: number };
  /** Manual override for the backend guidance scale. */
  guidanceScaleOverride?: number;
  /** Manual override for inference steps. */
  inferenceStepsOverride?: number;
  /** Manual override for shift parameter. */
  shiftOverride?: number;
  /** Manual override for thinking mode. */
  thinkingOverride?: boolean;
  /** Manual override for seed value. */
  seedOverride?: number;
  /** Whether to use a random seed (overrides seedOverride). */
  useRandomSeedOverride?: boolean;
  /** Optional variation index for progressive multi-variation sessions. */
  variationIndex?: number;
}

export interface VariationGenerationDependencies {
  generateClip?: (clipId: string, previousCumulativeBlob: Blob | null, options?: ClipInternalOptions) => Promise<GenerationOutcome>;
  createVariationClip?: (params: VariationSessionParams, index: number) => string;
  runVariationClip?: (
    clipId: string,
    index: number,
    report: (updates: VariationProgressUpdate) => void,
  ) => Promise<VariationGenerationResult>;
  saveVariationClipVersion?: (clipId: string) => void;
}

type VariationProgressUpdate = {
  status?: Extract<VariationStatus, 'generating' | 'processing'>;
  progress?: string;
};

export interface VariationGenerationResult {
  succeeded: boolean;
  errorMessage?: string;
}

export interface GenerationPanelRequest {
  prompt: string;
  trackId: string;
  styleTags: string[];
  bpm: number;
  keyScale: string;
  lengthSeconds: number;
  temperature: number;
  variationCount: number;
  lyrics?: string;
}

async function withGenerationToast(label: string, action: () => Promise<boolean>): Promise<void> {
  toastInfo(`${label} started`);

  const succeeded = await action();
  if (succeeded) {
    toastSuccess(`${label} completed`);
  } else {
    const failedJobs = useGenerationStore.getState().jobs.filter((j) => j.status === 'error');
    const detail = failedJobs.length > 0
      ? failedJobs.map((j) => `${j.trackName}: ${j.actionableMessage ?? j.error ?? 'unknown error'}`).join('; ')
      : undefined;
    toastError(detail ? `${label} failed — ${detail}` : `${label} failed`);
  }
}

/**
 * Generate all tracks sequentially (bottom → top in generation order).
 */
export async function generateAllTracks(): Promise<void> {
  const { project, getTracksInGenerationOrder } = useProjectStore.getState();
  const genStore = useGenerationStore.getState();

  if (!project || !genStore.tryAcquireGenerationLock()) return;
  await withGenerationToast('AI generation', async () => {

    try {
      const allTracks = getTracksInGenerationOrder();
      const tracks = allTracks.filter(t => (t.trackType ?? 'stems') === 'stems');
      let previousCumulativeBlob: Blob | null = null;
      let allSucceeded = true;

      logger.debug(`generateAllTracks: ${tracks.length} stems tracks (of ${allTracks.length} total) in order:`,
        tracks.map(t => t.trackName));

      for (const track of tracks) {
        for (const clip of track.clips) {
          if (clip.generationStatus === 'ready') {
            if (clip.cumulativeMixKey) {
              const blob = await loadAudioBlobByKey(clip.cumulativeMixKey);
              if (blob) {
                previousCumulativeBlob = blob;
                logger.debug(`Loaded existing cumulative for clip=${clip.id} (${track.trackName}), size=${blob.size}`);
              }
            }
            continue;
          }

          logger.debug(`Generating clip=${clip.id} (${track.trackName}), previousCumulative=${previousCumulativeBlob ? `${previousCumulativeBlob.size} bytes` : 'null'}`);
          const outcome = await generateClipInternal(
            clip.id,
            previousCumulativeBlob,
          );
          previousCumulativeBlob = outcome.cumulativeBlob;
          allSucceeded = allSucceeded && outcome.succeeded;
          logger.debug(`After generate clip=${clip.id}, cumulativeBlob=${previousCumulativeBlob ? `${previousCumulativeBlob.size} bytes` : 'null'}`);
        }
      }

      return allSucceeded;
    } finally {
      useGenerationStore.getState().setIsGenerating(false);
    }
  });
}

/**
 * Re-generate a single clip, preserving the current audio state as a version entry.
 * On completion, the new result is also saved as a version.
 */
export async function regenerateClip(clipId: string): Promise<void> {
  // Route to text2music regeneration if this is a full-song clip
  const clip = useProjectStore.getState().getClipById(clipId);
  if (clip?.generationParams?.type === 'text2music') {
    return regenerateText2MusicClip(clipId);
  }

  const genStore = useGenerationStore.getState();
  if (!genStore.tryAcquireGenerationLock()) return;

  await withGenerationToast('AI generation', async () => {

    try {
      // If the clip was generated with a context window, re-extract the trimmed context
      const resolvedCtx = clip ? resolveContextWindow(clip) : null;
      let previousBlob: Blob | null;
      const clipOpts: ClipInternalOptions = {};
      if (resolvedCtx) {
        previousBlob = await extractContextAudioLazy(resolvedCtx, { trimToContext: true });
        clipOpts.contextWindow = resolvedCtx;
        clipOpts.forceSilence = !previousBlob;
      } else {
        previousBlob = await getPreviousCumulativeBlob(clipId);
      }
      // Restore persisted chunkMaskMode
      if (clip?.generationParams?.chunkMaskMode) {
        clipOpts.chunkMaskMode = clip.generationParams.chunkMaskMode;
      }
      const outcome = await generateClipInternal(clipId, previousBlob, clipOpts);

      if (outcome.succeeded) {
        useProjectStore.getState().saveClipVersion(clipId);
      }

      return outcome.succeeded;
    } finally {
      useGenerationStore.getState().setIsGenerating(false);
    }
  });
}

/**
 * Re-generate a text2music clip in-place using stored generation params.
 * Saves the current audio as a version, re-submits with a new random seed.
 */
async function regenerateText2MusicClip(clipId: string): Promise<void> {
  const genStore = useGenerationStore.getState();
  if (!genStore.tryAcquireGenerationLock()) return;

  const store = useProjectStore.getState();
  const clip = store.getClipById(clipId);
  if (!clip?.generationParams || clip.generationParams.type !== 'text2music') {
    genStore.setIsGenerating(false);
    return;
  }

  const params = clip.generationParams;
  store.saveClipVersion(clipId);

  try {
    await useModelStore.getState().ensureModelForIntent('full-song');
    const project = store.project;
    if (!project) throw new Error('No project open');

    const defaults = project.generationDefaults;
    const activeModel = useModelStore.getState().activeModelId ?? defaults.model;

    const taskParams: Text2MusicTaskParams = {
      task_type: 'text2music',
      prompt: params.prompt,
      lyrics: params.lyrics,
      audio_duration: params.durationSeconds ?? 60,
      bpm: params.useProjectMeta ? (project.bpm ?? null) : null,
      key_scale: params.useProjectMeta ? (project.keyScale ?? '') : '',
      time_signature: params.useProjectMeta ? String(project.timeSignature ?? 4) : '',
      inference_steps: params.inferenceSteps ?? defaults.inferenceSteps,
      guidance_scale: params.guidanceScale ?? defaults.guidanceScale,
      shift: params.shift ?? defaults.shift,
      batch_size: 1,
      audio_format: 'wav',
      thinking: params.thinking ?? defaults.thinking,
      model: activeModel,
      use_random_seed: true,
    };
    if (params.vocalLanguage) taskParams.vocal_language = params.vocalLanguage;
    if (params.negativePrompt?.trim()) taskParams.negative_prompt = params.negativePrompt.trim();

    const jobId = uuidv4();
    genStore.addJob({ id: jobId, clipId, trackName: 'Full Mix', status: 'queued', progress: 'Queued', stage: 'Queued', progressPercent: null, etaSeconds: null, etaConfidence: 'none' });
    store.updateClipStatus(clipId, 'generating', { generationJobId: jobId });
    genStore.updateJob(jobId, { status: 'generating', startedAt: Date.now(), progress: 'Submitting...', stage: 'Submitting request' });

    const silenceBlob = generateSilenceWav(params.durationSeconds ?? 60);
    const releaseResp = await api.releaseLegoTask(silenceBlob, taskParams);
    const taskId = releaseResp.task_id;
    genStore.updateJob(jobId, { taskId });

    const startTime = Date.now();
    let resultAudioPath: string | null = null;
    let firstResult: TaskResultItem | null = null;

    while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
      await sleep(POLL_INTERVAL_MS);
      const entries = await api.queryResult([taskId]);
      const entry = entries?.[0];
      if (!entry) continue;
      const { stage, progressPercent } = extractProgressMetadata(entry);
      const currentJob = useGenerationStore.getState().jobs.find((j) => j.id === jobId);
      useGenerationStore.getState().updateJob(jobId, { ...deriveGenerationJobProgress(currentJob, { status: 'generating', progress: entry.progress_text || 'Generating...', stage, progressPercent }) });
      if (entry.status === 1) {
        const resultItems: TaskResultItem[] = JSON.parse(entry.result);
        firstResult = resultItems?.[0] ?? null;
        resultAudioPath = firstResult?.file ?? null;
        break;
      } else if (entry.status === 2) {
        throw new Error(`Generation failed: ${entry.result}`);
      }
    }
    if (!resultAudioPath) throw new Error('Generation timed out');

    genStore.updateJob(jobId, { status: 'processing', progress: 'Downloading audio...', stage: 'Downloading audio' });
    store.updateClipStatus(clipId, 'processing');

    const audioBlob = await api.downloadAudio(resultAudioPath);
    const audioKey = await saveAudioBlob(project.id, clipId, 'isolated', audioBlob);
    const engine = getAudioEngine();
    const audioBuffer = await engine.decodeAudioData(audioBlob);
    const peaks = computeWaveformPeaks(audioBuffer, CLIP_WAVEFORM_PEAK_COUNT);

    const inferredMetas: InferredMetas | undefined = firstResult
      ? { bpm: firstResult.metas?.bpm, keyScale: firstResult.metas?.keyscale, timeSignature: firstResult.metas?.timesignature, genres: firstResult.metas?.genres, seed: firstResult.seed_value, ditModel: firstResult.dit_model }
      : undefined;

    const actualDuration = audioBuffer.duration;
    useProjectStore.getState().updateClipStatus(clipId, 'ready', { isolatedAudioKey: audioKey, waveformPeaks: peaks, inferredMetas, audioDuration: actualDuration, audioOffset: 0 });
    useProjectStore.getState().updateClip(clipId, { duration: actualDuration });
    genStore.updateJob(jobId, { status: 'done', progress: 'Done', stage: 'Complete' });
    useProjectStore.getState().saveClipVersion(clipId);
    toastSuccess('Clip regenerated');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Regeneration failed';
    toastError(message);
    useProjectStore.getState().updateClipStatus(clipId, 'error', { errorMessage: message });
  } finally {
    useGenerationStore.getState().setIsGenerating(false);
  }
}

/**
 * Generate a single clip (and cascade if needed in the future).
 */
export async function generateSingleClip(clipId: string, options?: { sharedSeed?: number }): Promise<void> {
  const genStore = useGenerationStore.getState();
  if (!genStore.tryAcquireGenerationLock()) return;

  await withGenerationToast('AI generation', async () => {

    try {
      const clip = useProjectStore.getState().getClipById(clipId);
      const resolvedCtx = clip ? resolveContextWindow(clip) : null;
      let previousBlob: Blob | null;
      const clipOpts: ClipInternalOptions = options ? { sharedSeed: options.sharedSeed } : {};
      if (resolvedCtx) {
        previousBlob = await extractContextAudioLazy(resolvedCtx, { trimToContext: true });
        clipOpts.contextWindow = resolvedCtx;
        clipOpts.forceSilence = !previousBlob;
      } else {
        previousBlob = await getPreviousCumulativeBlob(clipId);
      }
      // Restore persisted chunkMaskMode
      if (clip?.generationParams?.chunkMaskMode) {
        clipOpts.chunkMaskMode = clip.generationParams.chunkMaskMode;
      }
      logger.debug(`generateSingleClip: clip=${clipId}, previousBlob=${previousBlob ? `${previousBlob.size} bytes` : 'null'}`);
      const outcome = await generateClipInternal(clipId, previousBlob, clipOpts);

      if (outcome.succeeded) {
        useProjectStore.getState().saveClipVersion(clipId);
      }

      return outcome.succeeded;
    } finally {
      useGenerationStore.getState().setIsGenerating(false);
    }
  });
}

export async function generateVariationSession(
  params: VariationSessionParams,
  dependencies: VariationGenerationDependencies = {},
): Promise<boolean> {
  const genStore = useGenerationStore.getState();
  const store = useProjectStore.getState();
  const project = store.project;
  if (!project || !genStore.tryAcquireGenerationLock()) return false;

  const track = project.tracks.find((entry) => entry.id === params.trackId);
  if (!track) {
    genStore.setIsGenerating(false);
    useGenerationStore.getState().setGenerationRequestError(`Target track "${params.trackId}" was not found.`);
    return false;
  }

  const sessionId = useGenerationStore.getState().variationSession?.id;
  if (!sessionId) {
    genStore.setIsGenerating(false);
    useGenerationStore.getState().setGenerationRequestError('Start a variation session before generating results.');
    return false;
  }

  const generateClip = dependencies.generateClip ?? generateClipInternal;
  const trackClipEnd = track.clips.reduce((maxEnd, clip) => Math.max(maxEnd, clip.startTime + clip.duration), 0);
  const baseStartTime = Math.max(project.totalDuration, trackClipEnd);
  const spacingSeconds = 0.25;

  try {
    const clipIds = Array.from({ length: params.variationCount }, (_, index) => {
      const clip = store.addClip(params.trackId, {
        startTime: baseStartTime + (index * (params.duration + spacingSeconds)),
        duration: params.duration,
        prompt: params.prompt,
        globalCaption: params.globalCaption ?? '',
        lyrics: params.lyrics ?? '',
        source: 'generated',
      });

      useGenerationStore.getState().updateVariation(index, {
        clipId: clip.id,
        progress: 'Queued',
      });

      return clip.id;
    });

    const isCrossModel = params.comparisonMode === 'cross-model' && params.modelOverrides && params.modelOverrides.length > 0;

    let results: PromiseSettledResult<GenerationOutcome>[];

    if (isCrossModel) {
      // Cross-model mode: generate sequentially, switching models between variations
      const outcomes: PromiseSettledResult<GenerationOutcome>[] = [];
      const currentModelId = useModelStore.getState().activeModelId;

      for (let index = 0; index < clipIds.length; index++) {
        const clipId = clipIds[index];
        const override: ModelOverride | undefined = params.modelOverrides![index];
        const targetModel = override?.modelName;

        // Switch model if needed
        if (targetModel && targetModel !== useModelStore.getState().activeModelId) {
          try {
            await api.initModel({ model: targetModel });
            // Update model store to reflect the switch
            useModelStore.setState({ activeModelId: targetModel });
          } catch (err) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            useGenerationStore.getState().updateVariation(index, {
              status: 'error',
              error: `Model switch failed: ${errorMsg}`,
              completedAt: Date.now(),
            });
            outcomes.push({ status: 'fulfilled', value: { cumulativeBlob: null, succeeded: false, errorMessage: errorMsg } });
            continue;
          }
        }

        try {
          const outcome = await generateClip(clipId, null, {
            forceSilence: true,
            localDescription: params.prompt,
            globalCaptionOverride: params.globalCaption,
            lyricsOverride: params.lyrics,
            variationIndex: index,
            guidanceScaleOverride: override?.guidanceScale ?? params.guidanceScale,
            inferenceStepsOverride: override?.inferenceSteps ?? params.inferenceSteps,
            shiftOverride: params.shift,
            thinkingOverride: params.thinking,
            seedOverride: params.seed ? Number(params.seed) : undefined,
            useRandomSeedOverride: params.useRandomSeed,
          });
          outcomes.push({ status: 'fulfilled', value: outcome });
        } catch (err) {
          outcomes.push({ status: 'rejected', reason: err });
        }

        // Record model name on the variation
        if (targetModel) {
          useGenerationStore.getState().updateVariation(index, { modelName: targetModel });
        }
      }

      results = outcomes;
    } else {
      // Same-model mode: generate in parallel (existing behavior)
      results = await Promise.allSettled(
        clipIds.map((clipId, index) =>
          generateClip(clipId, null, {
            forceSilence: true,
            localDescription: params.prompt,
            globalCaptionOverride: params.globalCaption,
            lyricsOverride: params.lyrics,
            variationIndex: index,
            guidanceScaleOverride: params.guidanceScale,
            inferenceStepsOverride: params.inferenceSteps,
            shiftOverride: params.shift,
            thinkingOverride: params.thinking,
            seedOverride: params.seed ? Number(params.seed) : undefined,
            useRandomSeedOverride: params.useRandomSeed,
          }),
        ),
      );
    }

    const firstCompletedVariation = useGenerationStore.getState().variationSession?.variations.find(
      (variation) => variation.status === 'done' && variation.clipId,
    );
    if (firstCompletedVariation?.clipId) {
      useUIStore.getState().selectClip(firstCompletedVariation.clipId, false);
    }

    const currentSession = useGenerationStore.getState().variationSession;
    if (currentSession?.id === sessionId && currentSession.status === 'generating') {
      const allTerminal = currentSession.variations.every(
        (variation) => variation.status === 'done' || variation.status === 'error' || variation.status === 'cancelled',
      );
      if (allTerminal) {
        currentSession.variations.forEach((variation) => {
          if ((variation.status === 'done' || variation.status === 'error') && variation.completedAt) return;
          if (variation.status === 'done' || variation.status === 'error') {
            useGenerationStore.getState().updateVariation(variation.index, { completedAt: Date.now() });
          }
        });
      }
    }

    return results.every(
      (result) => result.status === 'fulfilled' && result.value.succeeded,
    );
  } finally {
    useGenerationStore.getState().setIsGenerating(false);
  }
}

async function getPreviousCumulativeBlob(clipId: string): Promise<Blob | null> {
  const { project, getTracksInGenerationOrder } = useProjectStore.getState();
  if (!project) return null;

  const tracks = getTracksInGenerationOrder();
  const clipTrack = tracks.find((t) => t.clips.some((c) => c.id === clipId));
  if (!clipTrack) return null;

  const trackIndex = tracks.indexOf(clipTrack);
  logger.debug(`getPreviousCumulativeBlob: clip=${clipId}, trackIndex=${trackIndex}/${tracks.length}, track=${clipTrack.trackName}`);
  logger.debug('Generation order:', tracks.map((t, i) => `${i}:${t.trackName}(order=${t.order})`));

  // Strategy: Look for cumulative audio from already-generated tracks.
  //
  // 1) First, search generation-order predecessors (tracks before this one)
  //    — walking backwards from trackIndex-1 to 0.
  // 2) If nothing found (e.g. this track is first in generation order but
  //    the user generated later tracks first), search successors
  //    — walking forwards from trackIndex+1 to end.
  //
  // In both cases, the cumulative mix of the nearest ready track is used
  // because it already contains all tracks generated before it.

  // Pass 1: predecessors (ideal case)
  for (let i = trackIndex - 1; i >= 0; i--) {
    const prevTrack = tracks[i];
    for (let j = prevTrack.clips.length - 1; j >= 0; j--) {
      const prevClip = prevTrack.clips[j];
      if (prevClip.cumulativeMixKey) {
        const blob = await loadAudioBlobByKey(prevClip.cumulativeMixKey) ?? null;
        logger.debug(`Found predecessor cumulative: track=${prevTrack.trackName}, key=${prevClip.cumulativeMixKey}, blob=${blob ? `${blob.size} bytes` : 'null'}`);
        return blob;
      }
    }
  }

  // Pass 2: successors — user generated tracks out of ideal order
  // Walk forward through generation order and find any track that has
  // already been generated.  Its cumulative still represents valid
  // context audio for the current track.
  for (let i = trackIndex + 1; i < tracks.length; i++) {
    const laterTrack = tracks[i];
    for (let j = laterTrack.clips.length - 1; j >= 0; j--) {
      const laterClip = laterTrack.clips[j];
      if (laterClip.cumulativeMixKey) {
        const blob = await loadAudioBlobByKey(laterClip.cumulativeMixKey) ?? null;
        logger.debug(`Found successor cumulative (out-of-order): track=${laterTrack.trackName}, key=${laterClip.cumulativeMixKey}, blob=${blob ? `${blob.size} bytes` : 'null'}`);
        return blob;
      }
    }
  }

  logger.debug(`No previous cumulative blob found for clip=${clipId}`);
  return null;
}

async function generateClipInternal(
  clipId: string,
  previousCumulativeBlob: Blob | null,
  options: ClipInternalOptions = {},
): Promise<GenerationOutcome> {
  const store = useProjectStore.getState();
  const genStore = useGenerationStore.getState();
  const project = store.project;
  if (!project) return { cumulativeBlob: previousCumulativeBlob, succeeded: false, errorMessage: 'No project' };

  const clip = store.getClipById(clipId);
  const track = store.getTrackForClip(clipId);
  if (!clip || !track) {
    return { cumulativeBlob: previousCumulativeBlob, succeeded: false, errorMessage: 'Clip or track not found' };
  }

  const trackType = track.trackType ?? 'stems';
  if (trackType !== 'stems') {
    logger.warn(`Skipping generation for non-stems track (type=${trackType}, track=${track.displayName})`);
    return { cumulativeBlob: previousCumulativeBlob, succeeded: false, errorMessage: 'Track type is not generatable' };
  }

  const updateVariationProgress = (updates: Parameters<typeof genStore.updateVariation>[1]) => {
    if (options.variationIndex === undefined) return;
    genStore.updateVariation(options.variationIndex, updates);
  };

  // Create generation job
  const jobId = uuidv4();
  genStore.addJob({
    id: jobId,
    clipId,
    trackName: track.trackName,
    status: 'queued',
    progress: 'Queued',
    stage: 'Queued',
    progressPercent: null,
    etaSeconds: null,
    etaConfidence: 'none',
  });
  updateVariationProgress({
    clipId,
    jobId,
    status: 'generating',
    progress: 'Submitting...',
    startedAt: Date.now(),
  });

  store.updateClipStatus(clipId, 'queued', { generationJobId: jobId });

  try {
    // When a context window is provided, all times are relative to ctxStart
    // so the backend only sees the context region (no leading silence).
    const ctxOffset = options.contextWindow?.startTime ?? 0;
    const ctxEnd = options.contextWindow?.endTime;

    // Use context window duration if available, otherwise full project duration
    const audioDuration = ctxEnd != null
      ? ctxEnd - ctxOffset
      : useProjectStore.getState().getAudioDuration();

    // Determine src_audio — prefer a server-side path (no upload), then
    // previous cumulative blob, then synthesized silence.
    const srcBlob = options.srcAudioPath
      ? null
      : (options.forceSilence ? null : previousCumulativeBlob);
    const srcAudioBlob = srcBlob ?? generateSilenceWav(audioDuration);

    logger.debug(
      `clip=${clipId} track=${track.trackName}`,
      options.srcAudioPath
        ? `srcAudioPath=${options.srcAudioPath}`
        : `srcAudio: ${srcBlob ? 'previousCumulative' : 'silence'}`,
      `forceSilence=${options.forceSilence ?? false}`,
      `audioDuration=${audioDuration}s`,
      ctxOffset > 0 ? `ctxOffset=${ctxOffset}s` : '',
    );

    // Build instruction — chunk mode ("a segment of") vs full mode.
    // The backend's conditioning_text.py checks for "a segment" in the instruction
    // to switch caption formatting (chunk = Local only, full = Global + Local).
    //
    // When a context window is present with explicit mask, always use chunk mode
    // (the user is generating a segment within context). Only use full mode when
    // there is no context window or the user explicitly chose "Whole song" (auto mask).
    const trackLabel = track.trackName.toUpperCase().replace('_', ' ');
    const repaintStart = (options.repaintRange?.start ?? clip.startTime) - ctxOffset;
    const repaintEnd = (options.repaintRange?.end ?? (clip.startTime + clip.duration)) - ctxOffset;
    // Determine chunk (segment) vs full mode:
    // - "Whole song" (auto mask, no context) = full mode (needs Global caption)
    // - Context window + explicit mask = always segment (even if selection covers all context)
    // - No context + explicit = time-based heuristic (partial = segment, full = full)
    const hasContextWindow = options.contextWindow != null;
    const isChunkMode = options.chunkMaskMode === 'auto'
      ? false  // "Whole song" = full mode
      : hasContextWindow || (repaintStart >= 0.5 || repaintEnd <= audioDuration - 0.5);
    const instruction = isChunkMode
      ? `Generate a segment of the ${trackLabel} track based on the audio context:`
      : `Generate the ${trackLabel} track based on the audio context:`;

    // Build params — 'auto' = ACE-Step infers, null/undefined = project defaults, value = manual
    const resolvedBpm = clip.bpm === 'auto' ? null : (clip.bpm ?? project.bpm);
    const resolvedKey = clip.keyScale === 'auto' ? '' : (clip.keyScale ?? project.keyScale);
    const resolvedTimeSig = clip.timeSignature === 'auto' ? '' : String(clip.timeSignature ?? project.timeSignature);

    const effectivePrompt = options.localDescription !== undefined ? options.localDescription : (clip.prompt ?? '');
    const clipLevelGlobal = options.globalCaptionOverride !== undefined
      ? options.globalCaptionOverride
      : (clip.globalCaption || '');
    const effectiveGlobalCaption = clipLevelGlobal.trim() || (project.globalCaption ?? '');

    const effectiveLyrics = options.lyricsOverride !== undefined ? options.lyricsOverride : (clip.lyrics || '');

    const params: LegoTaskParams = {
      task_type: 'lego',
      track_name: track.trackName,
      prompt: effectivePrompt,
      global_caption: effectiveGlobalCaption,
      lyrics: effectiveLyrics,
      instruction,
      repainting_start: repaintStart,
      repainting_end: repaintEnd,
      audio_duration: audioDuration,
      bpm: resolvedBpm,
      key_scale: resolvedKey,
      time_signature: resolvedTimeSig,
      inference_steps: options.inferenceStepsOverride ?? project.generationDefaults.inferenceSteps,
      guidance_scale: options.guidanceScaleOverride ?? project.generationDefaults.guidanceScale,
      shift: options.shiftOverride ?? project.generationDefaults.shift,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false, // lego is a pure DiT task — LM audio codes are out-of-distribution
      model: project.generationDefaults.model,
    } as LegoTaskParams;

    // Include negative prompt from generation form if present
    const negPrompt = useGenerationStore.getState().generationForm.negativePrompt;
    if (negPrompt?.trim()) {
      params.negative_prompt = negPrompt.trim();
    }

    // Always log critical generation params for debugging
    logger.info(
      `[generateClip] audio_duration=${audioDuration}`,
      `repainting=[${repaintStart.toFixed(2)}, ${repaintEnd.toFixed(2)}]`,
      `isChunk=${isChunkMode}`,
      `srcBlobSize=${srcAudioBlob.size}`,
      `chunk_mask_mode=${options.chunkMaskMode ?? 'unset'}`,
      `ctxOffset=${ctxOffset}`,
      `instruction=${instruction}`,
    );

    // Per-generation seed override from advanced params
    if (options.useRandomSeedOverride === false && options.seedOverride !== undefined) {
      params.seed = options.seedOverride;
      params.use_random_seed = false;
    } else if (options.useRandomSeedOverride === true) {
      params.use_random_seed = true;
    }

    const historyUpdatedAt = Date.now();
    genStore.upsertGenerationHistoryRecord({
      clipId,
      trackId: track.id,
      trackName: track.trackName,
      prompt: effectivePrompt,
      model: params.model ?? '',
      duration: clip.duration,
      status: 'queued',
      createdAt: historyUpdatedAt,
      updatedAt: historyUpdatedAt,
      startedAt: null,
      completedAt: null,
      taskId: undefined,
      audioKey: null,
      audioDuration: clip.duration,
      error: undefined,
    });

    // Shared seed: override backend randomness so all batch tracks are correlated
    if (options.sharedSeed !== undefined) {
      params.seed = options.sharedSeed;
      params.use_random_seed = false;
    }

    // Server-side path: skip blob upload and let the server read directly from disk
    if (options.srcAudioPath) {
      params.src_audio_path = options.srcAudioPath;
    }

    // Chunk mask mode: "auto" lets the model decide where each instrument starts/stops
    if (options.chunkMaskMode) {
      params.chunk_mask_mode = options.chunkMaskMode;
    }

    // Sample mode: send prompt as sample_query
    if (clip.sampleMode) {
      params.sample_mode = true;
      params.sample_query = clip.prompt;
    }

    // Auto-expand prompt: controls whether LM rewrites the caption via CoT
    if (clip.autoExpandPrompt === false) {
      params.use_cot_caption = false;
    }

    // Submit task
    const jobStartedAt = Date.now();
    {
      const currentJob = useGenerationStore.getState().jobs.find((job) => job.id === jobId);
      useGenerationStore.getState().updateJob(jobId, {
        status: 'generating',
        startedAt: jobStartedAt,
        ...deriveGenerationJobProgress(currentJob, {
          status: 'generating',
          progress: 'Submitting...',
          stage: 'Submitting request',
          now: jobStartedAt,
        }),
      });
    }
    useProjectStore.getState().updateClipStatus(clipId, 'generating');

    const releaseResp = await api.releaseLegoTask(srcAudioBlob, params);
    const taskId = releaseResp.task_id;
    useGenerationStore.getState().updateJob(jobId, { taskId });
    genStore.upsertGenerationHistoryRecord({
      clipId,
      trackId: track.id,
      trackName: track.trackName,
      prompt: effectivePrompt,
      model: params.model ?? '',
      duration: clip.duration,
      status: 'generating',
      createdAt: historyUpdatedAt,
      updatedAt: Date.now(),
      startedAt: jobStartedAt,
      taskId,
      audioKey: null,
      audioDuration: clip.duration,
    });
    updateVariationProgress({
      taskId,
      status: 'generating',
      progress: 'Generating...',
    });

    // Poll for completion
    const startTime = Date.now();
    let resultAudioPath: string | null = null;
    let firstResult: TaskResultItem | null = null;

    while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
      await sleep(POLL_INTERVAL_MS);

      const entries = await api.queryResult([taskId]);
      const entry = entries?.[0];
      if (!entry) continue;

      const { stage, progressPercent } = extractProgressMetadata(entry);
      const etaSeconds = computeEta(jobStartedAt, progressPercent ?? undefined) ?? undefined;

      {
        const currentJob = useGenerationStore.getState().jobs.find((job) => job.id === jobId);
        useGenerationStore.getState().updateJob(jobId, {
          ...deriveGenerationJobProgress(currentJob, {
            status: 'generating',
            progress: entry.progress_text || 'Generating...',
            stage,
            progressPercent,
          }),
        });
      }
      updateVariationProgress({
        status: 'generating',
        progress: entry.progress_text || 'Generating...',
        ...(stage !== null && { stage }),
        ...(progressPercent !== null && { progressPercent }),
        ...(etaSeconds !== undefined && { etaSeconds }),
      });

      if (entry.status === 1) {
        // Done — result is a JSON string containing an array of {file, ...}
        const resultItems: TaskResultItem[] = JSON.parse(entry.result);
        firstResult = resultItems?.[0] ?? null;
        resultAudioPath = firstResult?.file ?? null;
        break;
      } else if (entry.status === 2) {
        throw new Error(`Generation failed: ${entry.result}`);
      }
      // status 0 = still processing
    }

    if (!resultAudioPath) {
      throw new Error('Generation timed out — the server did not return a result within the time limit. Try again or check server status.');
    }

    // If the project-level global caption was blank, seed it from this generation
    if (effectiveGlobalCaption && !project.globalCaption) {
      useProjectStore.getState().updateProject({ globalCaption: effectiveGlobalCaption });
    }

    // Download audio
    {
      const currentJob = useGenerationStore.getState().jobs.find((job) => job.id === jobId);
      useGenerationStore.getState().updateJob(jobId, {
        status: 'processing',
        ...deriveGenerationJobProgress(currentJob, {
          status: 'processing',
          progress: 'Downloading audio...',
          stage: 'Downloading audio',
          progressPercent: 95,
        }),
      });
    }
    useProjectStore.getState().updateClipStatus(clipId, 'processing');
    updateVariationProgress({
      status: 'processing',
      progress: 'Downloading audio...',
    });

    const cumulativeBlob = await api.downloadAudio(resultAudioPath);
    logger.debug(`Downloaded cumulative audio: size=${cumulativeBlob.size}, type=${cumulativeBlob.type}, path=${resultAudioPath}`);

    // Store cumulative mix
    const cumulativeKey = await saveAudioBlob(project.id, clipId, 'cumulative', cumulativeBlob);

    // The backend output contains the isolated track in the generation region
    // (repainting_start to repainting_end) and the original context mix outside
    // it.  Since clipStart/clipDuration match the generation region, trimming to
    // the clip region extracts exactly the isolated track -- no wave subtraction
    // needed.
    // When a context window was used, the backend audio spans [0, ctxDuration]
    // and clip coordinates are relative to ctxStart. Trim using the same offset.
    const engine = getAudioEngine();
    const fullBuffer = await engine.decodeAudioData(cumulativeBlob);

    const currentClip = useProjectStore.getState().getClipById(clipId);
    const clipStart = currentClip?.startTime ?? clip.startTime;
    const clipDuration = currentClip?.duration ?? clip.duration;

    const sampleRate = fullBuffer.sampleRate;
    const startSample = Math.max(0, Math.round((clipStart - ctxOffset) * sampleRate));
    const endSample = Math.min(
      Math.round((clipStart - ctxOffset + clipDuration) * sampleRate),
      fullBuffer.length,
    );
    const trimmedLength = Math.max(1, endSample - startSample);
    const trimmedBuffer = engine.ctx.createBuffer(
      fullBuffer.numberOfChannels,
      trimmedLength,
      sampleRate,
    );
    for (let ch = 0; ch < fullBuffer.numberOfChannels; ch++) {
      const src = fullBuffer.getChannelData(ch);
      const dst = trimmedBuffer.getChannelData(ch);
      for (let i = 0; i < trimmedLength; i++) {
        dst[i] = startSample + i < src.length ? src[startSample + i] : 0;
      }
    }

    const isolatedBlob = audioBufferToWavBlob(trimmedBuffer);
    const isolatedKey = await saveAudioBlob(project.id, clipId, 'isolated', isolatedBlob);

    // Compute waveform peaks from the trimmed buffer (full buffer = clip region)
    const peaks = computeWaveformPeaks(trimmedBuffer, CLIP_WAVEFORM_PEAK_COUNT);

    // Build inferred metadata from result
    const inferredMetas: InferredMetas | undefined = firstResult
      ? {
          bpm: firstResult.metas?.bpm,
          keyScale: firstResult.metas?.keyscale,
          timeSignature: firstResult.metas?.timesignature,
          genres: firstResult.metas?.genres,
          seed: firstResult.seed_value,
          ditModel: firstResult.dit_model,
        }
      : undefined;

    // Update clip as ready
    useProjectStore.getState().updateClipStatus(clipId, 'ready', {
      cumulativeMixKey: cumulativeKey,
      isolatedAudioKey: isolatedKey,
      waveformPeaks: peaks,
      inferredMetas,
      audioDuration: clipDuration,
      audioOffset: 0,
      generatedFromContext: previousCumulativeBlob !== null || !!options.srcAudioPath,
      serverCumulativePath: extractServerPath(resultAudioPath) ?? undefined,
    });

    {
      const currentJob = useGenerationStore.getState().jobs.find((job) => job.id === jobId);
      useGenerationStore.getState().updateJob(jobId, {
        status: 'done',
        ...deriveGenerationJobProgress(currentJob, {
          status: 'done',
          progress: 'Done',
          stage: 'Complete',
          progressPercent: 100,
        }),
      });
    }
    updateVariationProgress({
      status: 'done',
      progress: 'Ready',
      resultAudioPath,
      seed: firstResult?.seed_value,
      completedAt: Date.now(),
    });
    genStore.upsertGenerationHistoryRecord({
      clipId,
      trackId: track.id,
      trackName: track.trackName,
      prompt: effectivePrompt,
      model: params.model ?? '',
      duration: clip.duration,
      status: 'done',
      createdAt: historyUpdatedAt,
      updatedAt: Date.now(),
      startedAt: jobStartedAt,
      completedAt: Date.now(),
      taskId,
      audioKey: isolatedKey,
      audioDuration: clipDuration,
      error: undefined,
    });

    return { cumulativeBlob, succeeded: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    useProjectStore.getState().updateClipStatus(clipId, 'error', { errorMessage: message });
    genStore.upsertGenerationHistoryRecord({
      clipId,
      trackId: track.id,
      trackName: track.trackName,
      prompt: clip.prompt ?? '',
      model: project.generationDefaults.model ?? '',
      duration: clip.duration,
      status: 'error',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      completedAt: Date.now(),
      audioKey: null,
      audioDuration: clip.duration,
      error: message,
    });
    {
      const currentJob = useGenerationStore.getState().jobs.find((job) => job.id === jobId);
      useGenerationStore.getState().updateJob(jobId, {
        status: 'error',
        ...deriveGenerationJobProgress(currentJob, {
          status: 'error',
          progress: message,
          stage: 'Generation failed',
          error: message,
        }),
      });
    }
    updateVariationProgress({
      status: 'error',
      progress: message,
      error: message,
      completedAt: Date.now(),
    });
    return { cumulativeBlob: previousCumulativeBlob, succeeded: false, errorMessage: message };
  }
}

export interface BatchTrackEntry {
  clipId: string;
  localDescription: string;
  /** Lyrics override for vocals/backing_vocals tracks */
  lyrics?: string;
}

function getNextVariationStartTime(trackId: string): number {
  const track = useProjectStore.getState().project?.tracks.find((candidate) => candidate.id === trackId);
  if (!track || track.clips.length === 0) return 0;
  return track.clips.reduce((maxEnd, clip) => Math.max(maxEnd, clip.startTime + clip.duration), 0);
}

function createVariationClipAtTime(params: VariationSessionParams, index: number, baseStartTime: number): string {
  const startTime = baseStartTime + (index * params.duration);
  const clip = useProjectStore.getState().addClip(params.trackId, {
    startTime,
    duration: params.duration,
    prompt: params.prompt,
    globalCaption: params.globalCaption ?? '',
    lyrics: params.lyrics ?? '',
    source: 'generated',
  });
  return clip.id;
}

async function runVariationClip(
  clipId: string,
  _index: number,
  _report: (updates: VariationProgressUpdate) => void,
): Promise<VariationGenerationResult> {
  const clip = useProjectStore.getState().getClipById(clipId);
  const resolvedCtx = clip ? resolveContextWindow(clip) : null;
  let previousCumulativeBlob: Blob | null;
  const clipOpts: ClipInternalOptions = {};
  if (resolvedCtx) {
    previousCumulativeBlob = await extractContextAudioLazy(resolvedCtx, { trimToContext: true });
    clipOpts.contextWindow = resolvedCtx;
    clipOpts.forceSilence = !previousCumulativeBlob;
  } else {
    previousCumulativeBlob = await getPreviousCumulativeBlob(clipId);
  }
  // Restore persisted chunkMaskMode
  if (clip?.generationParams?.chunkMaskMode) {
    clipOpts.chunkMaskMode = clip.generationParams.chunkMaskMode;
  }
  const outcome = await generateClipInternal(clipId, previousCumulativeBlob, clipOpts);
  return {
    succeeded: outcome.succeeded,
    errorMessage: outcome.errorMessage,
  };
}

function getVariationErrorMessage(errorMessage?: string) {
  return errorMessage?.trim() || 'Generation failed: retry this variation or adjust the prompt.';
}

function updateVariationIfCurrent(
  sessionId: string,
  index: number,
  updates: Partial<{
    clipId: string | null;
    status: VariationStatus;
    progress: string;
    error: string;
    startedAt: number;
    completedAt: number;
  }>,
) {
  const session = useGenerationStore.getState().variationSession;
  if (!session || session.id !== sessionId || session.status === 'cancelled') return;
  useGenerationStore.getState().updateVariation(index, updates);
}

export async function streamGenerationVariations(
  params: VariationSessionParams,
  dependencies: VariationGenerationDependencies = {},
): Promise<void> {
  if (!useGenerationStore.getState().tryAcquireGenerationLock()) return;

  if (!useGenerationStore.getState().variationSession) {
    useGenerationStore.getState().startVariationSession(params);
  }

  const session = useGenerationStore.getState().variationSession;
  if (!session) {
    useGenerationStore.getState().setIsGenerating(false);
    return;
  }

  const sessionId = session.id;
  const baseStartTime = getNextVariationStartTime(params.trackId);
  const createClip = dependencies.createVariationClip
    ?? ((request: VariationSessionParams, index: number) => createVariationClipAtTime(request, index, baseStartTime));
  const runClip = dependencies.runVariationClip ?? runVariationClip;
  const saveClipVersion = dependencies.saveVariationClipVersion
    ?? ((clipId: string) => useProjectStore.getState().saveClipVersion(clipId));

  try {
    await Promise.all(session.variations.map(async (variation) => {
      const clipId = createClip(params, variation.index);
      updateVariationIfCurrent(sessionId, variation.index, {
        clipId,
        status: 'generating',
        progress: 'Submitting...',
        error: undefined,
        startedAt: Date.now(),
        completedAt: undefined,
      });

      try {
        const result = await runClip(clipId, variation.index, (updates) => {
          updateVariationIfCurrent(sessionId, variation.index, {
            clipId,
            ...updates,
          });
        });

        if (result.succeeded) {
          saveClipVersion(clipId);
          updateVariationIfCurrent(sessionId, variation.index, {
            clipId,
            status: 'done',
            progress: 'Ready to review',
            error: undefined,
            completedAt: Date.now(),
          });
          return;
        }

        updateVariationIfCurrent(sessionId, variation.index, {
          clipId,
          status: 'error',
          progress: 'Variation failed',
          error: getVariationErrorMessage(result.errorMessage),
          completedAt: Date.now(),
        });
      } catch (error) {
        updateVariationIfCurrent(sessionId, variation.index, {
          clipId,
          status: 'error',
          progress: 'Variation failed',
          error: getVariationErrorMessage(error instanceof Error ? error.message : undefined),
          completedAt: Date.now(),
        });
      }
    }));
  } finally {
    useGenerationStore.getState().setIsGenerating(false);
  }
}

export interface GenerateBatchOptions {
  mode: 'silence' | 'context';
  /** Global song description — required for silence mode, ignored for context */
  globalCaption: string;
  /** Tracks to generate in this batch (order matters for context mode) */
  tracks: BatchTrackEntry[];
  /** Shared seed so all tracks in the batch are correlated */
  sharedSeed: number;
  /**
   * Context mode only. When set, the FIRST track in the batch uses this
   * server-side file path as its source audio instead of any previously
   * generated cumulative mix.  Subsequent tracks continue to use the
   * cumulative output of the preceding generation.
   */
  contextAudioPath?: string;
  /** Chunk mask mode. Default is "auto" (model decides where instruments start/stop). */
  chunkMaskMode?: 'explicit' | 'auto';
}

/**
 * Batch-generate one or more tracks with a shared seed.
 *
 * - silence: all tracks fire in parallel, each using silence as src_audio.
 * - context: tracks are generated sequentially; each builds on the previous cumulative mix.
 */
export async function generateBatch(options: GenerateBatchOptions): Promise<void> {
  const genStore = useGenerationStore.getState();
  if (!genStore.tryAcquireGenerationLock()) return;

  await withGenerationToast('AI generation', async () => {

    try {
      const { mode, globalCaption, tracks, sharedSeed, contextAudioPath, chunkMaskMode } = options;

      if (mode === 'silence') {
        const outcomes = await Promise.all(
          tracks.map(({ clipId, localDescription, lyrics }) =>
            generateClipInternal(clipId, null, {
              forceSilence: true,
              localDescription,
              globalCaptionOverride: globalCaption,
              sharedSeed,
              lyricsOverride: lyrics,
              chunkMaskMode,
            }),
          ),
        );
        const store = useProjectStore.getState();
        outcomes.forEach((outcome, index) => {
          if (outcome.succeeded) {
            store.saveClipVersion(tracks[index].clipId);
          }
        });
        return outcomes.every((outcome) => outcome.succeeded);
      }

      let previousCumulativeBlob: Blob | null = null;
      let allSucceeded = true;

      if (!contextAudioPath && tracks.length > 0) {
        previousCumulativeBlob = await getPreviousCumulativeBlob(tracks[0].clipId);
      }

      let firstCall = true;
      let prevClipId: string | null = null;
      for (const { clipId, localDescription, lyrics } of tracks) {
        const opts: ClipInternalOptions = {
          forceSilence: false,
          localDescription,
          sharedSeed,
          lyricsOverride: lyrics,
          chunkMaskMode,
        };
        if (firstCall && contextAudioPath) {
          opts.srcAudioPath = contextAudioPath;
        } else if (!firstCall && prevClipId) {
          const prevClip = useProjectStore.getState().getClipById(prevClipId);
          if (prevClip?.serverCumulativePath) {
            opts.srcAudioPath = prevClip.serverCumulativePath;
          }
        }
        firstCall = false;
        prevClipId = clipId;
        const outcome = await generateClipInternal(clipId, previousCumulativeBlob, opts);
        previousCumulativeBlob = outcome.cumulativeBlob;
        allSucceeded = allSucceeded && outcome.succeeded;
        if (outcome.succeeded) {
          useProjectStore.getState().saveClipVersion(clipId);
        }
      }

      return allSucceeded;
    } finally {
      useGenerationStore.getState().setIsGenerating(false);
    }
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// generateFromAddLayer — entry point for the unified "Add Layer" modal
// ─────────────────────────────────────────────────────────────────────────────

export interface AddLayerOptions {
  trackId: string;
  startTime: number;
  duration: number;
  localDescription: string;
  globalCaption: string;
  lyrics: string;
  /** When set, context audio will be extracted and used as src_audio. */
  contextWindow: { startTime: number; endTime: number } | null;
  /** Chunk mask mode for this single-track generation */
  chunkMaskMode?: 'explicit' | 'auto';
  /** When set, regenerate into this existing clip instead of creating a new one. */
  clipId?: string;
}

export async function generateFromAddLayer(opts: AddLayerOptions): Promise<void> {
  const genStore = useGenerationStore.getState();
  if (!genStore.tryAcquireGenerationLock()) return;

  await withGenerationToast('AI generation', async () => {

    try {
      const store = useProjectStore.getState();

      let clipId: string;

      // Convert absolute context window to relative offsets for persistence
      const clipStartTime = opts.startTime;
      const savedCtxWindow = opts.contextWindow ? {
        offsetStart: opts.contextWindow.startTime - clipStartTime,
        offsetEnd: opts.contextWindow.endTime - clipStartTime,
        trackIds: (opts.contextWindow as { trackIds?: string[] }).trackIds ?? [],
      } : null;

      if (opts.clipId) {
        // Edit mode: reuse existing clip, update its params
        clipId = opts.clipId;
        store.updateClip(clipId, {
          prompt: opts.localDescription,
          globalCaption: opts.globalCaption,
          lyrics: opts.lyrics,
          generationParams: {
            type: 'lego',
            prompt: opts.localDescription,
            lyrics: opts.lyrics,
            globalCaption: opts.globalCaption,
            contextWindow: savedCtxWindow,
            chunkMaskMode: opts.chunkMaskMode,
          },
        });
      } else {
        // New layer: create clip
        const clip = store.addClip(opts.trackId, {
          startTime: opts.startTime,
          duration: opts.duration,
          prompt: opts.localDescription,
          globalCaption: opts.globalCaption,
          lyrics: opts.lyrics,
        });
        clipId = clip.id;

        // Persist generation params for edit/regenerate
        store.updateClip(clipId, {
          generationParams: {
            type: 'lego',
            prompt: opts.localDescription,
            lyrics: opts.lyrics,
            globalCaption: opts.globalCaption,
            contextWindow: savedCtxWindow,
            chunkMaskMode: opts.chunkMaskMode,
          },
        });
      }

      if (opts.localDescription) {
        store.setTrackLocalCaption(opts.trackId, opts.localDescription);
      }

      let contextBlob: Blob | null = null;
      // The effective context window may be auto-padded below
      let effectiveCtxWindow = opts.contextWindow;

      if (effectiveCtxWindow && opts.chunkMaskMode !== 'auto') {
        // Auto-pad context window when repainting covers >= 95% of context duration.
        // The model expects some preserved context around the repainting region;
        // without padding, explicit mask = all 1s which is out-of-distribution.
        const ctxDur = effectiveCtxWindow.endTime - effectiveCtxWindow.startTime;
        const repaintDur = opts.duration;
        if (ctxDur > 0 && repaintDur / ctxDur >= 0.95) {
          const PAD_SECONDS = 1.0;
          const paddedStart = Math.max(0, effectiveCtxWindow.startTime - PAD_SECONDS);
          const audioDurationFull = useProjectStore.getState().getAudioDuration();
          const paddedEnd = Math.min(audioDurationFull, effectiveCtxWindow.endTime + PAD_SECONDS);
          // Only pad if it actually expands the window
          if (paddedEnd - paddedStart > ctxDur + 0.1) {
            toastInfo('Context window auto-padded to provide surrounding context for better generation quality');
            effectiveCtxWindow = {
              ...effectiveCtxWindow,
              startTime: paddedStart,
              endTime: paddedEnd,
            };
          }
        }
      }

      if (effectiveCtxWindow) {
        // trimToContext: blob spans [0, ctxDuration], no leading silence
        contextBlob = await extractContextAudioLazy(effectiveCtxWindow, { trimToContext: true });
        const ctxDur = effectiveCtxWindow.endTime - effectiveCtxWindow.startTime;
        logger.info(
          `[AddLayer] contextBlob: size=${contextBlob?.size ?? 0}`,
          `expectedDur=${ctxDur.toFixed(1)}s`,
          `ctx=[${effectiveCtxWindow.startTime}, ${effectiveCtxWindow.endTime}]`,
          `clipStart=${opts.startTime} clipDur=${opts.duration}`,
          `chunkMaskMode=${opts.chunkMaskMode}`,
        );
      } else {
        logger.info(`[AddLayer] NO contextWindow, forceSilence=true`);
      }

      const outcome = await generateClipInternal(clipId, contextBlob, {
        forceSilence: !contextBlob,
        localDescription: opts.localDescription,
        globalCaptionOverride: opts.globalCaption,
        lyricsOverride: opts.lyrics,
        chunkMaskMode: opts.chunkMaskMode,
        contextWindow: effectiveCtxWindow ?? undefined,
      });

      if (outcome.succeeded) {
        useProjectStore.getState().saveClipVersion(clipId);
      }

      return outcome.succeeded;
    } finally {
      useGenerationStore.getState().setIsGenerating(false);
    }
  });
}

function buildGenerationPanelPrompt(prompt: string, styleTags: string[]) {
  const trimmedPrompt = prompt.trim();
  const normalizedStyleTags = styleTags
    .map((tag) => tag.trim())
    .filter(Boolean);

  if (normalizedStyleTags.length === 0) {
    return trimmedPrompt;
  }

  return `${trimmedPrompt}\nStyle tags: ${normalizedStyleTags.join(', ')}`;
}

function getTrackInsertStartTime(trackId: string) {
  const project = useProjectStore.getState().project;
  if (!project) return 0;

  const targetTrack = project.tracks.find((track) => track.id === trackId);
  if (!targetTrack) return project.totalDuration;

  return targetTrack.clips.reduce((maxEnd, clip) => {
    return Math.max(maxEnd, clip.startTime + clip.duration);
  }, 0);
}

export async function generateFromGenerationPanel(request: GenerationPanelRequest): Promise<void> {
  const genStore = useGenerationStore.getState();
  const projectStore = useProjectStore.getState();
  const project = projectStore.project;

  if (!project || !genStore.tryAcquireGenerationLock()) return;

  const targetTrack = project.tracks.find((track) => track.id === request.trackId);
  if (!targetTrack) {
    genStore.setIsGenerating(false);
    throw new Error(`Track '${request.trackId}' not found.`);
  }
  if ((targetTrack.trackType ?? 'stems') !== 'stems') {
    genStore.setIsGenerating(false);
    throw new Error(`Track '${targetTrack.displayName}' does not support AI generation.`);
  }

  const prompt = buildGenerationPanelPrompt(request.prompt, request.styleTags);
  const lyrics = request.lyrics?.trim() ?? '';
  const insertStart = getTrackInsertStartTime(request.trackId);

  genStore.startVariationSession({
    prompt: request.prompt.trim(),
    trackId: request.trackId,
    variationCount: request.variationCount,
    bpm: request.bpm,
    keyScale: request.keyScale,
    duration: request.lengthSeconds,
    guidanceScale: request.temperature,
    temperature: request.temperature,
    styleTags: request.styleTags,
    lyrics: lyrics || undefined,
    globalCaption: project.globalCaption || undefined,
  });

  const normalizedParams = useGenerationStore.getState().variationSession?.params;
  const variationCount = normalizedParams?.variationCount ?? request.variationCount;
  const bpm = normalizedParams?.bpm ?? request.bpm;
  const keyScale = normalizedParams?.keyScale ?? request.keyScale;
  const lengthSeconds = normalizedParams?.duration ?? request.lengthSeconds;
  const temperature = normalizedParams?.temperature ?? normalizedParams?.guidanceScale ?? request.temperature;

  await withGenerationToast('AI generation', async () => {
    try {
      let allSucceeded = true;

      for (let variationIndex = 0; variationIndex < variationCount; variationIndex += 1) {
        const clipStartTime = insertStart + (variationIndex * lengthSeconds);
        const clip = projectStore.addClip(request.trackId, {
          startTime: clipStartTime,
          duration: lengthSeconds,
          prompt,
          globalCaption: project.globalCaption || '',
          lyrics,
          source: 'generated',
        });

        projectStore.updateClip(clip.id, {
          bpm,
          keyScale,
        });

        genStore.updateVariation(variationIndex, {
          clipId: clip.id,
          status: 'generating',
          progress: 'Submitting...',
          startedAt: Date.now(),
          error: undefined,
        });

        const outcome = await generateClipInternal(clip.id, null, {
          forceSilence: true,
          localDescription: prompt,
          globalCaptionOverride: project.globalCaption || '',
          lyricsOverride: lyrics || undefined,
          guidanceScaleOverride: temperature,
        });

        if (outcome.succeeded) {
          useProjectStore.getState().saveClipVersion(clip.id);
          genStore.updateVariation(variationIndex, {
            status: 'done',
            progress: 'Done',
            completedAt: Date.now(),
          });
          continue;
        }

        allSucceeded = false;
        genStore.updateVariation(variationIndex, {
          status: 'error',
          progress: outcome.errorMessage ?? 'Generation failed.',
          error: outcome.errorMessage ?? 'Generation failed.',
          completedAt: Date.now(),
        });
      }

      return allSucceeded;
    } finally {
      useGenerationStore.getState().setIsGenerating(false);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// generateFromMultiTrack — entry point for the MultiTrackGenerateModal
// ─────────────────────────────────────────────────────────────────────────────

export interface MultiTrackEntry {
  trackId: string;
  localDescription: string;
  lyrics: string;
}

export interface MultiTrackGenerateOptions {
  selectWindow: { startTime: number; endTime: number };
  contextWindow: { startTime: number; endTime: number } | null;
  globalCaption: string;
  tracks: MultiTrackEntry[];
  sharedSeed: number;
  chunkMaskMode: 'explicit' | 'auto';
}

export async function generateFromMultiTrack(opts: MultiTrackGenerateOptions): Promise<void> {
  const genStore = useGenerationStore.getState();
  if (!genStore.tryAcquireGenerationLock()) return;

  await withGenerationToast('AI generation', async () => {

    try {
      const store = useProjectStore.getState();

      let hasContextAudio = false;
      let contextBlob: Blob | null = null;
      if (opts.contextWindow) {
        // trimToContext: blob spans [0, ctxDuration], no leading silence
        contextBlob = await extractContextAudioLazy(opts.contextWindow, { trimToContext: true });
        hasContextAudio = contextBlob !== null && contextBlob.size > 44;
      }
      const mode = hasContextAudio ? 'context' : 'silence';

      const batchTracks: BatchTrackEntry[] = [];
      for (const entry of opts.tracks) {
        const clip = store.addClip(entry.trackId, {
          startTime: opts.selectWindow.startTime,
          duration: opts.selectWindow.endTime - opts.selectWindow.startTime,
          prompt: entry.localDescription,
          globalCaption: opts.globalCaption,
          lyrics: entry.lyrics,
        });
        if (entry.localDescription) {
          store.setTrackLocalCaption(entry.trackId, entry.localDescription);
        }
        batchTracks.push({
          clipId: clip.id,
          localDescription: entry.localDescription,
          lyrics: entry.lyrics,
        });
      }

      if (mode === 'silence') {
        const outcomes = await Promise.all(
          batchTracks.map(({ clipId, localDescription, lyrics }) =>
            generateClipInternal(clipId, null, {
              forceSilence: true,
              localDescription,
              globalCaptionOverride: opts.globalCaption,
              sharedSeed: opts.sharedSeed,
              lyricsOverride: lyrics,
              chunkMaskMode: opts.chunkMaskMode,
            }),
          ),
        );
        const st = useProjectStore.getState();
        outcomes.forEach((outcome, index) => {
          if (outcome.succeeded) {
            st.saveClipVersion(batchTracks[index].clipId);
          }
        });
        return outcomes.every((outcome) => outcome.succeeded);
      }

      let previousCumulativeBlob = contextBlob;
      let prevClipId: string | null = null;
      let allSucceeded = true;
      for (const { clipId, localDescription, lyrics } of batchTracks) {
        const clipOpts: ClipInternalOptions = {
          forceSilence: false,
          localDescription,
          sharedSeed: opts.sharedSeed,
          lyricsOverride: lyrics,
          chunkMaskMode: opts.chunkMaskMode,
          contextWindow: opts.contextWindow ?? undefined,
        };
        if (prevClipId) {
          const prevClip = useProjectStore.getState().getClipById(prevClipId);
          if (prevClip?.serverCumulativePath) {
            clipOpts.srcAudioPath = prevClip.serverCumulativePath;
          }
        }
        prevClipId = clipId;
        const outcome = await generateClipInternal(clipId, previousCumulativeBlob, clipOpts);
        previousCumulativeBlob = outcome.cumulativeBlob;
        allSucceeded = allSucceeded && outcome.succeeded;
        if (outcome.succeeded) {
          useProjectStore.getState().saveClipVersion(clipId);
        }
      }

      return allSucceeded;
    } finally {
      useGenerationStore.getState().setIsGenerating(false);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// generateCoverClip — transforms an existing clip's audio into a new style
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateCoverOptions {
  /** Source clip whose audio will be transformed */
  clipId: string;
  caption: string;
  lyrics: string;
  /** 0.0–1.0: how much the result deviates from the source audio */
  coverStrength: number;
  /** true = add a new clip on the same track; false = replace the source clip */
  createNew: boolean;
  /** Optional IDB audio key to use as source instead of the clip's own audio (for iterative chaining) */
  sourceAudioOverride?: string;
}

export async function generateCoverClip(opts: GenerateCoverOptions): Promise<string | undefined> {
  const genStore = useGenerationStore.getState();
  if (!genStore.tryAcquireGenerationLock()) return undefined;
  let resolvedTargetClipId: string | undefined;
  await withGenerationToast('AI generation', async () => {
    const { clipId, caption, lyrics, coverStrength, createNew, sourceAudioOverride } = opts;
    const store = useProjectStore.getState();

    const sourceClip = store.getClipById(clipId);
    const sourceTrack = store.getTrackForClip(clipId);
    if (!sourceClip || !sourceTrack) {
      genStore.setIsGenerating(false);
      return false;
    }

    let sourceAudioBlob: Blob | null = null;
    // Use override audio (from iterative chaining) if provided
    if (sourceAudioOverride) {
      sourceAudioBlob = (await loadAudioBlobByKey(sourceAudioOverride)) ?? null;
      if (!sourceAudioBlob) {
        logger.warn(`[EnhancePipeline] Chained source audio key "${sourceAudioOverride}" not found in storage, falling back to clip audio`);
      }
    }
    if (!sourceAudioBlob && sourceClip.isolatedAudioKey) {
      sourceAudioBlob = (await loadAudioBlobByKey(sourceClip.isolatedAudioKey)) ?? null;
    }
    if (!sourceAudioBlob && sourceClip.cumulativeMixKey) {
      sourceAudioBlob = (await loadAudioBlobByKey(sourceClip.cumulativeMixKey)) ?? null;
    }
    if (!sourceAudioBlob) {
      genStore.setIsGenerating(false);
      return false;
    }

    const project = store.project!;

    let targetClipId: string;
    if (createNew) {
      const newClip = store.addClip(sourceTrack.id, {
        startTime: sourceClip.startTime,
        duration: sourceClip.duration,
        prompt: caption,
        globalCaption: caption,
        lyrics,
      });
      targetClipId = newClip.id;
    } else {
      store.saveClipVersion(clipId);
      targetClipId = clipId;
    }
    resolvedTargetClipId = targetClipId;

    const jobId = uuidv4();
    genStore.addJob({
      id: jobId,
      clipId: targetClipId,
      trackName: sourceTrack.trackName,
      status: 'queued',
      progress: 'Queued',
    });
    store.updateClipStatus(targetClipId, 'queued', { generationJobId: jobId });

    try {
      const coverParams: CoverTaskParams = {
        task_type: 'cover',
        caption,
        lyrics,
        audio_cover_strength: coverStrength,
        audio_duration: sourceClip.duration,
        inference_steps: project.generationDefaults.inferenceSteps,
        guidance_scale: project.generationDefaults.guidanceScale,
        shift: project.generationDefaults.shift,
        batch_size: 1,
        audio_format: 'wav',
        thinking: project.generationDefaults.thinking,
        model: project.generationDefaults.model,
      };

      const coverStartedAt = Date.now();
      genStore.updateJob(jobId, { status: 'generating', progress: 'Submitting...', startedAt: coverStartedAt });
      store.updateClipStatus(targetClipId, 'generating');

      const releaseResp = await api.releaseLegoTask(sourceAudioBlob, coverParams);
      const taskId = releaseResp.task_id;

      const startTime = Date.now();
      let resultAudioPath: string | null = null;

      while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
        await sleep(POLL_INTERVAL_MS);
        const entries = await api.queryResult([taskId]);
        const entry = entries?.[0];
        if (!entry) continue;

        let progressPercent: number | undefined;
        let stage: string | undefined;
        if (entry.status === 0 && entry.result) {
          try {
            const partial: TaskResultItem[] = JSON.parse(entry.result);
            const first = partial?.[0];
            if (first?.progress !== undefined) progressPercent = first.progress;
            if (first?.stage) stage = first.stage;
          } catch { /* not yet valid JSON */ }
        }
        const etaSeconds = computeEta(coverStartedAt, progressPercent) ?? undefined;

        genStore.updateJob(jobId, {
          progress: entry.progress_text || 'Generating...',
          ...(stage !== undefined && { stage }),
          ...(progressPercent !== undefined && { progressPercent }),
          ...(etaSeconds !== undefined && { etaSeconds }),
        });
        if (entry.status === 1) {
          const items: TaskResultItem[] = JSON.parse(entry.result);
          resultAudioPath = items?.[0]?.file ?? null;
          break;
        } else if (entry.status === 2) {
          throw new Error(`Cover generation failed: ${entry.result}`);
        }
      }

      if (!resultAudioPath) throw new Error('Cover generation timed out — the server did not return a result within the time limit. Try again or check server status.');

      genStore.updateJob(jobId, { status: 'processing', progress: 'Downloading audio...' });
      store.updateClipStatus(targetClipId, 'processing');

      const coverBlob = await api.downloadAudio(resultAudioPath);
      const engine = getAudioEngine();
      const buffer = await engine.decodeAudioData(coverBlob);
      const peaks = computeWaveformPeaks(buffer, CLIP_WAVEFORM_PEAK_COUNT);

      const isolatedKey = await saveAudioBlob(project.id, targetClipId, 'isolated', coverBlob);
      const cumulativeKey = await saveAudioBlob(project.id, targetClipId, 'cumulative', coverBlob);

      store.updateClipStatus(targetClipId, 'ready', {
        cumulativeMixKey: cumulativeKey,
        isolatedAudioKey: isolatedKey,
        waveformPeaks: peaks,
        audioDuration: buffer.duration,
        audioOffset: 0,
        generatedFromContext: false,
      });

      genStore.updateJob(jobId, { status: 'done', progress: 'Done' });
      store.saveClipVersion(targetClipId);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      store.updateClipStatus(targetClipId, 'error', { errorMessage: message });
      genStore.updateJob(jobId, { status: 'error', progress: message, error: message });
      return false;
    } finally {
      genStore.setIsGenerating(false);
    }
  });
  return resolvedTargetClipId;
}

// ─────────────────────────────────────────────────────────────────────────────
// generateRepaintInternal — sends task_type='repaint' with proper instruction
// ─────────────────────────────────────────────────────────────────────────────

async function generateRepaintInternal(
  clipId: string,
  srcAudioBlob: Blob,
  repaintStart: number,
  repaintEnd: number,
  prompt: string,
  globalCaption: string,
  repaintMode: RepaintMode = 'balanced',
  repaintStrength: number = 0.5,
): Promise<GenerationOutcome> {
  const store = useProjectStore.getState();
  const genStore = useGenerationStore.getState();
  const project = store.project;
  if (!project) return { cumulativeBlob: null, succeeded: false, errorMessage: 'No project' };

  const clip = store.getClipById(clipId);
  const track = store.getTrackForClip(clipId);
  if (!clip || !track) {
    return { cumulativeBlob: null, succeeded: false, errorMessage: 'Clip or track not found' };
  }

  const jobId = uuidv4();
  genStore.addJob({
    id: jobId,
    clipId,
    trackName: track.trackName,
    status: 'queued',
    progress: 'Queued',
    stage: 'Queued',
    progressPercent: null,
    etaSeconds: null,
    etaConfidence: 'none',
  });
  store.updateClipStatus(clipId, 'queued', { generationJobId: jobId });

  try {
    const audioDuration = useProjectStore.getState().getAudioDuration();

    const params: RepaintTaskParams = {
      task_type: 'repaint',
      prompt,
      global_caption: globalCaption,
      lyrics: clip.lyrics || '',
      instruction: 'Repaint the mask area based on the given conditions:',
      repainting_start: repaintStart,
      repainting_end: repaintEnd,
      audio_duration: audioDuration,
      inference_steps: project.generationDefaults.inferenceSteps,
      guidance_scale: project.generationDefaults.guidanceScale,
      shift: project.generationDefaults.shift,
      batch_size: 1,
      audio_format: 'wav',
      thinking: project.generationDefaults.thinking,
      model: project.generationDefaults.model,
      repaint_mode: repaintMode,
      repaint_strength: repaintStrength,
    };

    const jobStartedAt = Date.now();
    {
      const currentJob = genStore.jobs.find((job) => job.id === jobId);
      genStore.updateJob(jobId, {
        status: 'generating',
        startedAt: jobStartedAt,
        ...deriveGenerationJobProgress(currentJob, {
          status: 'generating',
          progress: 'Submitting...',
          stage: 'Submitting request',
          now: jobStartedAt,
        }),
      });
    }
    store.updateClipStatus(clipId, 'generating');

    const releaseResp = await api.releaseLegoTask(srcAudioBlob, params);
    const taskId = releaseResp.task_id;
    genStore.updateJob(jobId, { taskId });

    const startTime = Date.now();
    let resultAudioPath: string | null = null;
    let firstResult: TaskResultItem | null = null;

    while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
      await sleep(POLL_INTERVAL_MS);

      const entries = await api.queryResult([taskId]);
      const entry = entries?.[0];
      if (!entry) continue;

      const { stage, progressPercent } = extractProgressMetadata(entry);
      const etaSeconds = computeEta(jobStartedAt, progressPercent ?? undefined) ?? undefined;

      {
        const currentJob = useGenerationStore.getState().jobs.find((job) => job.id === jobId);
        useGenerationStore.getState().updateJob(jobId, {
          ...deriveGenerationJobProgress(currentJob, {
            status: 'generating',
            progress: entry.progress_text || 'Repainting...',
            stage,
            progressPercent,
          }),
        });
      }

      if (entry.status === 1) {
        const resultItems: TaskResultItem[] = JSON.parse(entry.result);
        firstResult = resultItems?.[0] ?? null;
        resultAudioPath = firstResult?.file ?? null;
        break;
      } else if (entry.status === 2) {
        throw new Error(`Repaint failed: ${entry.result}`);
      }
    }

    if (!resultAudioPath) {
      throw new Error('Repaint timed out — the server did not return a result within the time limit.');
    }

    {
      const currentJob = useGenerationStore.getState().jobs.find((job) => job.id === jobId);
      useGenerationStore.getState().updateJob(jobId, {
        status: 'processing',
        ...deriveGenerationJobProgress(currentJob, {
          status: 'processing',
          progress: 'Downloading audio...',
          stage: 'Downloading audio',
          progressPercent: 95,
        }),
      });
    }
    useProjectStore.getState().updateClipStatus(clipId, 'processing');

    const cumulativeBlob = await api.downloadAudio(resultAudioPath);
    logger.debug(`Downloaded repaint audio: size=${cumulativeBlob.size}, path=${resultAudioPath}`);

    const cumulativeKey = await saveAudioBlob(project.id, clipId, 'cumulative', cumulativeBlob);

    const engine = getAudioEngine();
    const fullBuffer = await engine.decodeAudioData(cumulativeBlob);

    const currentClip = useProjectStore.getState().getClipById(clipId);
    const clipStart = currentClip?.startTime ?? clip.startTime;
    const clipDuration = currentClip?.duration ?? clip.duration;

    const sampleRate = fullBuffer.sampleRate;
    const startSample = Math.max(0, Math.round(clipStart * sampleRate));
    const endSample = Math.min(
      Math.round((clipStart + clipDuration) * sampleRate),
      fullBuffer.length,
    );
    const trimmedLength = Math.max(1, endSample - startSample);
    const trimmedBuffer = engine.ctx.createBuffer(
      fullBuffer.numberOfChannels,
      trimmedLength,
      sampleRate,
    );
    for (let ch = 0; ch < fullBuffer.numberOfChannels; ch++) {
      const src = fullBuffer.getChannelData(ch);
      const dst = trimmedBuffer.getChannelData(ch);
      for (let i = 0; i < trimmedLength; i++) {
        dst[i] = startSample + i < src.length ? src[startSample + i] : 0;
      }
    }

    const isolatedBlob = audioBufferToWavBlob(trimmedBuffer);
    const isolatedKey = await saveAudioBlob(project.id, clipId, 'isolated', isolatedBlob);
    const peaks = computeWaveformPeaks(trimmedBuffer, CLIP_WAVEFORM_PEAK_COUNT);

    const inferredMetas: InferredMetas | undefined = firstResult
      ? {
          bpm: firstResult.metas?.bpm,
          keyScale: firstResult.metas?.keyscale,
          timeSignature: firstResult.metas?.timesignature,
          genres: firstResult.metas?.genres,
          seed: firstResult.seed_value,
          ditModel: firstResult.dit_model,
        }
      : undefined;

    useProjectStore.getState().updateClipStatus(clipId, 'ready', {
      cumulativeMixKey: cumulativeKey,
      isolatedAudioKey: isolatedKey,
      waveformPeaks: peaks,
      inferredMetas,
      audioDuration: clipDuration,
      audioOffset: 0,
      generatedFromContext: true,
      serverCumulativePath: extractServerPath(resultAudioPath) ?? undefined,
    });

    {
      const currentJob = useGenerationStore.getState().jobs.find((job) => job.id === jobId);
      useGenerationStore.getState().updateJob(jobId, {
        status: 'done',
        ...deriveGenerationJobProgress(currentJob, {
          status: 'done',
          progress: 'Done',
          stage: 'Complete',
          progressPercent: 100,
        }),
      });
    }

    return { cumulativeBlob, succeeded: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    useProjectStore.getState().updateClipStatus(clipId, 'error', { errorMessage: message });
    {
      const currentJob = useGenerationStore.getState().jobs.find((job) => job.id === jobId);
      useGenerationStore.getState().updateJob(jobId, {
        status: 'error',
        ...deriveGenerationJobProgress(currentJob, {
          status: 'error',
          progress: message,
          stage: 'Repaint failed',
          error: message,
        }),
      });
    }
    return { cumulativeBlob: null, succeeded: false, errorMessage: message };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// generateRepaintClip — regenerates a selected sub-range of an existing clip
// ─────────────────────────────────────────────────────────────────────────────

export interface GenerateRepaintOptions {
  clipId: string;
  repaintStart: number;
  repaintEnd: number;
  prompt: string;
  globalCaption?: string;
  repaintMode?: RepaintMode;
  repaintStrength?: number;
  /** Optional IDB audio key to use as source instead of the clip's own audio (for iterative chaining) */
  sourceAudioOverride?: string;
}

export async function generateRepaintClip(opts: GenerateRepaintOptions): Promise<string | undefined> {
  const genStore = useGenerationStore.getState();
  if (!genStore.tryAcquireGenerationLock()) return undefined;
  let resolvedTargetClipId: string | undefined;
  await withGenerationToast('AI generation', async () => {
    try {
      const store = useProjectStore.getState();
      const clip = store.getClipById(opts.clipId);
      if (!clip) return false;

      store.saveClipVersion(opts.clipId);
      resolvedTargetClipId = opts.clipId;

      let srcBlob: Blob | null = null;
      // Use override audio (from iterative chaining) if provided
      if (opts.sourceAudioOverride) {
        srcBlob = (await loadAudioBlobByKey(opts.sourceAudioOverride)) ?? null;
        if (!srcBlob) {
          logger.warn(`[EnhancePipeline] Chained source audio key "${opts.sourceAudioOverride}" not found in storage, falling back to clip audio`);
        }
      }
      if (!srcBlob && clip.cumulativeMixKey) {
        srcBlob = (await loadAudioBlobByKey(clip.cumulativeMixKey)) ?? null;
      }
      if (!srcBlob) {
        const audioDuration = store.getAudioDuration();
        srcBlob = generateSilenceWav(audioDuration);
      }

      const globalCaption = opts.globalCaption || store.project?.globalCaption || '';

      const outcome = await generateRepaintInternal(
        opts.clipId,
        srcBlob,
        opts.repaintStart,
        opts.repaintEnd,
        opts.prompt,
        globalCaption,
        opts.repaintMode ?? 'balanced',
        opts.repaintStrength ?? 0.5,
      );

      if (outcome.succeeded) {
        store.saveClipVersion(opts.clipId);
      }

      return outcome.succeeded;
    } finally {
      genStore.setIsGenerating(false);
    }
  });
  return resolvedTargetClipId;
}

// ─────────────────────────────────────────────────────────────────────────────
// regenerateTimelineRegion — regenerates clips within a selected timeline region
// ─────────────────────────────────────────────────────────────────────────────

export interface RegionRegenerateOptions {
  /** Start time of the region in seconds */
  startTime: number;
  /** End time of the region in seconds */
  endTime: number;
  /** Track IDs to regenerate within the region */
  trackIds: string[];
  /** Prompt describing the desired result */
  prompt: string;
  /** Optional global song description override */
  globalCaption?: string;
  repaintMode?: RepaintMode;
  repaintStrength?: number;
}

/**
 * Regenerate all clips that overlap the specified timeline region.
 * Each affected clip is repainted for the intersection of its bounds with the
 * selection region. Original audio is preserved as a version entry.
 */
export async function regenerateTimelineRegion(opts: RegionRegenerateOptions): Promise<void> {
  const genStore = useGenerationStore.getState();
  if (!genStore.tryAcquireGenerationLock()) return;

  await withGenerationToast('AI region regeneration', async () => {

    try {
      const store = useProjectStore.getState();
      const project = store.project;
      if (!project) return false;

      const trackIdSet = new Set(opts.trackIds);
      const affectedClips: Array<{ clipId: string; repaintStart: number; repaintEnd: number }> = [];

      for (const track of project.tracks) {
        if (!trackIdSet.has(track.id)) continue;
        for (const clip of track.clips) {
          const clipEnd = clip.startTime + clip.duration;
          const overlapStart = Math.max(opts.startTime, clip.startTime);
          const overlapEnd = Math.min(opts.endTime, clipEnd);
          if (overlapEnd > overlapStart && clip.generationStatus === 'ready') {
            affectedClips.push({
              clipId: clip.id,
              repaintStart: overlapStart,
              repaintEnd: overlapEnd,
            });
          }
        }
      }

      if (affectedClips.length === 0) return false;

      const globalCaption = opts.globalCaption || project.globalCaption || '';

      let allSucceeded = true;
      for (const { clipId, repaintStart, repaintEnd } of affectedClips) {
        const clip = store.getClipById(clipId);
        if (!clip) continue;

        store.saveClipVersion(clipId);

        let srcBlob: Blob | null = null;
        if (clip.cumulativeMixKey) {
          srcBlob = (await loadAudioBlobByKey(clip.cumulativeMixKey)) ?? null;
        }
        if (!srcBlob) {
          const audioDuration = store.getAudioDuration();
          srcBlob = generateSilenceWav(audioDuration);
        }

        const outcome = await generateRepaintInternal(
          clipId,
          srcBlob,
          repaintStart,
          repaintEnd,
          opts.prompt,
          globalCaption,
          opts.repaintMode ?? 'balanced',
          opts.repaintStrength ?? 0.5,
        );

        allSucceeded = allSucceeded && outcome.succeeded;
        if (outcome.succeeded) {
          useProjectStore.getState().saveClipVersion(clipId);
        }
      }

      return allSucceeded;
    } finally {
      useGenerationStore.getState().setIsGenerating(false);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// generateVocal2BGM — generates accompaniment from a vocal reference clip
// ─────────────────────────────────────────────────────────────────────────────

export interface Vocal2BGMOptions {
  /** Source vocal clip whose audio is sent as reference */
  clipId: string;
  /** Style/genre description for the accompaniment */
  caption: string;
  /** Target instrument track for the BGM result */
  targetTrackId: string;
  /** Optional BPM override (null = auto-detect) */
  bpm: number | null;
  /** Optional key override ('' = auto-detect) */
  keyScale: string;
}

export async function generateVocal2BGM(opts: Vocal2BGMOptions): Promise<void> {
  const genStore = useGenerationStore.getState();
  if (!genStore.tryAcquireGenerationLock()) return;
  await withGenerationToast('AI generation', async () => {

    const { clipId, caption, targetTrackId } = opts;
    const store = useProjectStore.getState();

    const sourceClip = store.getClipById(clipId);
    const sourceTrack = store.getTrackForClip(clipId);
    if (!sourceClip || !sourceTrack) {
      genStore.setIsGenerating(false);
      return false;
    }

    let vocalBlob: Blob | null = null;
    if (sourceClip.isolatedAudioKey) {
      vocalBlob = (await loadAudioBlobByKey(sourceClip.isolatedAudioKey)) ?? null;
    }
    if (!vocalBlob && sourceClip.cumulativeMixKey) {
      vocalBlob = (await loadAudioBlobByKey(sourceClip.cumulativeMixKey)) ?? null;
    }
    if (!vocalBlob) {
      genStore.setIsGenerating(false);
      return false;
    }

    const project = store.project!;
    const targetTrack = project.tracks.find((t) => t.id === targetTrackId);
    if (!targetTrack) {
      genStore.setIsGenerating(false);
      return false;
    }

    const newClip = store.addClip(targetTrackId, {
      startTime: sourceClip.startTime,
      duration: sourceClip.duration,
      prompt: caption,
      globalCaption: caption,
      lyrics: '',
    });

    const jobId = uuidv4();
    genStore.addJob({
      id: jobId,
      clipId: newClip.id,
      trackName: targetTrack.trackName,
      status: 'queued',
      progress: 'Queued',
    });
    store.updateClipStatus(newClip.id, 'queued', { generationJobId: jobId });

    try {
      const coverParams: CoverTaskParams = {
        task_type: 'cover',
        caption: `accompaniment for vocals: ${caption}`,
        lyrics: '',
        audio_cover_strength: 0.8,
        audio_duration: sourceClip.duration,
        inference_steps: project.generationDefaults.inferenceSteps,
        guidance_scale: project.generationDefaults.guidanceScale,
        shift: project.generationDefaults.shift,
        batch_size: 1,
        audio_format: 'wav',
        thinking: project.generationDefaults.thinking,
        model: project.generationDefaults.model,
      };

      const v2bStartedAt = Date.now();
      genStore.updateJob(jobId, { status: 'generating', progress: 'Submitting...', startedAt: v2bStartedAt });
      store.updateClipStatus(newClip.id, 'generating');

      const releaseResp = await api.releaseLegoTask(vocalBlob, coverParams);
      const taskId = releaseResp.task_id;

      const startTime = Date.now();
      let resultAudioPath: string | null = null;
      let firstResult: TaskResultItem | null = null;

      while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
        await sleep(POLL_INTERVAL_MS);
        const entries = await api.queryResult([taskId]);
        const entry = entries?.[0];
        if (!entry) continue;

        let progressPercent: number | undefined;
        let stage: string | undefined;
        if (entry.status === 0 && entry.result) {
          try {
            const partial: TaskResultItem[] = JSON.parse(entry.result);
            const first = partial?.[0];
            if (first?.progress !== undefined) progressPercent = first.progress;
            if (first?.stage) stage = first.stage;
          } catch { /* not yet valid JSON */ }
        }
        const etaSeconds = computeEta(v2bStartedAt, progressPercent) ?? undefined;

        genStore.updateJob(jobId, {
          progress: entry.progress_text || 'Generating accompaniment...',
          ...(stage !== undefined && { stage }),
          ...(progressPercent !== undefined && { progressPercent }),
          ...(etaSeconds !== undefined && { etaSeconds }),
        });
        if (entry.status === 1) {
          const items: TaskResultItem[] = JSON.parse(entry.result);
          firstResult = items?.[0] ?? null;
          resultAudioPath = firstResult?.file ?? null;
          break;
        } else if (entry.status === 2) {
          throw new Error(`Vocal2BGM generation failed: ${entry.result}`);
        }
      }

      if (!resultAudioPath) throw new Error('Vocal2BGM generation timed out — the server did not return a result within the time limit. Try again or check server status.');

      genStore.updateJob(jobId, { status: 'processing', progress: 'Downloading audio...' });
      store.updateClipStatus(newClip.id, 'processing');

      const bgmBlob = await api.downloadAudio(resultAudioPath);
      const engine = getAudioEngine();
      const buffer = await engine.decodeAudioData(bgmBlob);
      const peaks = computeWaveformPeaks(buffer, CLIP_WAVEFORM_PEAK_COUNT);

      const isolatedKey = await saveAudioBlob(project.id, newClip.id, 'isolated', bgmBlob);
      const cumulativeKey = await saveAudioBlob(project.id, newClip.id, 'cumulative', bgmBlob);

      const inferredMetas: InferredMetas | undefined = firstResult
        ? {
            bpm: firstResult.metas?.bpm,
            keyScale: firstResult.metas?.keyscale,
            genres: firstResult.metas?.genres,
            seed: firstResult.seed_value,
            ditModel: firstResult.dit_model,
          }
        : undefined;

      store.updateClipStatus(newClip.id, 'ready', {
        cumulativeMixKey: cumulativeKey,
        isolatedAudioKey: isolatedKey,
        waveformPeaks: peaks,
        audioDuration: buffer.duration,
        audioOffset: 0,
        inferredMetas,
        generatedFromContext: true,
      });

      genStore.updateJob(jobId, { status: 'done', progress: 'Done' });
      store.saveClipVersion(newClip.id);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      store.updateClipStatus(newClip.id, 'error', { errorMessage: message });
      genStore.updateJob(jobId, { status: 'error', progress: message, error: message });
      return false;
    } finally {
      genStore.setIsGenerating(false);
    }
  });
}

// generateVocalReplacement — generates vocals from an instrumental reference clip
// ─────────────────────────────────────────────────────────────────────────────

export interface VocalReplacementOptions {
  /** Source instrumental clip whose audio is used as context */
  clipId: string;
  /** Vocal style description (e.g., "warm, soulful, energetic") */
  vocalStyle: string;
  /** Lyrics for the generated vocals */
  lyrics: string;
  /** Target vocal track ID for the result (must be a vocals track) */
  targetTrackId: string;
  /** Optional BPM override (null = auto-detect) */
  bpm: number | null;
  /** Optional key override ('' = auto-detect) */
  keyScale: string;
  /** Vocal language hint (e.g., "en", "zh", "unknown") */
  vocalLanguage?: string;
}

export async function generateVocalReplacement(opts: VocalReplacementOptions): Promise<void> {
  const genStore = useGenerationStore.getState();
  if (!genStore.tryAcquireGenerationLock()) return;
  await withGenerationToast('AI generation', async () => {

    const { clipId, vocalStyle, lyrics, targetTrackId } = opts;
    const store = useProjectStore.getState();

    const sourceClip = store.getClipById(clipId);
    const sourceTrack = store.getTrackForClip(clipId);
    if (!sourceClip || !sourceTrack) {
      genStore.setIsGenerating(false);
      return false;
    }

    // Load the instrumental audio as context
    let instrumentalBlob: Blob | null = null;
    if (sourceClip.isolatedAudioKey) {
      instrumentalBlob = (await loadAudioBlobByKey(sourceClip.isolatedAudioKey)) ?? null;
    }
    if (!instrumentalBlob && sourceClip.cumulativeMixKey) {
      instrumentalBlob = (await loadAudioBlobByKey(sourceClip.cumulativeMixKey)) ?? null;
    }
    if (!instrumentalBlob) {
      genStore.setIsGenerating(false);
      return false;
    }

    const project = store.project!;
    const targetTrack = project.tracks.find((t) => t.id === targetTrackId);
    if (!targetTrack) {
      genStore.setIsGenerating(false);
      return false;
    }

    // Create new clip on the vocal track
    const newClip = store.addClip(targetTrackId, {
      startTime: sourceClip.startTime,
      duration: sourceClip.duration,
      prompt: vocalStyle,
      globalCaption: vocalStyle,
      lyrics,
    });

    const jobId = uuidv4();
    genStore.addJob({
      id: jobId,
      clipId: newClip.id,
      trackName: targetTrack.trackName,
      status: 'queued',
      progress: 'Queued',
    });
    store.updateClipStatus(newClip.id, 'queued', { generationJobId: jobId });

    try {
      // Use lego task with track_name='vocals' so the backend applies vocal conditioning
      const legoParams: LegoTaskParams = {
        task_type: 'lego',
        track_name: 'vocals',
        prompt: vocalStyle,
        global_caption: `vocals for: ${vocalStyle}`,
        lyrics,
        instruction: 'Generate a vocal track that matches the instrumental audio context:',
        repainting_start: 0,
        repainting_end: sourceClip.duration,
        audio_duration: sourceClip.duration,
        bpm: opts.bpm,
        key_scale: opts.keyScale,
        time_signature: project.timeSignature ? String(project.timeSignature) : '',
        inference_steps: project.generationDefaults.inferenceSteps,
        guidance_scale: project.generationDefaults.guidanceScale,
        shift: project.generationDefaults.shift,
        batch_size: 1,
        audio_format: 'wav',
        thinking: project.generationDefaults.thinking,
        model: project.generationDefaults.model,
        ...(opts.vocalLanguage ? { vocal_language: opts.vocalLanguage } : {}),
      };

      const vrStartedAt = Date.now();
      genStore.updateJob(jobId, { status: 'generating', progress: 'Submitting...', startedAt: vrStartedAt });
      store.updateClipStatus(newClip.id, 'generating');

      const releaseResp = await api.releaseLegoTask(instrumentalBlob, legoParams);
      const taskId = releaseResp.task_id;

      const startTime = Date.now();
      let resultAudioPath: string | null = null;
      let firstResult: TaskResultItem | null = null;

      while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
        await sleep(POLL_INTERVAL_MS);
        const entries = await api.queryResult([taskId]);
        const entry = entries?.[0];
        if (!entry) continue;

        let progressPercent: number | undefined;
        let stage: string | undefined;
        if (entry.status === 0 && entry.result) {
          try {
            const partial: TaskResultItem[] = JSON.parse(entry.result);
            const first = partial?.[0];
            if (first?.progress !== undefined) progressPercent = first.progress;
            if (first?.stage) stage = first.stage;
          } catch { /* not yet valid JSON */ }
        }
        const etaSeconds = computeEta(vrStartedAt, progressPercent) ?? undefined;

        genStore.updateJob(jobId, {
          progress: entry.progress_text || 'Generating vocals...',
          ...(stage !== undefined && { stage }),
          ...(progressPercent !== undefined && { progressPercent }),
          ...(etaSeconds !== undefined && { etaSeconds }),
        });
        if (entry.status === 1) {
          const items: TaskResultItem[] = JSON.parse(entry.result);
          firstResult = items?.[0] ?? null;
          resultAudioPath = firstResult?.file ?? null;
          break;
        } else if (entry.status === 2) {
          throw new Error(`Vocal replacement failed: ${entry.result}`);
        }
      }

      if (!resultAudioPath) throw new Error('Vocal replacement timed out — the server did not return a result within the time limit. Try again or check server status.');

      genStore.updateJob(jobId, { status: 'processing', progress: 'Downloading audio...' });
      store.updateClipStatus(newClip.id, 'processing');

      const vocalBlob = await api.downloadAudio(resultAudioPath);
      const engine = getAudioEngine();
      const buffer = await engine.decodeAudioData(vocalBlob);
      const peaks = computeWaveformPeaks(buffer, CLIP_WAVEFORM_PEAK_COUNT);

      const isolatedKey = await saveAudioBlob(project.id, newClip.id, 'isolated', vocalBlob);
      const cumulativeKey = await saveAudioBlob(project.id, newClip.id, 'cumulative', vocalBlob);

      const inferredMetas: InferredMetas | undefined = firstResult
        ? {
            bpm: firstResult.metas?.bpm,
            keyScale: firstResult.metas?.keyscale,
            genres: firstResult.metas?.genres,
            seed: firstResult.seed_value,
            ditModel: firstResult.dit_model,
          }
        : undefined;

      store.updateClipStatus(newClip.id, 'ready', {
        cumulativeMixKey: cumulativeKey,
        isolatedAudioKey: isolatedKey,
        waveformPeaks: peaks,
        audioDuration: buffer.duration,
        audioOffset: 0,
        inferredMetas,
        generatedFromContext: true,
      });

      genStore.updateJob(jobId, { status: 'done', progress: 'Done' });
      store.saveClipVersion(newClip.id);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      store.updateClipStatus(newClip.id, 'error', { errorMessage: message });
      genStore.updateJob(jobId, { status: 'error', progress: message, error: message });
      return false;
    } finally {
      genStore.setIsGenerating(false);
    }
  });
}

/**
 * Extract a server-local file path from the audio URL returned by the backend.
 * The backend URL is typically `/v1/audio?path=/tmp/.../output.wav`.
 */
function extractServerPath(audioPath: string): string | null {
  try {
    const url = new URL(audioPath, 'http://localhost');
    const p = url.searchParams.get('path');
    if (p) return p;
  } catch {
    // not a valid URL — fall through
  }
  if (audioPath.startsWith('/') && !audioPath.includes('?')) return audioPath;
  return null;
}

// ---------------------------------------------------------------------------
// Text2Music — Full-song generation
// ---------------------------------------------------------------------------

export interface Text2MusicRequest {
  prompt: string;
  lyrics: string;
  durationSeconds: number;
  bpm: number | null;
  keyScale: string;
  timeSignature: string;
  /** Whether to auto-split into stems after generation */
  splitToStems: boolean;
  /** Stem count for auto-split (default 4) */
  stemCount?: 2 | 4 | 6;
  // Advanced overrides
  inferenceSteps?: number;
  guidanceScale?: number;
  shift?: number;
  thinking?: boolean;
  seed?: number;
  useRandomSeed?: boolean;
  useCotCaption?: boolean;
  /** Vocal language code — "unknown" = server auto-detects via CoT */
  vocalLanguage?: string;
  /** When true, update project BPM/key/timeSignature from generated result */
  syncMetaToProject?: boolean;
  /** Whether the lyrics are instrumental (for persisting generation params) */
  instrumental?: boolean;
  /** Whether the generation used project BPM/key/timeSignature (for persisting) */
  useProjectMeta?: boolean;
  /** Elements to exclude from generation */
  negativePrompt?: string;
}

export interface Text2MusicResult {
  /** ID of the mix track created */
  mixTrackId: string;
  /** ID of the mix clip created */
  mixClipId: string;
  /** Audio blob of the generated mix */
  audioBlob: Blob;
  /** Stem track IDs (if splitToStems was true) */
  stemTrackIds?: string[];
  /** Whether generation succeeded */
  succeeded: boolean;
  /** Error message if failed */
  errorMessage?: string;
}

/**
 * Generate a full mixed song from a text prompt using the text2music model.
 *
 * Flow:
 * 1. Ensure text2music model + LM are loaded
 * 2. Create a 'mix' track and clip
 * 3. Submit text2music task to backend
 * 4. Poll for completion, download audio
 * 5. Optionally split into stems via stem separation
 */
export async function generateText2Music(request: Text2MusicRequest): Promise<Text2MusicResult> {
  const store = useProjectStore.getState();
  const genStore = useGenerationStore.getState();
  const modelStore = useModelStore.getState();
  const project = store.project;

  if (!project) {
    throw new Error('No project open');
  }

  if (!genStore.tryAcquireGenerationLock()) {
    throw new Error('Generation already in progress');
  }

  // Step 1: Ensure text2music model + LM are loaded
  await modelStore.ensureModelForIntent('full-song');

  // Step 2: Create mix track and clip
  const mixTrack = store.addTrack('custom', 'mix', {
    displayName: 'Full Mix',
    color: '#8b5cf6',
  });
  if (!mixTrack) {
    throw new Error('Failed to create mix track');
  }

  // Use a placeholder duration for the clip when Auto mode (undefined duration).
  // The actual duration will be updated when the audio comes back.
  const placeholderDuration = request.durationSeconds ?? 60;
  const clip = store.addClip(mixTrack.id, {
    startTime: 0,
    duration: placeholderDuration,
    prompt: request.prompt,
    lyrics: request.lyrics,
    globalCaption: request.prompt, // For text2music, the prompt IS the global caption
  });
  if (!clip) {
    throw new Error('Failed to create mix clip');
  }
  const clipId = clip.id;

  // Persist generation params for edit/regenerate
  store.updateClip(clipId, {
    generationParams: {
      type: 'text2music',
      prompt: request.prompt,
      lyrics: request.lyrics,
      durationSeconds: request.durationSeconds,
      thinking: request.thinking,
      seed: request.seed,
      useRandomSeed: request.useRandomSeed,
      vocalLanguage: request.vocalLanguage,
      instrumental: request.instrumental,
      splitToStems: request.splitToStems,
      stemCount: request.stemCount,
      useProjectMeta: request.useProjectMeta,
      inferenceSteps: request.inferenceSteps,
      guidanceScale: request.guidanceScale,
      shift: request.shift,
      negativePrompt: request.negativePrompt,
    },
  });

  // Step 3: Build and submit task
  const jobId = uuidv4();
  genStore.addJob({
    id: jobId,
    clipId,
    trackName: 'Full Mix',
    status: 'queued',
    progress: 'Queued',
    stage: 'Queued',
    progressPercent: null,
    etaSeconds: null,
    etaConfidence: 'none',
  });
  store.updateClipStatus(clipId, 'queued', { generationJobId: jobId });

  try {
    const defaults = project.generationDefaults;
    const activeModel = useModelStore.getState().activeModelId ?? defaults.model;

    const params: Text2MusicTaskParams = {
      task_type: 'text2music',
      prompt: request.prompt,
      lyrics: request.lyrics,
      audio_duration: request.durationSeconds,
      bpm: request.bpm,
      key_scale: request.keyScale || '',
      time_signature: request.timeSignature || '',
      inference_steps: request.inferenceSteps ?? defaults.inferenceSteps,
      guidance_scale: request.guidanceScale ?? defaults.guidanceScale,
      shift: request.shift ?? defaults.shift,
      batch_size: 1,
      audio_format: 'wav',
      thinking: request.thinking ?? defaults.thinking,
      model: activeModel,
    };

    if (request.useRandomSeed === false && request.seed !== undefined) {
      params.seed = request.seed;
      params.use_random_seed = false;
    } else if (request.useRandomSeed === true) {
      params.use_random_seed = true;
    }

    if (request.useCotCaption !== undefined) {
      params.use_cot_caption = request.useCotCaption;
    }

    if (request.vocalLanguage) {
      params.vocal_language = request.vocalLanguage;
    }

    if (request.negativePrompt?.trim()) {
      params.negative_prompt = request.negativePrompt.trim();
    }

    // Submit — text2music doesn't need source audio, send silence as placeholder
    const jobStartedAt = Date.now();
    genStore.updateJob(jobId, {
      status: 'generating',
      startedAt: jobStartedAt,
      progress: 'Submitting...',
      stage: 'Submitting request',
    });
    store.updateClipStatus(clipId, 'generating');

    const silenceBlob = generateSilenceWav(request.durationSeconds);
    const releaseResp = await api.releaseLegoTask(silenceBlob, params);
    const taskId = releaseResp.task_id;
    genStore.updateJob(jobId, { taskId });

    // Step 4: Poll for completion
    const startTime = Date.now();
    let resultAudioPath: string | null = null;
    let firstResult: TaskResultItem | null = null;

    while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
      await sleep(POLL_INTERVAL_MS);

      const entries = await api.queryResult([taskId]);
      const entry = entries?.[0];
      if (!entry) continue;

      const { stage, progressPercent } = extractProgressMetadata(entry);

      {
        const currentJob = useGenerationStore.getState().jobs.find((j) => j.id === jobId);
        useGenerationStore.getState().updateJob(jobId, {
          ...deriveGenerationJobProgress(currentJob, {
            status: 'generating',
            progress: entry.progress_text || 'Generating...',
            stage,
            progressPercent,
          }),
        });
      }

      if (entry.status === 1) {
        const resultItems: TaskResultItem[] = JSON.parse(entry.result);
        firstResult = resultItems?.[0] ?? null;
        resultAudioPath = firstResult?.file ?? null;
        break;
      } else if (entry.status === 2) {
        throw new Error(`Generation failed: ${entry.result}`);
      }
    }

    if (!resultAudioPath) {
      throw new Error('Generation timed out');
    }

    // Download audio
    genStore.updateJob(jobId, {
      status: 'processing',
      progress: 'Downloading audio...',
      stage: 'Downloading audio',
    });
    store.updateClipStatus(clipId, 'processing');

    const audioBlob = await api.downloadAudio(resultAudioPath);
    logger.debug(`Text2Music: downloaded audio, size=${audioBlob.size}`);

    // Store audio
    const audioKey = await saveAudioBlob(project.id, clipId, 'isolated', audioBlob);

    // Compute waveform
    const engine = getAudioEngine();
    const audioBuffer = await engine.decodeAudioData(audioBlob);
    const peaks = computeWaveformPeaks(audioBuffer, CLIP_WAVEFORM_PEAK_COUNT);

    // Build inferred metadata
    const inferredMetas: InferredMetas | undefined = firstResult
      ? {
          bpm: firstResult.metas?.bpm,
          keyScale: firstResult.metas?.keyscale,
          timeSignature: firstResult.metas?.timesignature,
          genres: firstResult.metas?.genres,
          seed: firstResult.seed_value,
          ditModel: firstResult.dit_model,
        }
      : undefined;

    // Update clip as ready — use actual audio buffer duration, not the request duration
    const actualDuration = audioBuffer.duration;
    useProjectStore.getState().updateClipStatus(clipId, 'ready', {
      isolatedAudioKey: audioKey,
      waveformPeaks: peaks,
      inferredMetas,
      audioDuration: actualDuration,
      audioOffset: 0,
    });
    // Also update the clip's visual duration on the timeline to match actual audio
    useProjectStore.getState().updateClip(clipId, { duration: actualDuration });

    genStore.updateJob(jobId, {
      status: 'done',
      progress: 'Done',
      stage: 'Complete',
    });

    // Seed project global caption if empty
    if (request.prompt && !project.globalCaption) {
      useProjectStore.getState().updateProject({ globalCaption: request.prompt });
    }

    // Sync generated metadata back to project settings when requested
    if (request.syncMetaToProject && inferredMetas) {
      const updates: Record<string, unknown> = {};
      if (inferredMetas.bpm && inferredMetas.bpm > 0) updates.bpm = inferredMetas.bpm;
      if (inferredMetas.keyScale) updates.keyScale = inferredMetas.keyScale;
      if (inferredMetas.timeSignature) {
        const ts = Number(inferredMetas.timeSignature);
        if (Number.isFinite(ts) && ts > 0) updates.timeSignature = ts;
      }
      if (Object.keys(updates).length > 0) {
        useProjectStore.getState().updateProject(updates);
        const parts = Object.entries(updates).map(([k, v]) => `${k}=${v}`).join(', ');
        toastInfo(`Project updated: ${parts}`);
      }
    }

    toastSuccess('Full song generated');

    // Step 5: Optional stem separation
    let stemTrackIds: string[] | undefined;
    if (request.splitToStems) {
      try {
        toastInfo('Splitting into stems...');
        const { separateClipAudioToStems } = await import('./stemSeparation');
        const stems = await separateClipAudioToStems({
          clipId,
          sourceBlob: audioBlob,
          stemCount: request.stemCount ?? 4,
          sourceLabel: 'Full Mix',
        });

        stemTrackIds = [];
        const currentProject = useProjectStore.getState().project;
        if (currentProject) {
          for (const stem of stems) {
            const stemTrack = useProjectStore.getState().addTrack(stem.trackName, 'stems', {
              displayName: stem.displayName,
              color: stem.color,
            });
            if (stemTrack) {
              const stemClip = useProjectStore.getState().addClip(stemTrack.id, {
                startTime: 0,
                duration: stem.audioDuration,
                prompt: request.prompt,
                lyrics: '',
              });
              if (stemClip) {
                const stemAudioKey = await saveAudioBlob(currentProject.id, stemClip.id, 'isolated', stem.audioBlob);
                useProjectStore.getState().updateClipStatus(stemClip.id, 'ready', {
                  isolatedAudioKey: stemAudioKey,
                  waveformPeaks: stem.waveformPeaks,
                  audioDuration: stem.audioDuration,
                  audioOffset: 0,
                });
              }
              stemTrackIds.push(stemTrack.id);
            }
          }
        }
        toastSuccess(`Split into ${stems.length} stems`);
      } catch (splitError) {
        const msg = splitError instanceof Error ? splitError.message : 'Stem separation failed';
        toastError(`Stem separation failed: ${msg}`);
        // Don't fail the whole operation — the mix is still available
      }
    }

    useGenerationStore.getState().setIsGenerating(false);
    return {
      mixTrackId: mixTrack.id,
      mixClipId: clipId,
      audioBlob,
      stemTrackIds,
      succeeded: true,
    };
  } catch (error) {
    useGenerationStore.getState().setIsGenerating(false);
    const message = error instanceof Error ? error.message : 'Unknown error';
    useProjectStore.getState().updateClipStatus(clipId, 'error', { errorMessage: message });
    genStore.updateJob(jobId, { status: 'error', progress: message, error: message });
    toastError(`Full song generation failed: ${message}`);
    return {
      mixTrackId: mixTrack.id,
      mixClipId: clipId,
      audioBlob: new Blob(),
      succeeded: false,
      errorMessage: message,
    };
  }
}
