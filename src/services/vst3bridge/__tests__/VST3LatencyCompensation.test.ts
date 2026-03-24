import { describe, it, expect } from 'vitest';
import { VST3LatencyCompensation } from '../VST3LatencyCompensation';

describe('VST3LatencyCompensation', () => {
  const sampleRate = 44100;

  describe('calculateCompensation', () => {
    it('returns 0 compensation for a single track with no plugins', () => {
      const tracks = [{ id: 'track-1', pluginLatencies: [] }];
      const result = VST3LatencyCompensation.calculateCompensation(tracks, sampleRate);
      expect(result.get('track-1')).toBe(0);
    });

    it('returns correct compensation for two tracks where one has latency', () => {
      const tracks = [
        { id: 'track-1', pluginLatencies: [256] },
        { id: 'track-2', pluginLatencies: [] },
      ];
      const result = VST3LatencyCompensation.calculateCompensation(tracks, sampleRate);
      // track-1 has max latency (256) → 0 compensation
      expect(result.get('track-1')).toBe(0);
      // track-2 has 0 latency → needs 256 delay
      expect(result.get('track-2')).toBe(256);
    });

    it('returns correct compensation for three tracks with varying latencies', () => {
      const tracks = [
        { id: 'track-1', pluginLatencies: [128, 128] }, // 256 total
        { id: 'track-2', pluginLatencies: [512] },       // 512 total (max)
        { id: 'track-3', pluginLatencies: [64] },         // 64 total
      ];
      const result = VST3LatencyCompensation.calculateCompensation(tracks, sampleRate);
      expect(result.get('track-1')).toBe(256); // 512 - 256
      expect(result.get('track-2')).toBe(0);   // max → 0
      expect(result.get('track-3')).toBe(448); // 512 - 64
    });

    it('returns 0 compensation for all tracks when they have the same latency', () => {
      const tracks = [
        { id: 'track-1', pluginLatencies: [256] },
        { id: 'track-2', pluginLatencies: [128, 128] },
        { id: 'track-3', pluginLatencies: [256] },
      ];
      const result = VST3LatencyCompensation.calculateCompensation(tracks, sampleRate);
      expect(result.get('track-1')).toBe(0);
      expect(result.get('track-2')).toBe(0);
      expect(result.get('track-3')).toBe(0);
    });

    it('returns empty map for empty track list', () => {
      const result = VST3LatencyCompensation.calculateCompensation([], sampleRate);
      expect(result.size).toBe(0);
    });
  });

  describe('getChainLatency', () => {
    it('returns 0 for empty plugin list', () => {
      expect(VST3LatencyCompensation.getChainLatency([])).toBe(0);
    });

    it('sums latencies of all plugins in a chain', () => {
      expect(VST3LatencyCompensation.getChainLatency([128, 256, 64])).toBe(448);
    });

    it('handles single plugin', () => {
      expect(VST3LatencyCompensation.getChainLatency([512])).toBe(512);
    });
  });

  describe('samplesToMs', () => {
    it('converts samples to milliseconds correctly at 44100 Hz', () => {
      // 44100 samples = 1000ms
      expect(VST3LatencyCompensation.samplesToMs(44100, 44100)).toBeCloseTo(1000);
    });

    it('converts samples to milliseconds correctly at 48000 Hz', () => {
      // 48000 samples = 1000ms
      expect(VST3LatencyCompensation.samplesToMs(48000, 48000)).toBeCloseTo(1000);
    });

    it('handles 0 samples', () => {
      expect(VST3LatencyCompensation.samplesToMs(0, 44100)).toBe(0);
    });

    it('converts 256 samples at 44100 Hz', () => {
      const expected = (256 / 44100) * 1000;
      expect(VST3LatencyCompensation.samplesToMs(256, 44100)).toBeCloseTo(expected);
    });
  });
});
