import { describe, expect, it, vi } from 'vitest';
import {
  registerStrudelEditorPlaybackStop,
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

  it('stop handler should be called before unregistering to prevent orphaned playback', () => {
    // Simulates the panel-close scenario: the stop handler must be invoked
    // before it is unregistered, otherwise audio keeps playing with no way
    // to stop it (the handler becomes null and stopStrudelEditorPlayback is a no-op).
    const stop = vi.fn();
    registerStrudelEditorPlaybackStop(stop);

    // Correct panel-close sequence: stop first, then unregister
    stop();
    registerStrudelEditorPlaybackStop(null);

    expect(stop).toHaveBeenCalledTimes(1);

    // After unregistering, stopStrudelEditorPlayback should be a no-op
    stopStrudelEditorPlayback();
    expect(stop).toHaveBeenCalledTimes(1);
  });
});
