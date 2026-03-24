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
});
