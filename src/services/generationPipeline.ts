import { v4 as uuidv4 } from 'uuid';
import { useProjectStore } from '../store/projectStore';
import { useGenerationStore } from '../store/generationStore';
import type { LegoTaskParams, TaskResultItem } from '../types/api';
import type { InferredMetas } from '../types/project';
import * as api from './aceStepApi';
import { generateSilenceWav } from './silenceGenerator';
import { saveAudioBlob, loadAudioBlobByKey } from './audioFileManager';
import { getAudioEngine } from '../hooks/useAudioEngine';
import { isolateTrackAudio } from '../engine/waveSubtraction';
import { audioBufferToWavBlob } from '../utils/wav';
import { computeWaveformPeaks } from '../utils/waveformPeaks';
import { POLL_INTERVAL_MS, MAX_POLL_DURATION_MS } from '../constants/defaults';

/**
 * Generate all tracks sequentially (bottom → top in generation order).
 */
export async function generateAllTracks(): Promise<void> {
  const { project, getTracksInGenerationOrder, updateClipStatus } = useProjectStore.getState();
  const genStore = useGenerationStore.getState();

  if (!project || genStore.isGenerating) return;
  genStore.setIsGenerating(true);

  try {
    const tracks = getTracksInGenerationOrder();
    let previousCumulativeBlob: Blob | null = null;

    console.log(`[GenerationPipeline] generateAllTracks: ${tracks.length} tracks in order:`,
      tracks.map(t => t.trackName));

    for (const track of tracks) {
      for (const clip of track.clips) {
        if (clip.generationStatus === 'ready') {
          // Already generated — use its cumulative mix as input for next track
          if (clip.cumulativeMixKey) {
            const blob = await loadAudioBlobByKey(clip.cumulativeMixKey);
            if (blob) {
              previousCumulativeBlob = blob;
              console.log(`[GenerationPipeline] Loaded existing cumulative for clip=${clip.id} (${track.trackName}), size=${blob.size}`);
            }
          }
          continue;
        }

        console.log(`[GenerationPipeline] Generating clip=${clip.id} (${track.trackName}), previousCumulative=${previousCumulativeBlob ? `${previousCumulativeBlob.size} bytes` : 'null'}`);
        previousCumulativeBlob = await generateClipInternal(
          clip.id,
          previousCumulativeBlob,
        );
        console.log(`[GenerationPipeline] After generate clip=${clip.id}, cumulativeBlob=${previousCumulativeBlob ? `${previousCumulativeBlob.size} bytes` : 'null'}`);
      }
    }
  } finally {
    useGenerationStore.getState().setIsGenerating(false);
  }
}

/**
 * Re-generate a single clip, preserving the current audio state as a version entry.
 * On completion, the new result is also saved as a version.
 */
export async function regenerateClip(clipId: string): Promise<void> {
  const genStore = useGenerationStore.getState();
  if (genStore.isGenerating) return;
  genStore.setIsGenerating(true);

  try {
    const store = useProjectStore.getState();
    // Save the current "ready" state as a version before overwriting
    store.saveClipVersion(clipId);

    const previousBlob = await getPreviousCumulativeBlob(clipId);
    await generateClipInternal(clipId, previousBlob, {});

    // Save the newly generated result as the latest version
    store.saveClipVersion(clipId);
  } finally {
    useGenerationStore.getState().setIsGenerating(false);
  }
}

/**
 * Generate a single clip (and cascade if needed in the future).
 */
export async function generateSingleClip(clipId: string, options?: { sharedSeed?: number }): Promise<void> {
  const genStore = useGenerationStore.getState();
  if (genStore.isGenerating) return;
  genStore.setIsGenerating(true);

  try {
    // Find the previous cumulative blob (from the track generated just before this one)
    const previousBlob = await getPreviousCumulativeBlob(clipId);
    console.log(`[GenerationPipeline] generateSingleClip: clip=${clipId}, previousBlob=${previousBlob ? `${previousBlob.size} bytes` : 'null'}`);
    await generateClipInternal(clipId, previousBlob, options ? { sharedSeed: options.sharedSeed } : {});
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
  console.log(`[GenerationPipeline] getPreviousCumulativeBlob: clip=${clipId}, trackIndex=${trackIndex}/${tracks.length}, track=${clipTrack.trackName}`);
  console.log(`[GenerationPipeline] Generation order:`, tracks.map((t, i) => `${i}:${t.trackName}(order=${t.order})`));

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
        console.log(`[GenerationPipeline] Found predecessor cumulative: track=${prevTrack.trackName}, key=${prevClip.cumulativeMixKey}, blob=${blob ? `${blob.size} bytes` : 'null'}`);
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
        console.log(`[GenerationPipeline] Found successor cumulative (out-of-order): track=${laterTrack.trackName}, key=${laterClip.cumulativeMixKey}, blob=${blob ? `${blob.size} bytes` : 'null'}`);
        return blob;
      }
    }
  }

  console.log(`[GenerationPipeline] No previous cumulative blob found for clip=${clipId}`);
  return null;
}

interface ClipInternalOptions {
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
}

async function generateClipInternal(
  clipId: string,
  previousCumulativeBlob: Blob | null,
  options: ClipInternalOptions = {},
): Promise<Blob | null> {
  const store = useProjectStore.getState();
  const genStore = useGenerationStore.getState();
  const project = store.project;
  if (!project) return null;

  const clip = store.getClipById(clipId);
  const track = store.getTrackForClip(clipId);
  if (!clip || !track) return null;

  // Create generation job
  const jobId = uuidv4();
  genStore.addJob({
    id: jobId,
    clipId,
    trackName: track.trackName,
    status: 'queued',
    progress: 'Queued',
  });

  store.updateClipStatus(clipId, 'queued', { generationJobId: jobId });

  try {
    // Use actual audio duration (without timeline padding) for generation
    const audioDuration = useProjectStore.getState().getAudioDuration();

    // Determine src_audio — prefer a server-side path (no upload), then
    // previous cumulative blob, then synthesized silence.
    const srcBlob = options.srcAudioPath
      ? null
      : (options.forceSilence ? null : previousCumulativeBlob);
    const srcAudioBlob = srcBlob ?? generateSilenceWav(audioDuration);

    console.log(
      `[GenerationPipeline] clip=${clipId} track=${track.trackName}`,
      options.srcAudioPath
        ? `srcAudioPath=${options.srcAudioPath}`
        : `srcAudio: ${srcBlob ? 'previousCumulative' : 'silence'}`,
      `forceSilence=${options.forceSilence ?? false}`,
      `audioDuration=${audioDuration}s`,
    );

    // Build instruction
    const instruction = `Generate the ${track.trackName.toUpperCase().replace('_', ' ')} track based on the audio context:`;

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
      repainting_start: clip.startTime,
      repainting_end: clip.startTime + clip.duration,
      audio_duration: audioDuration,
      bpm: resolvedBpm,
      key_scale: resolvedKey,
      time_signature: resolvedTimeSig,
      inference_steps: project.generationDefaults.inferenceSteps,
      guidance_scale: project.generationDefaults.guidanceScale,
      shift: project.generationDefaults.shift,
      batch_size: 1,
      audio_format: 'wav',
      thinking: project.generationDefaults.thinking,
      model: project.generationDefaults.model,
    } as LegoTaskParams;

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
    useGenerationStore.getState().updateJob(jobId, { status: 'generating', progress: 'Submitting...' });
    useProjectStore.getState().updateClipStatus(clipId, 'generating');

    const releaseResp = await api.releaseLegoTask(srcAudioBlob, params);
    const taskId = releaseResp.task_id;

    // Poll for completion
    const startTime = Date.now();
    let resultAudioPath: string | null = null;
    let firstResult: TaskResultItem | null = null;

    while (Date.now() - startTime < MAX_POLL_DURATION_MS) {
      await sleep(POLL_INTERVAL_MS);

      const entries = await api.queryResult([taskId]);
      const entry = entries?.[0];
      if (!entry) continue;

      useGenerationStore.getState().updateJob(jobId, {
        progress: entry.progress_text || 'Generating...',
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
      throw new Error('Generation timed out');
    }

    // If the project-level global caption was blank, seed it from this generation
    if (effectiveGlobalCaption && !project.globalCaption) {
      useProjectStore.getState().updateProject({ globalCaption: effectiveGlobalCaption });
    }

    // Download audio
    useGenerationStore.getState().updateJob(jobId, { status: 'processing', progress: 'Downloading audio...' });
    useProjectStore.getState().updateClipStatus(clipId, 'processing');

    const cumulativeBlob = await api.downloadAudio(resultAudioPath);
    console.log(`[GenerationPipeline] Downloaded cumulative audio: size=${cumulativeBlob.size}, type=${cumulativeBlob.type}, path=${resultAudioPath}`);

    // Store cumulative mix
    const cumulativeKey = await saveAudioBlob(project.id, clipId, 'cumulative', cumulativeBlob);

    // Wave subtraction: isolate this track
    const engine = getAudioEngine();
    const cumulativeBuffer = await engine.decodeAudioData(cumulativeBlob);

    let previousBuffer: AudioBuffer | null = null;
    if (previousCumulativeBlob) {
      previousBuffer = await engine.decodeAudioData(previousCumulativeBlob);
    }

    const fullIsolatedBuffer = isolateTrackAudio(engine.ctx, cumulativeBuffer, previousBuffer);

    // Re-read clip from store in case the user moved/resized it during generation
    const currentClip = useProjectStore.getState().getClipById(clipId);
    const clipStart = currentClip?.startTime ?? clip.startTime;
    const clipDuration = currentClip?.duration ?? clip.duration;

    // Trim isolated audio to just the clip's time region so the buffer
    // represents only the clip's audio (not the full project duration).
    const sampleRate = fullIsolatedBuffer.sampleRate;
    const startSample = Math.floor(clipStart * sampleRate);
    const endSample = Math.min(
      Math.floor((clipStart + clipDuration) * sampleRate),
      fullIsolatedBuffer.length,
    );
    const trimmedLength = Math.max(1, endSample - startSample);
    const trimmedBuffer = engine.ctx.createBuffer(
      fullIsolatedBuffer.numberOfChannels,
      trimmedLength,
      sampleRate,
    );
    for (let ch = 0; ch < fullIsolatedBuffer.numberOfChannels; ch++) {
      const src = fullIsolatedBuffer.getChannelData(ch);
      const dst = trimmedBuffer.getChannelData(ch);
      for (let i = 0; i < trimmedLength; i++) {
        dst[i] = src[startSample + i];
      }
    }

    const isolatedBlob = audioBufferToWavBlob(trimmedBuffer);
    const isolatedKey = await saveAudioBlob(project.id, clipId, 'isolated', isolatedBlob);

    // Compute waveform peaks from the trimmed buffer (full buffer = clip region)
    const peaks = computeWaveformPeaks(trimmedBuffer, 200);

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

    useGenerationStore.getState().updateJob(jobId, { status: 'done', progress: 'Done' });

    return cumulativeBlob;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    useProjectStore.getState().updateClipStatus(clipId, 'error', { errorMessage: message });
    useGenerationStore.getState().updateJob(jobId, { status: 'error', progress: message, error: message });
    return previousCumulativeBlob;
  }
}

export interface BatchTrackEntry {
  clipId: string;
  localDescription: string;
  /** Lyrics override for vocals/backing_vocals tracks */
  lyrics?: string;
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
  if (genStore.isGenerating) return;
  genStore.setIsGenerating(true);

  try {
    const { mode, globalCaption, tracks, sharedSeed, contextAudioPath, chunkMaskMode } = options;

    if (mode === 'silence') {
      // All tracks in parallel — no dependency on each other
      await Promise.all(
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
    } else {
      // Context mode — sequential; each track's output feeds the next
      let previousCumulativeBlob: Blob | null = null;

      // Start from any already-generated predecessor of the first requested clip,
      // unless an explicit context audio path was provided by the user.
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
        // On the first track, substitute the user-supplied path for the blob
        if (firstCall && contextAudioPath) {
          opts.srcAudioPath = contextAudioPath;
        } else if (!firstCall && prevClipId) {
          // For subsequent tracks: prefer server-side path of the previous clip's cumulative
          const prevClip = useProjectStore.getState().getClipById(prevClipId);
          if (prevClip?.serverCumulativePath) {
            opts.srcAudioPath = prevClip.serverCumulativePath;
          }
        }
        firstCall = false;
        prevClipId = clipId;
        previousCumulativeBlob = await generateClipInternal(clipId, previousCumulativeBlob, opts);
      }
    }
  } finally {
    useGenerationStore.getState().setIsGenerating(false);
  }
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
}

export async function generateFromAddLayer(opts: AddLayerOptions): Promise<void> {
  const genStore = useGenerationStore.getState();
  if (genStore.isGenerating) return;
  genStore.setIsGenerating(true);

  try {
    const store = useProjectStore.getState();

    // Create a new clip at the select window time range
    const clip = store.addClip(opts.trackId, {
      startTime: opts.startTime,
      duration: opts.duration,
      prompt: opts.localDescription,
      globalCaption: opts.globalCaption,
      lyrics: opts.lyrics,
    });

    let contextBlob: Blob | null = null;

    if (opts.contextWindow) {
      // Render the mixed audio from all existing clips within the context window
      const { extractContextAudio } = await import('./contextAudioExtractor');
      contextBlob = await extractContextAudio(opts.contextWindow);
    }

    // Pass contextBlob as the previousCumulativeBlob — the pipeline uploads it
    // as src_audio to the backend when non-null.
    await generateClipInternal(clip.id, contextBlob, {
      forceSilence: !contextBlob,
      localDescription: opts.localDescription,
      globalCaptionOverride: opts.globalCaption,
      lyricsOverride: opts.lyrics,
      chunkMaskMode: opts.chunkMaskMode,
    });
  } finally {
    useGenerationStore.getState().setIsGenerating(false);
  }
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
  if (genStore.isGenerating) return;
  genStore.setIsGenerating(true);

  try {
    const store = useProjectStore.getState();

    // Determine mode: if contextWindow exists and any audio exists in context range → context
    let hasContextAudio = false;
    let contextBlob: Blob | null = null;
    if (opts.contextWindow) {
      const { extractContextAudio } = await import('./contextAudioExtractor');
      contextBlob = await extractContextAudio(opts.contextWindow);
      hasContextAudio = contextBlob !== null && contextBlob.size > 44; // > WAV header
    }
    const mode = hasContextAudio ? 'context' : 'silence';

    // Create clips for each selected track
    const batchTracks: BatchTrackEntry[] = [];
    for (const entry of opts.tracks) {
      const clip = store.addClip(entry.trackId, {
        startTime: opts.selectWindow.startTime,
        duration: opts.selectWindow.endTime - opts.selectWindow.startTime,
        prompt: entry.localDescription,
        globalCaption: opts.globalCaption,
        lyrics: entry.lyrics,
      });
      batchTracks.push({
        clipId: clip.id,
        localDescription: entry.localDescription,
        lyrics: entry.lyrics,
      });
    }

    if (mode === 'silence') {
      await Promise.all(
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
    } else {
      // Context mode — sequential generation, each builds on previous
      let previousCumulativeBlob = contextBlob;
      let prevClipId: string | null = null;
      for (const { clipId, localDescription, lyrics } of batchTracks) {
        const clipOpts: ClipInternalOptions = {
          forceSilence: false,
          localDescription,
          sharedSeed: opts.sharedSeed,
          lyricsOverride: lyrics,
          chunkMaskMode: opts.chunkMaskMode,
        };
        if (prevClipId) {
          const prevClip = useProjectStore.getState().getClipById(prevClipId);
          if (prevClip?.serverCumulativePath) {
            clipOpts.srcAudioPath = prevClip.serverCumulativePath;
          }
        }
        prevClipId = clipId;
        previousCumulativeBlob = await generateClipInternal(clipId, previousCumulativeBlob, clipOpts);
      }
    }
  } finally {
    useGenerationStore.getState().setIsGenerating(false);
  }
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
