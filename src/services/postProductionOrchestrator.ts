import { generateFromMultiTrack, generateRepaintClip } from './generationPipeline';
import { usePostProductionStore, createPostProductionTaskState } from '../store/postProductionStore';
import { useProjectStore } from '../store/projectStore';
import { useUIStore } from '../store/uiStore';
import type { Track } from '../types/project';
import type {
  PostProductionStartExtendArgs,
  PostProductionStartPolishArgs,
  PostProductionStartRepairArgs,
  PostProductionTaskError,
  PostProductionTaskInput,
  PostProductionTaskResult,
  PostProductionTaskState,
  PostProductionTaskType,
  PostProductionTimeRange,
} from '../types/postProduction';

function buildError(
  code: PostProductionTaskError['code'],
  message: string,
  context: Record<string, unknown>,
  recoverySuggestions: string[] = [],
): PostProductionTaskError {
  return { code, message, context, recoverySuggestions };
}

function getProject() {
  return useProjectStore.getState().project;
}

function getTrack(trackId: string): Track | undefined {
  return getProject()?.tracks.find((track) => track.id === trackId);
}

function getTrackForClip(clipId: string): Track | undefined {
  return getProject()?.tracks.find((track) => track.clips.some((clip) => clip.id === clipId));
}

function clampRangeToClip(range: PostProductionTimeRange | null, clipStart: number, clipEnd: number): PostProductionTimeRange {
  const startTime = Math.max(clipStart, Math.min(range?.startTime ?? clipStart, clipEnd));
  const endTime = Math.max(startTime, Math.min(range?.endTime ?? clipEnd, clipEnd));
  return { startTime, endTime };
}

function inferRepairDefaults(input?: Partial<PostProductionTaskInput>): PostProductionTaskState {
  const project = getProject();
  const ui = useUIStore.getState();
  const selectedClipId = input?.targetClipIds?.[0]
    ?? ui.repaintClipId
    ?? [...ui.selectedClipIds][0]
    ?? null;
  const clip = selectedClipId ? useProjectStore.getState().getClipById(selectedClipId) : null;
  const track = selectedClipId ? getTrackForClip(selectedClipId) : undefined;
  const task = createPostProductionTaskState('repair');

  if (!clip) {
    return {
      ...task,
      ...input,
      targetClipIds: selectedClipId ? [selectedClipId] : [],
      status: 'idle',
    };
  }

  const range = clampRangeToClip(
    input?.timeRange ?? (ui.repaintRange ? {
      startTime: ui.repaintRange.start,
      endTime: ui.repaintRange.end,
    } : null),
    clip.startTime,
    clip.startTime + clip.duration,
  );

  return {
    ...task,
    ...input,
    targetClipIds: [clip.id],
    targetTrackIds: track ? [track.id] : [],
    timeRange: range,
    prompt: input?.prompt ?? clip.prompt ?? '',
    globalCaption: input?.globalCaption ?? clip.globalCaption ?? project?.globalCaption ?? '',
    lyricsOverride: input?.lyricsOverride ?? clip.lyrics ?? '',
    contextMode: input?.contextMode ?? 'selection',
    status: 'configured',
  };
}

function inferExtendDefaults(input?: Partial<PostProductionTaskInput>): PostProductionTaskState {
  const project = getProject();
  const ui = useUIStore.getState();
  const selectedClipId = [...ui.selectedClipIds][0] ?? null;
  const selectedClip = selectedClipId ? useProjectStore.getState().getClipById(selectedClipId) : null;
  const selectWindow = ui.selectWindow ?? (selectedClip ? {
    startTime: selectedClip.startTime,
    endTime: selectedClip.startTime + selectedClip.duration,
    trackIds: selectedClipId ? (getTrackForClip(selectedClipId) ? [getTrackForClip(selectedClipId)!.id] : []) : [],
  } : null);
  const targetTrackIds = input?.targetTrackIds
    ?? selectWindow?.trackIds
    ?? [...ui.selectedTrackIds];
  const task = createPostProductionTaskState('extend');

  return {
    ...task,
    ...input,
    targetTrackIds,
    targetClipIds: input?.targetClipIds ?? (selectedClipId ? [selectedClipId] : []),
    timeRange: input?.timeRange ?? (selectWindow ? {
      startTime: selectWindow.startTime,
      endTime: selectWindow.endTime,
    } : null),
    prompt: input?.prompt ?? '',
    globalCaption: input?.globalCaption ?? project?.globalCaption ?? '',
    lyricsOverride: input?.lyricsOverride ?? '',
    contextMode: input?.contextMode ?? (ui.contextWindow ? 'context' : 'auto'),
    status: 'configured',
  };
}

function inferPolishDefaults(input?: Partial<PostProductionTaskInput>): PostProductionTaskState {
  const project = getProject();
  const task = createPostProductionTaskState('polish');
  const mastering = project?.mastering;

  return {
    ...task,
    ...input,
    globalCaption: input?.globalCaption ?? project?.globalCaption ?? '',
    contextMode: 'none',
    masteringPreset: input?.masteringPreset ?? mastering?.preset ?? 'balanced',
    loudnessTarget: input?.loudnessTarget ?? mastering?.loudnessTarget ?? -14,
    status: 'configured',
  };
}

export function buildPostProductionTask(taskType: PostProductionTaskType, input?: Partial<PostProductionTaskInput>): PostProductionTaskState {
  switch (taskType) {
    case 'repair':
      return inferRepairDefaults(input);
    case 'extend':
      return inferExtendDefaults(input);
    case 'polish':
      return inferPolishDefaults(input);
    default:
      return createPostProductionTaskState('repair');
  }
}

export function openPostProduction(taskType: PostProductionTaskType = 'repair', input?: Partial<PostProductionTaskInput>) {
  const task = buildPostProductionTask(taskType, input);
  usePostProductionStore.getState().replaceTask(task);
  usePostProductionStore.getState().open(taskType, taskType === 'repair' ? 2 : 3);
  return task;
}

function validateRepairTask(task: PostProductionTaskState): PostProductionTaskError | null {
  const project = getProject();
  if (!project) {
    return buildError('PROJECT_REQUIRED', 'Create or open a project before repairing audio.', { taskType: task.taskType }, ['Create a project first.']);
  }
  const clipId = task.targetClipIds[0];
  if (!clipId) {
    return buildError('CLIP_REQUIRED', 'Select a generated clip before starting Repair.', { taskType: task.taskType }, ['Select one clip in the timeline.']);
  }
  const clip = useProjectStore.getState().getClipById(clipId);
  if (!clip) {
    return buildError('CLIP_NOT_FOUND', `Clip '${clipId}' was not found.`, { clipId }, ['Refresh the selection and try again.']);
  }
  if (!(clip.cumulativeMixKey || clip.isolatedAudioKey)) {
    return buildError('AUDIO_SOURCE_REQUIRED', 'Repair needs a generated audio clip with an audio source.', { clipId }, ['Generate the clip first, then retry Repair.']);
  }
  if (!task.timeRange) {
    return buildError('TIME_RANGE_REQUIRED', 'Repair needs a target time range.', { clipId }, ['Set a start and end time inside the clip.']);
  }
  if (task.timeRange.endTime <= task.timeRange.startTime) {
    return buildError('INVALID_TIME_RANGE', 'Repair range end time must be greater than the start time.', { clipId, timeRange: task.timeRange }, ['Adjust the repair range.']);
  }
  return null;
}

function validateExtendTask(task: PostProductionTaskState): PostProductionTaskError | null {
  const project = getProject();
  if (!project) {
    return buildError('PROJECT_REQUIRED', 'Create or open a project before extending audio.', { taskType: task.taskType }, ['Create a project first.']);
  }
  if (!task.targetTrackIds.length) {
    return buildError('TRACK_REQUIRED', 'Extend needs at least one target track.', { taskType: task.taskType }, ['Select one or more target tracks.']);
  }
  const missingTrackId = task.targetTrackIds.find((trackId) => !getTrack(trackId));
  if (missingTrackId) {
    return buildError('TRACK_NOT_FOUND', `Track '${missingTrackId}' was not found.`, { trackId: missingTrackId }, ['Refresh the selection and try again.']);
  }
  if (!task.timeRange) {
    return buildError('TIME_RANGE_REQUIRED', 'Extend needs a select window.', { taskType: task.taskType }, ['Set a start and end time for the extension window.']);
  }
  if (task.timeRange.endTime <= task.timeRange.startTime) {
    return buildError('INVALID_TIME_RANGE', 'Extend end time must be greater than the start time.', { timeRange: task.timeRange }, ['Adjust the extension window.']);
  }
  return null;
}

async function runRepairTask(task: PostProductionTaskState): Promise<PostProductionTaskResult> {
  const clipId = task.targetClipIds[0];
  const timeRange = task.timeRange!;
  await generateRepaintClip({
    clipId,
    repaintStart: timeRange.startTime,
    repaintEnd: timeRange.endTime,
    prompt: task.prompt,
    globalCaption: task.globalCaption || undefined,
  });

  return {
    taskType: 'repair',
    summary: 'Repair finished. The selected region was regenerated while preserving the surrounding clip.',
    nextSuggestedTaskType: 'extend',
    data: {
      clipId,
      timeRange,
    },
    completedAt: Date.now(),
  };
}

async function runExtendTask(task: PostProductionTaskState): Promise<PostProductionTaskResult> {
  const ui = useUIStore.getState();
  const contextWindow = task.contextMode === 'none'
    ? null
    : ui.contextWindow
      ? {
          startTime: ui.contextWindow.startTime,
          endTime: ui.contextWindow.endTime,
        }
      : null;

  await generateFromMultiTrack({
    selectWindow: {
      startTime: task.timeRange!.startTime,
      endTime: task.timeRange!.endTime,
    },
    contextWindow,
    globalCaption: task.globalCaption,
    tracks: task.targetTrackIds.map((trackId) => {
      const track = getTrack(trackId)!;
      const isVocal = track.trackName === 'vocals' || track.trackName === 'backing_vocals';
      return {
        trackId,
        localDescription: task.prompt || track.localCaption || track.displayName,
        lyrics: isVocal ? task.lyricsOverride : '',
      };
    }),
    sharedSeed: Math.floor(Math.random() * 2 ** 31),
    chunkMaskMode: 'auto',
  });

  return {
    taskType: 'extend',
    summary: 'Extend finished. New material was generated into the selected window using the current song context.',
    nextSuggestedTaskType: 'polish',
    data: {
      trackIds: task.targetTrackIds,
      timeRange: task.timeRange,
      contextMode: task.contextMode,
    },
    completedAt: Date.now(),
  };
}

async function runPolishTask(task: PostProductionTaskState): Promise<PostProductionTaskResult> {
  const store = useProjectStore.getState();
  await store.analyzeMastering();
  store.setMasteringPreset(task.masteringPreset);
  store.setMasteringLoudnessTarget(task.loudnessTarget);
  store.setMasteringEnabled(true);

  return {
    taskType: 'polish',
    summary: 'Polish finished. Master-bus analysis ran and the chosen AI mastering settings were applied.',
    nextSuggestedTaskType: null,
    data: {
      preset: task.masteringPreset,
      loudnessTarget: task.loudnessTarget,
    },
    completedAt: Date.now(),
  };
}

export async function runPostProductionTask(): Promise<PostProductionTaskState> {
  const state = usePostProductionStore.getState();
  const task = state.task;
  const validationError = task.taskType === 'repair'
    ? validateRepairTask(task)
    : task.taskType === 'extend'
      ? validateExtendTask(task)
      : getProject()
        ? null
        : buildError('PROJECT_REQUIRED', 'Create or open a project before polishing audio.', { taskType: task.taskType }, ['Create a project first.']);

  if (validationError) {
    const failedTask = {
      ...task,
      status: 'error' as const,
      lastError: validationError,
      lastResult: null,
    };
    usePostProductionStore.getState().replaceTask(failedTask);
    usePostProductionStore.getState().setStep(4);
    return failedTask;
  }

  usePostProductionStore.getState().replaceTask({
    ...task,
    status: 'running',
    lastError: null,
  });
  usePostProductionStore.getState().setStep(4);

  try {
    const result = task.taskType === 'repair'
      ? await runRepairTask(task)
      : task.taskType === 'extend'
        ? await runExtendTask(task)
        : await runPolishTask(task);

    const completedTask = {
      ...usePostProductionStore.getState().task,
      status: 'done' as const,
      lastResult: result,
      lastError: null,
    };
    usePostProductionStore.getState().replaceTask(completedTask);
    return completedTask;
  } catch (error) {
    const failedTask = {
      ...usePostProductionStore.getState().task,
      status: 'error' as const,
      lastResult: null,
      lastError: buildError(
        'TASK_FAILED',
        error instanceof Error ? error.message : 'Post-production task failed unexpectedly.',
        { taskType: task.taskType },
        ['Retry the task or adjust the task parameters.'],
      ),
    };
    usePostProductionStore.getState().replaceTask(failedTask);
    return failedTask;
  }
}

export async function startRepairTask(args: PostProductionStartRepairArgs = {}) {
  const task = openPostProduction('repair', {
    targetClipIds: args.clipId ? [args.clipId] : undefined,
    timeRange: typeof args.startTime === 'number' && typeof args.endTime === 'number'
      ? { startTime: args.startTime, endTime: args.endTime }
      : undefined,
    prompt: args.prompt,
    lyricsOverride: args.lyrics,
    globalCaption: args.globalCaption,
  });
  usePostProductionStore.getState().setStep(3);
  return runPostProductionTask().then(() => ({ ...usePostProductionStore.getState().task, taskType: task.taskType }));
}

export async function startExtendTask(args: PostProductionStartExtendArgs = {}) {
  openPostProduction('extend', {
    targetTrackIds: args.trackIds,
    timeRange: typeof args.startTime === 'number' && typeof args.endTime === 'number'
      ? { startTime: args.startTime, endTime: args.endTime }
      : undefined,
    prompt: args.prompt,
    lyricsOverride: args.lyrics,
    globalCaption: args.globalCaption,
    contextMode: args.contextMode,
  });
  usePostProductionStore.getState().setStep(3);
  return runPostProductionTask();
}

export async function startPolishTask(args: PostProductionStartPolishArgs = {}) {
  openPostProduction('polish', {
    masteringPreset: args.preset,
    loudnessTarget: args.loudnessTarget,
  });
  usePostProductionStore.getState().setStep(3);
  return runPostProductionTask();
}

export function runNextPostProductionStep() {
  const current = usePostProductionStore.getState().task;
  if (current.status !== 'done' || !current.lastResult?.nextSuggestedTaskType) {
    const failedTask = {
      ...current,
      status: 'error' as const,
      lastError: buildError(
        'TASK_NOT_READY',
        'There is no next post-production step available right now.',
        { taskType: current.taskType, status: current.status },
        ['Run Repair or Extend first, then try again.'],
      ),
    };
    usePostProductionStore.getState().replaceTask(failedTask);
    return failedTask;
  }

  const nextType = current.lastResult.nextSuggestedTaskType;
  const nextInput: Partial<PostProductionTaskInput> = nextType === 'extend'
    ? {
        targetTrackIds: current.targetTrackIds,
        targetClipIds: current.targetClipIds,
        timeRange: current.timeRange,
        globalCaption: current.globalCaption,
      }
    : {
        globalCaption: current.globalCaption,
      };

  const nextTask = openPostProduction(nextType, nextInput);
  usePostProductionStore.getState().setStep(3);
  return nextTask;
}

export function getPostProductionTaskState() {
  return usePostProductionStore.getState().task;
}
