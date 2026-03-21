import { describe, expect, it } from 'vitest';
import { computeLegoTimingParams } from '../../src/services/legoApiTiming';

describe('computeLegoTimingParams', () => {
  const projectDuration = 128;

  it('from-silence: repainting 0 / -1 and audio_duration = clip length', () => {
    const t = computeLegoTimingParams(
      true,
      { startTime: 10, duration: 8 },
      projectDuration,
    );
    expect(t.repainting_start).toBe(0);
    expect(t.repainting_end).toBe(-1);
    expect(t.audio_duration).toBe(8);
    expect(t.isChunkMode).toBe(true);
  });

  it('from-silence: full-timeline clip is not chunk mode', () => {
    const t = computeLegoTimingParams(
      true,
      { startTime: 0, duration: projectDuration },
      projectDuration,
    );
    expect(t.isChunkMode).toBe(false);
    expect(t.audio_duration).toBe(projectDuration);
  });

  it('from-silence: clamps zero clip duration to a small positive', () => {
    const t = computeLegoTimingParams(true, { startTime: 0, duration: 0 }, projectDuration);
    expect(t.audio_duration).toBeGreaterThan(0);
    expect(t.audio_duration).toBeLessThanOrEqual(0.001);
  });

  it('with context: repainting follows clip and audio_duration = project timeline', () => {
    const t = computeLegoTimingParams(
      false,
      { startTime: 5, duration: 4 },
      projectDuration,
    );
    expect(t.repainting_start).toBe(5);
    expect(t.repainting_end).toBe(9);
    expect(t.audio_duration).toBe(projectDuration);
    expect(t.isChunkMode).toBe(true);
  });

  it('respects repaintRange override when not forceSilence', () => {
    const t = computeLegoTimingParams(
      false,
      { startTime: 0, duration: 20 },
      projectDuration,
      { start: 2, end: 18 },
    );
    expect(t.repainting_start).toBe(2);
    expect(t.repainting_end).toBe(18);
    expect(t.audio_duration).toBe(projectDuration);
  });
});
