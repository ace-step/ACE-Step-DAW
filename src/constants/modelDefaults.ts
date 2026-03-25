/**
 * Model-family-aware default hyperparameters.
 *
 * Derived from ACE-Step-1.5 backend:
 * - acestep/ui/gradio/events/generation/model_config.py
 * - acestep/inference.py (GenerationParams defaults)
 * - acestep/constants.py (TASK_TYPES_TURBO / TASK_TYPES_BASE)
 *
 * Three model variants exist on the backend:
 *   turbo  — fast (8 steps), no CFG, limited tasks (text2music/cover/repaint)
 *   base   — full diffusion (32 steps), full CFG, all tasks
 *   sft    — fine-tuned base (50 steps), full CFG, all tasks (incl. lego)
 */

import type { ModelCategory } from '../types/api';

/** Sub-variant within a model category */
export type ModelVariant = 'turbo' | 'base' | 'sft';

/** Hyperparameter defaults for a model variant */
export interface ModelHyperparamDefaults {
  /** DiT inference steps */
  inferenceSteps: number;
  inferenceStepsMin: number;
  inferenceStepsMax: number;

  /** Guidance scale (CFG) */
  guidanceScale: number;
  guidanceScaleVisible: boolean;

  /** Shift */
  shift: number;

  /** Whether thinking (LM CoT) is enabled by default */
  thinking: boolean;

  /** LM parameters (only relevant when thinking=true) */
  lmTemperature: number;
  lmCfgScale: number;
  lmTopP: number;

  /** Task types this variant supports */
  supportedTaskTypes: string[];

  /** Whether advanced DiT controls (ADG, CFG interval) are visible */
  advancedDitVisible: boolean;
}

/** Default hyperparameters per model variant */
export const MODEL_VARIANT_DEFAULTS: Record<ModelVariant, ModelHyperparamDefaults> = {
  turbo: {
    inferenceSteps: 8,
    inferenceStepsMin: 1,
    inferenceStepsMax: 20,
    guidanceScale: 7.0,
    guidanceScaleVisible: false, // CFG disabled for turbo
    shift: 3.0,
    thinking: true,
    lmTemperature: 0.85,
    lmCfgScale: 2.0,
    lmTopP: 0.9,
    supportedTaskTypes: ['text2music', 'repaint', 'cover'],
    advancedDitVisible: false,
  },
  base: {
    inferenceSteps: 32,
    inferenceStepsMin: 1,
    inferenceStepsMax: 200,
    guidanceScale: 7.0,
    guidanceScaleVisible: true,
    shift: 3.0,
    thinking: true,
    lmTemperature: 0.85,
    lmCfgScale: 2.0,
    lmTopP: 0.9,
    supportedTaskTypes: ['text2music', 'repaint', 'cover', 'extract', 'lego', 'complete'],
    advancedDitVisible: true,
  },
  sft: {
    inferenceSteps: 50,
    inferenceStepsMin: 1,
    inferenceStepsMax: 200,
    guidanceScale: 7.0,
    guidanceScaleVisible: true,
    shift: 3.0,
    thinking: true,
    lmTemperature: 0.85,
    lmCfgScale: 2.0,
    lmTopP: 0.9,
    supportedTaskTypes: ['text2music', 'repaint', 'cover', 'extract', 'lego', 'complete'],
    advancedDitVisible: true,
  },
};

/**
 * Infer the model variant from model name and metadata.
 *
 * Priority: explicit hints in name → supported_task_types → fallback.
 */
export function inferModelVariant(model: {
  name?: string;
  supported_task_types?: string[];
  category?: ModelCategory;
}): ModelVariant {
  const name = model.name?.toLowerCase() ?? '';

  // Turbo detection: name contains "turbo"
  if (name.includes('turbo')) return 'turbo';

  // SFT detection: name contains "sft" or "lego" (lego models are SFT fine-tunes)
  if (name.includes('sft') || name.includes('lego')) return 'sft';

  // If it supports lego tasks, it's at least base (likely sft)
  if (model.supported_task_types?.includes('lego')) return 'sft';

  // If category is lego, it's an SFT variant
  if (model.category === 'lego') return 'sft';

  // Default: base
  return 'base';
}

/**
 * Get the default hyperparameters for a given model.
 */
export function getModelDefaults(model: {
  name?: string;
  supported_task_types?: string[];
  category?: ModelCategory;
}): ModelHyperparamDefaults {
  return MODEL_VARIANT_DEFAULTS[inferModelVariant(model)];
}
