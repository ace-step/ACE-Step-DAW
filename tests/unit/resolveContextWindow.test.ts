import { describe, expect, it } from 'vitest';
import { resolveContextWindow } from '../../src/services/generationPipeline';
import type { Clip } from '../../src/types/project';

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: 'clip-1',
    trackId: 'track-1',
    startTime: 10,
    duration: 5,
    prompt: 'test',
    lyrics: '',
    generationStatus: 'ready',
    generationJobId: null,
    cumulativeMixKey: null,
    isolatedAudioKey: null,
    waveformPeaks: null,
    ...overrides,
  };
}

describe('resolveContextWindow', () => {
  it('returns null when no generationParams', () => {
    const clip = makeClip();
    expect(resolveContextWindow(clip)).toBeNull();
  });

  it('returns null when generationParams has no contextWindow', () => {
    const clip = makeClip({
      generationParams: {
        type: 'lego',
        prompt: 'test',
        lyrics: '',
      },
    });
    expect(resolveContextWindow(clip)).toBeNull();
  });

  it('resolves relative offset format correctly', () => {
    const clip = makeClip({
      startTime: 10,
      generationParams: {
        type: 'lego',
        prompt: 'test',
        lyrics: '',
        contextWindow: {
          offsetStart: -5,  // 5 seconds before clip start
          offsetEnd: 3,     // 3 seconds after clip start
          trackIds: ['track-a', 'track-b'],
        },
      },
    });

    const result = resolveContextWindow(clip);
    expect(result).not.toBeNull();
    expect(result!.startTime).toBe(5);   // 10 + (-5)
    expect(result!.endTime).toBe(13);    // 10 + 3
    expect(result!.trackIds).toEqual(['track-a', 'track-b']);
  });

  it('resolves legacy absolute format', () => {
    const clip = makeClip({
      generationParams: {
        type: 'lego',
        prompt: 'test',
        lyrics: '',
        contextWindow: {
          startTime: 0,
          endTime: 20,
        }, // legacy format
      },
    });

    const result = resolveContextWindow(clip);
    expect(result).not.toBeNull();
    expect(result!.startTime).toBe(0);
    expect(result!.endTime).toBe(20);
    expect(result!.trackIds).toEqual([]);
  });

  it('handles zero offsets', () => {
    const clip = makeClip({
      startTime: 5,
      generationParams: {
        type: 'lego',
        prompt: 'test',
        lyrics: '',
        contextWindow: {
          offsetStart: 0,
          offsetEnd: 0,
          trackIds: [],
        },
      },
    });

    const result = resolveContextWindow(clip);
    expect(result).not.toBeNull();
    expect(result!.startTime).toBe(5);
    expect(result!.endTime).toBe(5);
  });

  it('handles clip at time zero with negative offset', () => {
    const clip = makeClip({
      startTime: 0,
      generationParams: {
        type: 'lego',
        prompt: 'test',
        lyrics: '',
        contextWindow: {
          offsetStart: -10,
          offsetEnd: 5,
          trackIds: ['t1'],
        },
      },
    });

    const result = resolveContextWindow(clip);
    expect(result).not.toBeNull();
    expect(result!.startTime).toBe(-10); // can be negative
    expect(result!.endTime).toBe(5);
  });
});
