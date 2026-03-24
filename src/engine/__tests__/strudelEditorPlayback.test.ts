import { describe, expect, it, vi } from 'vitest';
import {
  registerStrudelEditorPlaybackStop,
  registerStrudelEditorAudioContext,
  stopStrudelEditorPlayback,
} from '../strudelEditorPlayback';

describe('strudelEditorPlayback', () => {
  it('calls the registered stop handler', () => {
    const stop = vi.fn();
    registerStrudelEditorPlaybackStop(stop);

    stopStrudelEditorPlayback();

    expect(stop).toHaveBeenCalledTimes(1);
    registerStrudelEditorPlaybackStop(null);
  });

  it('clears the stop handler when unregistered', () => {
    const stop = vi.fn();
    registerStrudelEditorPlaybackStop(stop);
    registerStrudelEditorPlaybackStop(null);

    stopStrudelEditorPlayback();

    expect(stop).not.toHaveBeenCalled();
  });

  it('suspends AudioContext as fallback when handler is null', async () => {
    registerStrudelEditorPlaybackStop(null);

    const suspendFn = vi.fn(() => Promise.resolve());
    const resumeFn = vi.fn();
    const fakeCtx = { state: 'running', suspend: suspendFn, resume: resumeFn } as unknown as AudioContext;
    registerStrudelEditorAudioContext(fakeCtx);

    stopStrudelEditorPlayback();

    expect(suspendFn).toHaveBeenCalledTimes(1);
    // Wait for the suspend promise to resolve so resume is called
    await vi.waitFor(() => expect(resumeFn).toHaveBeenCalledTimes(1));

    // Cleanup
    registerStrudelEditorAudioContext(null);
  });

  it('does not suspend AudioContext when handler is registered', () => {
    const stop = vi.fn();
    registerStrudelEditorPlaybackStop(stop);

    const suspendFn = vi.fn(() => Promise.resolve());
    const fakeCtx = { state: 'running', suspend: suspendFn, resume: vi.fn() } as unknown as AudioContext;
    registerStrudelEditorAudioContext(fakeCtx);

    stopStrudelEditorPlayback();

    expect(stop).toHaveBeenCalledTimes(1);
    expect(suspendFn).not.toHaveBeenCalled();

    // Cleanup
    registerStrudelEditorPlaybackStop(null);
    registerStrudelEditorAudioContext(null);
  });
});
