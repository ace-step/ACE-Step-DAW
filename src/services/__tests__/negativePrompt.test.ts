/**
 * Tests for negative prompt parameter inclusion across all generation task types.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1094
 */
import { describe, it, expect } from 'vitest';
import type { Text2MusicTaskParams, LegoTaskParams, CoverTaskParams, RepaintTaskParams } from '../../types/api';
import type { ClipGenerationParams } from '../../types/project';

describe('Negative Prompt Types', () => {
  it('Text2MusicTaskParams accepts negative_prompt', () => {
    const params: Text2MusicTaskParams = {
      task_type: 'text2music',
      prompt: 'lo-fi hip hop',
      lyrics: '',
      audio_duration: 30,
      bpm: null,
      key_scale: '',
      time_signature: '',
      inference_steps: 60,
      guidance_scale: 5,
      shift: 3,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'ace-step-v1.5',
      negative_prompt: 'no autotune, no heavy reverb',
    };
    expect(params.negative_prompt).toBe('no autotune, no heavy reverb');
  });

  it('LegoTaskParams accepts negative_prompt', () => {
    const params: LegoTaskParams = {
      task_type: 'lego',
      track_name: 'drums',
      prompt: 'jazz drums',
      global_caption: 'jazz song',
      lyrics: '',
      instruction: '',
      repainting_start: 0,
      repainting_end: 30,
      audio_duration: 30,
      bpm: null,
      key_scale: '',
      time_signature: '',
      inference_steps: 60,
      guidance_scale: 5,
      shift: 3,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'ace-step-v1.5',
      negative_prompt: 'no electronic drums',
    };
    expect(params.negative_prompt).toBe('no electronic drums');
  });

  it('CoverTaskParams accepts negative_prompt', () => {
    const params: CoverTaskParams = {
      task_type: 'cover',
      caption: 'jazz style',
      lyrics: '',
      audio_cover_strength: 0.5,
      audio_duration: 30,
      inference_steps: 60,
      guidance_scale: 5,
      shift: 3,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'ace-step-v1.5',
      negative_prompt: 'no distortion',
    };
    expect(params.negative_prompt).toBe('no distortion');
  });

  it('RepaintTaskParams accepts negative_prompt', () => {
    const params: RepaintTaskParams = {
      task_type: 'repaint',
      prompt: 'smooth jazz',
      global_caption: '',
      lyrics: '',
      instruction: '',
      repainting_start: 0,
      repainting_end: 10,
      audio_duration: 30,
      inference_steps: 60,
      guidance_scale: 5,
      shift: 3,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'ace-step-v1.5',
      negative_prompt: 'no falsetto',
    };
    expect(params.negative_prompt).toBe('no falsetto');
  });

  it('all task params types accept undefined negative_prompt', () => {
    const t2m: Text2MusicTaskParams = {
      task_type: 'text2music',
      prompt: '', lyrics: '', audio_duration: 30, bpm: null, key_scale: '',
      time_signature: '', inference_steps: 60, guidance_scale: 5, shift: 3,
      batch_size: 1, audio_format: 'wav', thinking: false, model: 'test',
    };
    expect(t2m.negative_prompt).toBeUndefined();
  });

  it('ClipGenerationParams stores negativePrompt', () => {
    const params: ClipGenerationParams = {
      type: 'text2music',
      prompt: 'lo-fi beat',
      lyrics: '',
      negativePrompt: 'no autotune',
    };
    expect(params.negativePrompt).toBe('no autotune');
  });

  it('ClipGenerationParams negativePrompt is optional', () => {
    const params: ClipGenerationParams = {
      type: 'text2music',
      prompt: 'lo-fi beat',
      lyrics: '',
    };
    expect(params.negativePrompt).toBeUndefined();
  });
});
