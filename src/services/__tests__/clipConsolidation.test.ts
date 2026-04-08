import { describe, it, expect } from 'vitest';
import { validateClipConsolidation } from '../clipConsolidation';
import type { Clip } from '../../types/project';

function makeClip(overrides?: Partial<Clip>): Clip {
  return {
    id: `clip-${Math.random().toString(36).slice(2, 8)}`,
    trackId: 't1',
    startTime: 0,
    duration: 4,
    prompt: 'test clip',
    globalCaption: '',
    lyrics: '',
    source: 'generated',
    status: 'ready',
    ...overrides,
  } as Clip;
}

describe('validateClipConsolidation', () => {
  it('validates a valid set of audio clips', () => {
    const clips = [
      makeClip({ startTime: 0, duration: 4 }),
      makeClip({ startTime: 4, duration: 4 }),
    ];
    const result = validateClipConsolidation('t1', clips);
    expect(result.mediaType).toBe('audio');
    expect(result.clips).toHaveLength(2);
  });

  it('sorts clips by start time', () => {
    const clips = [
      makeClip({ startTime: 8, duration: 4 }),
      makeClip({ startTime: 0, duration: 4 }),
      makeClip({ startTime: 4, duration: 4 }),
    ];
    const result = validateClipConsolidation('t1', clips);
    expect(result.clips[0].startTime).toBe(0);
    expect(result.clips[1].startTime).toBe(4);
    expect(result.clips[2].startTime).toBe(8);
  });

  it('detects MIDI clips when all clips have midiData', () => {
    const clips = [
      makeClip({ midiData: { notes: [], duration: 4, startBeat: 0 } as any }),
      makeClip({ midiData: { notes: [], duration: 4, startBeat: 4 } as any }),
    ];
    const result = validateClipConsolidation('t1', clips);
    expect(result.mediaType).toBe('midi');
  });

  it('throws when no clips are provided', () => {
    expect(() => validateClipConsolidation('t1', [])).toThrow(/at least one clip/i);
  });

  it('throws when clips span multiple tracks', () => {
    const clips = [
      makeClip({ trackId: 't1' }),
      makeClip({ trackId: 't2' }),
    ];
    expect(() => validateClipConsolidation('t1', clips)).toThrow(/same track/i);
  });

  it('throws when mixing audio and MIDI clips', () => {
    const clips = [
      makeClip({}), // audio (no midiData)
      makeClip({ midiData: { notes: [], duration: 4, startBeat: 0 } as any }),
    ];
    expect(() => validateClipConsolidation('t1', clips)).toThrow(/only audio clips or only MIDI/i);
  });

  it('handles single clip consolidation', () => {
    const clips = [makeClip({ startTime: 2, duration: 6 })];
    const result = validateClipConsolidation('t1', clips);
    expect(result.clips).toHaveLength(1);
    expect(result.mediaType).toBe('audio');
  });
});
