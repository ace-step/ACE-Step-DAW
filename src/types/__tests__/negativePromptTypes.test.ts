import { describe, it, expect } from 'vitest';
import type {
  Text2MusicTaskParams,
  LegoTaskParams,
  CoverTaskParams,
  RepaintTaskParams,
} from '../api';

/**
 * Type-level tests: verify negative_prompt is accepted on all generation task params.
 * These tests compile-check the types and verify runtime shape.
 */
describe('negative_prompt on API task params', () => {
  it('Text2MusicTaskParams accepts negative_prompt', () => {
    const params: Text2MusicTaskParams = {
      task_type: 'text2music',
      prompt: 'upbeat pop',
      lyrics: '',
      audio_duration: 30,
      bpm: 120,
      key_scale: 'C major',
      time_signature: '4/4',
      inference_steps: 60,
      guidance_scale: 5,
      shift: 5,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'test',
      negative_prompt: 'no autotune',
    };
    expect(params.negative_prompt).toBe('no autotune');
  });

  it('LegoTaskParams accepts negative_prompt', () => {
    const params: LegoTaskParams = {
      task_type: 'lego',
      track_name: 'drums',
      prompt: 'rock drums',
      global_caption: 'rock song',
      lyrics: '',
      instruction: '',
      repainting_start: 0,
      repainting_end: 0,
      audio_duration: 30,
      bpm: 120,
      key_scale: '',
      time_signature: '',
      inference_steps: 60,
      guidance_scale: 5,
      shift: 5,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'test',
      negative_prompt: 'no reverb',
    };
    expect(params.negative_prompt).toBe('no reverb');
  });

  it('CoverTaskParams accepts negative_prompt', () => {
    const params: CoverTaskParams = {
      task_type: 'cover',
      caption: 'jazz cover',
      lyrics: '',
      audio_cover_strength: 0.5,
      audio_duration: 30,
      inference_steps: 60,
      guidance_scale: 5,
      shift: 5,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'test',
      negative_prompt: 'no distortion',
    };
    expect(params.negative_prompt).toBe('no distortion');
  });

  it('RepaintTaskParams accepts negative_prompt', () => {
    const params: RepaintTaskParams = {
      task_type: 'repaint',
      prompt: 'smoother vocals',
      global_caption: '',
      lyrics: '',
      instruction: '',
      repainting_start: 0,
      repainting_end: 10,
      audio_duration: 30,
      inference_steps: 60,
      guidance_scale: 5,
      shift: 5,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'test',
      negative_prompt: 'no heavy reverb',
    };
    expect(params.negative_prompt).toBe('no heavy reverb');
  });

  it('negative_prompt is optional (omitting it compiles)', () => {
    const params: Text2MusicTaskParams = {
      task_type: 'text2music',
      prompt: 'upbeat pop',
      lyrics: '',
      audio_duration: 30,
      bpm: 120,
      key_scale: '',
      time_signature: '',
      inference_steps: 60,
      guidance_scale: 5,
      shift: 5,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'test',
    };
    expect(params.negative_prompt).toBeUndefined();
  });
});
