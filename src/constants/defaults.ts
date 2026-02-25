import type { GenerationDefaults } from '../types/project';

export const DEFAULT_BPM = 120;
export const DEFAULT_KEY_SCALE = 'C major';
export const DEFAULT_TIME_SIGNATURE = 4;
export const DEFAULT_DURATION = 30;
export const DEFAULT_PROJECT_NAME = 'Untitled Project';

export const DEFAULT_GENERATION: GenerationDefaults = {
  inferenceSteps: 50,
  guidanceScale: 7.0,
  shift: 3.0,
  thinking: false,
  model: '',
};

export const MIN_BPM = 30;
export const MAX_BPM = 300;
export const MIN_DURATION = 10;
export const MAX_DURATION = 600;

export const POLL_INTERVAL_MS = 2000;
export const MAX_POLL_DURATION_MS = 20 * 60 * 1000; // 20 minutes

export const SAMPLE_RATE = 48000;
export const NUM_CHANNELS = 2;
export const BITS_PER_SAMPLE = 16;
