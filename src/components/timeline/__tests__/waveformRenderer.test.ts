import { describe, it, expect, vi, beforeEach } from 'vitest';
import { drawWaveform, drawMidiThumbnail, CANVAS_CONSTANTS } from '../waveformRenderer';

/**
 * Minimal mock for CanvasRenderingContext2D.
 * Tracks all drawing calls for assertion.
 */
function createMockCtx() {
  const calls: { method: string; args: unknown[] }[] = [];
  const proxy = new Proxy(
    {
      canvas: { width: 400, height: 200 },
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      globalAlpha: 1,
    } as Record<string, unknown>,
    {
      get(target, prop) {
        if (prop in target) return target[prop as string];
        // Return a function stub that records calls
        return (...args: unknown[]) => {
          calls.push({ method: prop as string, args });
        };
      },
      set(target, prop, value) {
        target[prop as string] = value;
        return true;
      },
    },
  );
  return { ctx: proxy as unknown as CanvasRenderingContext2D, calls };
}

describe('waveformRenderer', () => {
  describe('CANVAS_CONSTANTS', () => {
    it('exports expected dimension constants', () => {
      expect(CANVAS_CONSTANTS.MIDI_THUMBNAIL_TOP).toBeGreaterThan(0);
      expect(CANVAS_CONSTANTS.MAX_CANVAS_CSS_PX).toBeGreaterThan(0);
    });
  });

  describe('drawWaveform', () => {
    let ctx: CanvasRenderingContext2D;
    let calls: { method: string; args: unknown[] }[];

    beforeEach(() => {
      ({ ctx, calls } = createMockCtx());
    });

    it('clears the canvas before drawing', () => {
      const peaks = [0.5, -0.3, 0.4, -0.2, 0.8, -0.6, 0.7, -0.5];
      drawWaveform(ctx, {
        peaks,
        audioDuration: 2,
        audioOffset: 0,
        clipDuration: 2,
        width: 400,
        height: 200,
        color: '#ff0000',
        trackVolume: 1,
      });
      const clearCall = calls.find((c) => c.method === 'clearRect');
      expect(clearCall).toBeDefined();
    });

    it('does nothing when peaks are empty', () => {
      drawWaveform(ctx, {
        peaks: [],
        audioDuration: 2,
        audioOffset: 0,
        clipDuration: 2,
        width: 400,
        height: 200,
        color: '#ff0000',
        trackVolume: 1,
      });
      const fillCalls = calls.filter((c) => c.method === 'fill');
      expect(fillCalls.length).toBe(0);
    });

    it('does nothing when peaks are null', () => {
      drawWaveform(ctx, {
        peaks: null,
        audioDuration: 2,
        audioOffset: 0,
        clipDuration: 2,
        width: 400,
        height: 200,
        color: '#ff0000',
        trackVolume: 1,
      });
      const fillCalls = calls.filter((c) => c.method === 'fill');
      expect(fillCalls.length).toBe(0);
    });

    it('draws both left and right channels', () => {
      // 2 logical peaks × PEAK_STRIDE(4) = 8 values
      const peaks = [0.5, -0.3, 0.4, -0.2, 0.8, -0.6, 0.7, -0.5];
      drawWaveform(ctx, {
        peaks,
        audioDuration: 2,
        audioOffset: 0,
        clipDuration: 2,
        width: 400,
        height: 200,
        color: '#ff0000',
        trackVolume: 1,
      });
      // Should draw filled waveforms (beginPath + fill calls)
      const fillCalls = calls.filter((c) => c.method === 'fill');
      expect(fillCalls.length).toBeGreaterThanOrEqual(2); // left + right channels
    });

    it('draws peak envelope lines', () => {
      const peaks = [0.5, -0.3, 0.4, -0.2, 0.8, -0.6, 0.7, -0.5];
      drawWaveform(ctx, {
        peaks,
        audioDuration: 2,
        audioOffset: 0,
        clipDuration: 2,
        width: 400,
        height: 200,
        color: '#ff0000',
        trackVolume: 1,
      });
      const strokeCalls = calls.filter((c) => c.method === 'stroke');
      expect(strokeCalls.length).toBeGreaterThanOrEqual(2); // left + right peak envelopes
    });

    it('scales waveform amplitude by trackVolume', () => {
      // With 0 volume, the waveform should still draw but with 0 amplitude
      const peaks = [0.8, -0.6, 0.7, -0.5];
      drawWaveform(ctx, {
        peaks,
        audioDuration: 1,
        audioOffset: 0,
        clipDuration: 1,
        width: 200,
        height: 100,
        color: '#00ff00',
        trackVolume: 0,
      });
      // Should still call beginPath (drawing happens, just flat)
      const beginCalls = calls.filter((c) => c.method === 'beginPath');
      expect(beginCalls.length).toBeGreaterThan(0);
    });

    it('handles zero width gracefully', () => {
      const peaks = [0.5, -0.3, 0.4, -0.2];
      drawWaveform(ctx, {
        peaks,
        audioDuration: 1,
        audioOffset: 0,
        clipDuration: 1,
        width: 0,
        height: 100,
        color: '#ff0000',
        trackVolume: 1,
      });
      const fillCalls = calls.filter((c) => c.method === 'fill');
      expect(fillCalls.length).toBe(0);
    });

    it('respects contentOffset for time-stretched clips', () => {
      const peaks = [0.5, -0.3, 0.4, -0.2, 0.8, -0.6, 0.7, -0.5];
      // Should not throw
      drawWaveform(ctx, {
        peaks,
        audioDuration: 4,
        audioOffset: 0,
        clipDuration: 2,
        contentOffset: 0.5,
        width: 400,
        height: 200,
        color: '#ff0000',
        trackVolume: 1,
      });
      const fillCalls = calls.filter((c) => c.method === 'fill');
      expect(fillCalls.length).toBeGreaterThanOrEqual(2);
    });

    it('draws center divider line', () => {
      const peaks = [0.5, -0.3, 0.4, -0.2];
      drawWaveform(ctx, {
        peaks,
        audioDuration: 1,
        audioOffset: 0,
        clipDuration: 1,
        width: 200,
        height: 100,
        color: '#ff0000',
        trackVolume: 1,
      });
      // moveTo + lineTo for center divider
      const moveToCalls = calls.filter((c) => c.method === 'moveTo');
      expect(moveToCalls.length).toBeGreaterThan(0);
    });
  });

  describe('drawMidiThumbnail', () => {
    let ctx: CanvasRenderingContext2D;
    let calls: { method: string; args: unknown[] }[];

    beforeEach(() => {
      ({ ctx, calls } = createMockCtx());
    });

    it('clears the canvas before drawing', () => {
      drawMidiThumbnail(ctx, {
        notes: [{ pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 }],
        width: 400,
        height: 200,
        duration: 2,
        bpm: 120,
        color: '#00ff00',
      });
      const clearCall = calls.find((c) => c.method === 'clearRect');
      expect(clearCall).toBeDefined();
    });

    it('does nothing when notes array is empty', () => {
      drawMidiThumbnail(ctx, {
        notes: [],
        width: 400,
        height: 200,
        duration: 2,
        bpm: 120,
        color: '#00ff00',
      });
      const fillRectCalls = calls.filter((c) => c.method === 'fillRect');
      expect(fillRectCalls.length).toBe(0);
    });

    it('draws rectangles for MIDI notes', () => {
      const notes = [
        { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 },
        { pitch: 64, startBeat: 1, durationBeats: 0.5, velocity: 80 },
        { pitch: 67, startBeat: 2, durationBeats: 1, velocity: 90 },
      ];
      drawMidiThumbnail(ctx, {
        notes,
        width: 400,
        height: 200,
        duration: 4,
        bpm: 120,
        color: '#00ff00',
      });
      const fillRectCalls = calls.filter((c) => c.method === 'fillRect');
      expect(fillRectCalls.length).toBe(3);
    });

    it('limits notes drawn when clip is narrow', () => {
      // Very narrow width with many notes
      const notes = Array.from({ length: 200 }, (_, i) => ({
        pitch: 40 + (i % 48),
        startBeat: i * 0.25,
        durationBeats: 0.2,
        velocity: 80,
      }));
      drawMidiThumbnail(ctx, {
        notes,
        width: 20, // very narrow
        height: 100,
        duration: 50,
        bpm: 120,
        color: '#00ff00',
      });
      const fillRectCalls = calls.filter((c) => c.method === 'fillRect');
      // Should be capped to avoid visual noise
      expect(fillRectCalls.length).toBeLessThan(notes.length);
      expect(fillRectCalls.length).toBeGreaterThan(0);
    });

    it('handles single-pitch notes (range = 0)', () => {
      const notes = [
        { pitch: 60, startBeat: 0, durationBeats: 1, velocity: 100 },
        { pitch: 60, startBeat: 1, durationBeats: 1, velocity: 100 },
      ];
      drawMidiThumbnail(ctx, {
        notes,
        width: 200,
        height: 100,
        duration: 2,
        bpm: 120,
        color: '#ff0000',
      });
      const fillRectCalls = calls.filter((c) => c.method === 'fillRect');
      expect(fillRectCalls.length).toBe(2);
    });
  });
});
