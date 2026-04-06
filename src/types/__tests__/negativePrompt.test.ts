import { describe, it, expect } from 'vitest';
import type { LegoTaskParams, Text2MusicTaskParams, CoverTaskParams, RepaintTaskParams } from '../api';

/**
 * Type-level tests verifying that negative_prompt is accepted on all generation task params.
 * These tests compile-check + runtime-check the shape of the types.
 */
describe('Negative Prompt — API Types', () => {
  it('Text2MusicTaskParams accepts negative_prompt', () => {
    const params: Text2MusicTaskParams = {
      task_type: 'text2music',
      prompt: 'upbeat pop song',
      lyrics: '',
      audio_duration: 60,
      bpm: 120,
      key_scale: 'C major',
      time_signature: '4/4',
      inference_steps: 60,
      guidance_scale: 5,
      shift: 5,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'default',
      negative_prompt: 'no autotune, no reverb',
    };
    expect(params.negative_prompt).toBe('no autotune, no reverb');
  });

  it('LegoTaskParams accepts negative_prompt', () => {
    const params: LegoTaskParams = {
      task_type: 'lego',
      track_name: 'drums',
      prompt: 'driving rock drums',
      global_caption: 'rock song',
      lyrics: '',
      instruction: '',
      repainting_start: 0,
      repainting_end: 10,
      audio_duration: 10,
      bpm: 140,
      key_scale: '',
      time_signature: '4/4',
      inference_steps: 60,
      guidance_scale: 5,
      shift: 5,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'default',
      negative_prompt: 'no electronic',
    };
    expect(params.negative_prompt).toBe('no electronic');
  });

  it('CoverTaskParams accepts negative_prompt', () => {
    const params: CoverTaskParams = {
      task_type: 'cover',
      caption: 'jazz cover',
      lyrics: '',
      audio_cover_strength: 0.5,
      audio_duration: 60,
      inference_steps: 60,
      guidance_scale: 5,
      shift: 5,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'default',
      negative_prompt: 'no distortion',
    };
    expect(params.negative_prompt).toBe('no distortion');
  });

  it('RepaintTaskParams accepts negative_prompt', () => {
    const params: RepaintTaskParams = {
      task_type: 'repaint',
      prompt: 'add piano',
      global_caption: 'ballad',
      lyrics: '',
      instruction: '',
      repainting_start: 10,
      repainting_end: 20,
      audio_duration: 60,
      inference_steps: 60,
      guidance_scale: 5,
      shift: 5,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'default',
      negative_prompt: 'no heavy bass',
    };
    expect(params.negative_prompt).toBe('no heavy bass');
  });

  it('negative_prompt is optional (undefined when not set)', () => {
    const params: Text2MusicTaskParams = {
      task_type: 'text2music',
      prompt: 'pop song',
      lyrics: '',
      audio_duration: 60,
      bpm: null,
      key_scale: '',
      time_signature: '',
      inference_steps: 60,
      guidance_scale: 5,
      shift: 5,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'default',
    };
    expect(params.negative_prompt).toBeUndefined();
  });
});
