import { describe, it, expect } from 'vitest';
import type { Text2MusicTaskParams, LegoTaskParams, CoverTaskParams, RepaintTaskParams } from '../../../types/api';
import type { ClipGenerationParams } from '../../../types/project';

describe('negative_prompt API parameter types', () => {
  it('Text2MusicTaskParams accepts negative_prompt', () => {
    const params: Text2MusicTaskParams = {
      task_type: 'text2music',
      prompt: 'upbeat pop song',
      lyrics: 'la la la',
      audio_duration: 30,
      bpm: 120,
      key_scale: 'C major',
      time_signature: '4/4',
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
      prompt: 'energetic drums',
      global_caption: 'pop song',
      lyrics: '',
      instruction: '',
      repainting_start: 0,
      repainting_end: 30,
      audio_duration: 30,
      bpm: 120,
      key_scale: '',
      time_signature: '',
      inference_steps: 60,
      guidance_scale: 5,
      shift: 3,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'ace-step-v1.5',
      negative_prompt: 'no electronic',
    };
    expect(params.negative_prompt).toBe('no electronic');
  });

  it('CoverTaskParams accepts negative_prompt', () => {
    const params: CoverTaskParams = {
      task_type: 'cover',
      caption: 'jazz style',
      lyrics: 'test lyrics',
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
      prompt: 'more energy',
      global_caption: 'pop song',
      lyrics: '',
      instruction: 'increase energy',
      repainting_start: 10,
      repainting_end: 20,
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

  it('ClipGenerationParams persists negativePrompt', () => {
    const params: ClipGenerationParams = {
      type: 'text2music',
      prompt: 'test',
      lyrics: 'lyrics',
      negativePrompt: 'no reverb',
    };
    expect(params.negativePrompt).toBe('no reverb');
  });

  it('negative_prompt is optional on all task types', () => {
    const t2m: Text2MusicTaskParams = {
      task_type: 'text2music',
      prompt: 'test', lyrics: '', audio_duration: 30,
      bpm: null, key_scale: '', time_signature: '',
      inference_steps: 60, guidance_scale: 5, shift: 3,
      batch_size: 1, audio_format: 'wav', thinking: false, model: 'v1',
    };
    expect(t2m.negative_prompt).toBeUndefined();
  });
});
