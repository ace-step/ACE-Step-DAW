import { create } from 'zustand';
import type {
  PostProductionTaskInput,
  PostProductionTaskState,
  PostProductionTaskType,
} from '../types/postProduction';

function createTaskState(taskType: PostProductionTaskType): PostProductionTaskState {
  return {
    taskType,
    targetTrackIds: [],
    targetClipIds: [],
    timeRange: null,
    prompt: '',
    globalCaption: '',
    lyricsOverride: '',
    contextMode: taskType === 'polish' ? 'none' : 'auto',
    masteringPreset: 'balanced',
    loudnessTarget: -14,
    status: 'idle',
    lastResult: null,
    lastError: null,
  };
}

export interface PostProductionStoreState {
  isOpen: boolean;
  step: 1 | 2 | 3 | 4;
  task: PostProductionTaskState;
  open: (taskType?: PostProductionTaskType, step?: 1 | 2 | 3 | 4) => void;
  close: () => void;
  setStep: (step: 1 | 2 | 3 | 4) => void;
  setTaskType: (taskType: PostProductionTaskType) => void;
  replaceTask: (task: PostProductionTaskState) => void;
  updateTaskInput: (updates: Partial<PostProductionTaskInput>) => void;
  setTaskStatus: (status: PostProductionTaskState['status']) => void;
  clearTaskFeedback: () => void;
}

export const usePostProductionStore = create<PostProductionStoreState>()((set) => ({
  isOpen: false,
  step: 1,
  task: createTaskState('repair'),
  open: (taskType = 'repair', step = 1) => set((state) => ({
    isOpen: true,
    step,
    task: state.task.taskType === taskType
      ? { ...state.task, lastError: null }
      : createTaskState(taskType),
  })),
  close: () => set({ isOpen: false }),
  setStep: (step) => set({ step }),
  setTaskType: (taskType) => set((state) => ({
    task: {
      ...createTaskState(taskType),
      targetTrackIds: state.task.targetTrackIds,
      targetClipIds: state.task.targetClipIds,
      timeRange: state.task.timeRange,
      globalCaption: state.task.globalCaption,
    },
  })),
  replaceTask: (task) => set({ task }),
  updateTaskInput: (updates) => set((state) => ({
    task: {
      ...state.task,
      ...updates,
      status: state.task.status === 'running' ? 'running' : 'configured',
      lastError: null,
    },
  })),
  setTaskStatus: (status) => set((state) => ({
    task: {
      ...state.task,
      status,
    },
  })),
  clearTaskFeedback: () => set((state) => ({
    task: {
      ...state.task,
      lastError: null,
      lastResult: null,
      status: 'configured',
    },
  })),
}));

export function createPostProductionTaskState(taskType: PostProductionTaskType): PostProductionTaskState {
  return createTaskState(taskType);
}
