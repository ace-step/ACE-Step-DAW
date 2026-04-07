import { describe, expect, it } from 'vitest';
import type {
  Text2MusicTaskParams,
  LegoTaskParams,
  CoverTaskParams,
  RepaintTaskParams,
} from '../../src/types/api';

describe('negative prompt — API types', () => {
  it('Text2MusicTaskParams accepts negative_prompt', () => {
    const params: Text2MusicTaskParams = {
      task_type: 'text2music',
      prompt: 'upbeat electronic',
      lyrics: '',
      audio_duration: 30,
      bpm: 128,
      key_scale: 'C major',
      time_signature: '4/4',
      inference_steps: 60,
      guidance_scale: 5.0,
      shift: 3.0,
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
      prompt: 'heavy drums',
      global_caption: 'rock song',
      lyrics: '',
      instruction: 'Generate the drums track',
      repainting_start: 0,
      repainting_end: 30,
      audio_duration: 30,
      bpm: 120,
      key_scale: 'A minor',
      time_signature: '4/4',
      inference_steps: 60,
      guidance_scale: 5.0,
      shift: 3.0,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'ace-step-v1.5',
      negative_prompt: 'no hi-hat',
    };
    expect(params.negative_prompt).toBe('no hi-hat');
  });

  it('CoverTaskParams accepts negative_prompt', () => {
    const params: CoverTaskParams = {
      task_type: 'cover',
      caption: 'jazz style',
      lyrics: '',
      audio_cover_strength: 0.5,
      audio_duration: 30,
      inference_steps: 60,
      guidance_scale: 5.0,
      shift: 3.0,
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
      prompt: 'jazz piano',
      global_caption: 'jazz ballad',
      lyrics: '',
      instruction: 'regenerate',
      repainting_start: 10,
      repainting_end: 20,
      audio_duration: 30,
      inference_steps: 60,
      guidance_scale: 5.0,
      shift: 3.0,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'ace-step-v1.5',
      negative_prompt: 'no vocals',
    };
    expect(params.negative_prompt).toBe('no vocals');
  });

  it('negative_prompt is optional (omitting it is valid)', () => {
    const params: Text2MusicTaskParams = {
      task_type: 'text2music',
      prompt: 'chill lo-fi',
      lyrics: '',
      audio_duration: 60,
      bpm: 85,
      key_scale: '',
      time_signature: '',
      inference_steps: 60,
      guidance_scale: 5.0,
      shift: 3.0,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'ace-step-v1.5',
    };
    expect(params.negative_prompt).toBeUndefined();
  });
});
