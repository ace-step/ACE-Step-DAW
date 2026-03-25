import { describe, expect, it, vi } from 'vitest';
import {
  registerStrudelEditorPlaybackStop,
  registerStrudelEditorAudioContext,
  getStrudelEditorAudioContext,
  stopStrudelEditorPlayback,
  resumeStrudelAudio,
} from '../strudelEditorPlayback';

// Mock superdough so the dynamic import in stopStrudelEditorPlayback resolves
vi.mock('superdough', () => ({
  getAudioContext: vi.fn(() => null),
}));

describe('strudelEditorPlayback', () => {
  afterEach(() => {
    registerStrudelEditorPlaybackStop(null);
    registerStrudelEditorAudioContext(null);
  });

  it('calls the registered stop handler', () => {
    const stop = vi.fn();
    registerStrudelEditorPlaybackStop(stop);

    stopStrudelEditorPlayback();

    expect(stop).toHaveBeenCalledTimes(1);
  });

  it('does not call handler when unregistered', () => {
    const stop = vi.fn();
    registerStrudelEditorPlaybackStop(stop);
    registerStrudelEditorPlaybackStop(null);

    stopStrudelEditorPlayback();

    expect(stop).not.toHaveBeenCalled();
  });

  it('suspends registered AudioContext on stop', () => {
    const suspendFn = vi.fn(() => Promise.resolve());
    const fakeCtx = { state: 'running', suspend: suspendFn, resume: vi.fn() } as unknown as AudioContext;
    registerStrudelEditorAudioContext(fakeCtx);

    stopStrudelEditorPlayback();

    expect(suspendFn).toHaveBeenCalledTimes(1);
  });

  it('does not suspend if AudioContext is already suspended', () => {
    const suspendFn = vi.fn(() => Promise.resolve());
    const fakeCtx = { state: 'suspended', suspend: suspendFn, resume: vi.fn() } as unknown as AudioContext;
    registerStrudelEditorAudioContext(fakeCtx);

    stopStrudelEditorPlayback();

    expect(suspendFn).not.toHaveBeenCalled();
  });

  it('getStrudelEditorAudioContext returns the registered context', () => {
    const fakeCtx = { state: 'running' } as unknown as AudioContext;
    registerStrudelEditorAudioContext(fakeCtx);

    expect(getStrudelEditorAudioContext()).toBe(fakeCtx);

    registerStrudelEditorAudioContext(null);
    expect(getStrudelEditorAudioContext()).toBeNull();
  });

  it('resumeStrudelAudio resumes suspended context', async () => {
    const resumeFn = vi.fn(() => Promise.resolve());
    const fakeCtx = { state: 'suspended', resume: resumeFn } as unknown as AudioContext;
    registerStrudelEditorAudioContext(fakeCtx);

    await resumeStrudelAudio();

    expect(resumeFn).toHaveBeenCalledTimes(1);
  });
});
