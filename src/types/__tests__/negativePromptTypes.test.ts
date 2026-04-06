import { describe, it, expect } from 'vitest';
import type { Text2MusicTaskParams, LegoTaskParams, CoverTaskParams, RepaintTaskParams } from '../api';

describe('negative_prompt on task param types', () => {
  it('Text2MusicTaskParams accepts negative_prompt', () => {
    const params: Text2MusicTaskParams = {
      task_type: 'text2music',
      prompt: 'A pop song',
      lyrics: 'Hello world',
      audio_duration: 30,
      bpm: 120,
      key_scale: 'C major',
      time_signature: '4',
      inference_steps: 50,
      guidance_scale: 5,
      shift: 3,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'ace-step',
      negative_prompt: 'no autotune, no heavy reverb',
    };
    expect(params.negative_prompt).toBe('no autotune, no heavy reverb');
  });

  it('LegoTaskParams accepts negative_prompt', () => {
    const params: LegoTaskParams = {
      task_type: 'lego',
      track_name: 'drums',
      prompt: 'Drum pattern',
      global_caption: 'A pop song',
      lyrics: '',
      instruction: '',
      repainting_start: 0,
      repainting_end: 30,
      audio_duration: 30,
      bpm: 120,
      key_scale: 'C major',
      time_signature: '4',
      inference_steps: 50,
      guidance_scale: 5,
      shift: 3,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'ace-step',
      negative_prompt: 'no distortion',
    };
    expect(params.negative_prompt).toBe('no distortion');
  });

  it('CoverTaskParams accepts negative_prompt', () => {
    const params: CoverTaskParams = {
      task_type: 'cover',
      caption: 'Jazz cover',
      lyrics: '',
      audio_cover_strength: 0.7,
      audio_duration: 30,
      inference_steps: 50,
      guidance_scale: 5,
      shift: 3,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'ace-step',
      negative_prompt: 'no falsetto',
    };
    expect(params.negative_prompt).toBe('no falsetto');
  });

  it('RepaintTaskParams accepts negative_prompt', () => {
    const params: RepaintTaskParams = {
      task_type: 'repaint',
      prompt: 'Add strings',
      global_caption: '',
      lyrics: '',
      instruction: 'Repaint',
      repainting_start: 10,
      repainting_end: 20,
      audio_duration: 30,
      inference_steps: 50,
      guidance_scale: 5,
      shift: 3,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'ace-step',
      negative_prompt: 'no guitar solo',
    };
    expect(params.negative_prompt).toBe('no guitar solo');
  });

  it('negative_prompt is optional (can be omitted)', () => {
    const params: Text2MusicTaskParams = {
      task_type: 'text2music',
      prompt: 'A rock song',
      lyrics: '',
      audio_duration: 30,
      bpm: null,
      key_scale: '',
      time_signature: '',
      inference_steps: 50,
      guidance_scale: 5,
      shift: 3,
      batch_size: 1,
      audio_format: 'wav',
      thinking: false,
      model: 'ace-step',
    };
    expect(params.negative_prompt).toBeUndefined();
  });
});
