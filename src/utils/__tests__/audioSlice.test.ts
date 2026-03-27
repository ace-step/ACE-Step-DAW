import { describe, it, expect } from 'vitest';
import { detectSlicePoints } from '../audioSlice';

/** Helper to create a mock AudioBuffer with specific channel data. */
function createMockAudioBuffer(
  channelData: Float32Array,
  sampleRate = 44100,
): AudioBuffer {
  return {
    duration: channelData.length / sampleRate,
    sampleRate,
    length: channelData.length,
    numberOfChannels: 1,
    getChannelData: () => channelData,
    copyFromChannel: () => {},
    copyToChannel: () => {},
  } as unknown as AudioBuffer;
}

describe('detectSlicePoints', () => {
  it('returns empty array for silent buffer', () => {
    const silence = new Float32Array(44100).fill(0);
    const buffer = createMockAudioBuffer(silence);
    const points = detectSlicePoints(buffer, 0.1, 1000);
    expect(points).toEqual([]);
  });

  it('returns empty array for constant low-amplitude signal', () => {
    const low = new Float32Array(44100).fill(0.01);
    const buffer = createMockAudioBuffer(low);
    const points = detectSlicePoints(buffer, 0.1, 1000);
    expect(points).toEqual([]);
  });

  it('detects a single transient in the middle of a buffer', () => {
    const data = new Float32Array(44100).fill(0);
    // Place a transient spike at sample 22050 (0.5s)
    for (let i = 22050; i < 22060; i++) {
      data[i] = 0.8;
    }
    const buffer = createMockAudioBuffer(data);
    const points = detectSlicePoints(buffer, 0.1, 1000);
    expect(points.length).toBe(1);
    expect(points[0]).toBeGreaterThanOrEqual(21500);
    expect(points[0]).toBeLessThanOrEqual(22600);
  });

  it('detects multiple transients spaced apart', () => {
    const data = new Float32Array(44100).fill(0);
    // Three transient spikes at ~0.25s, ~0.5s, ~0.75s
    const positions = [11025, 22050, 33075];
    for (const pos of positions) {
      for (let i = pos; i < pos + 20; i++) {
        data[i] = 0.9;
      }
    }
    const buffer = createMockAudioBuffer(data);
    const points = detectSlicePoints(buffer, 0.1, 1000);
    expect(points.length).toBe(3);
    // Each detected point should be near the transient positions
    for (let k = 0; k < 3; k++) {
      expect(points[k]).toBeGreaterThanOrEqual(positions[k] - 512);
      expect(points[k]).toBeLessThanOrEqual(positions[k] + 512);
    }
  });

  it('respects minSliceLength and skips closely spaced transients', () => {
    const data = new Float32Array(44100).fill(0);
    // Two transients only 500 samples apart — below the min slice length of 2000
    data[10000] = 0.8;
    data[10500] = 0.8;
    // Another transient far away
    data[30000] = 0.8;
    const buffer = createMockAudioBuffer(data);
    const points = detectSlicePoints(buffer, 0.1, 2000);
    // Should skip the second transient because it's within minSliceLength of the first
    expect(points.length).toBe(2);
    expect(points[0]).toBeGreaterThanOrEqual(9500);
    expect(points[0]).toBeLessThanOrEqual(10500);
    expect(points[1]).toBeGreaterThanOrEqual(29500);
    expect(points[1]).toBeLessThanOrEqual(30500);
  });

  it('uses higher threshold to filter weaker transients', () => {
    const data = new Float32Array(44100).fill(0);
    // Weak transient at 0.25s
    data[11025] = 0.15;
    // Strong transient at 0.5s
    data[22050] = 0.9;
    const buffer = createMockAudioBuffer(data);
    const highThreshold = detectSlicePoints(buffer, 0.5, 1000);
    expect(highThreshold.length).toBe(1);
    const lowThreshold = detectSlicePoints(buffer, 0.05, 1000);
    expect(lowThreshold.length).toBe(2);
  });

  it('returns slice points sorted in ascending order', () => {
    const data = new Float32Array(44100).fill(0);
    for (let i = 5000; i < 5010; i++) data[i] = 0.9;
    for (let i = 15000; i < 15010; i++) data[i] = 0.9;
    for (let i = 35000; i < 35010; i++) data[i] = 0.9;
    const buffer = createMockAudioBuffer(data);
    const points = detectSlicePoints(buffer, 0.1, 1000);
    for (let i = 1; i < points.length; i++) {
      expect(points[i]).toBeGreaterThan(points[i - 1]);
    }
  });

  it('handles stereo buffer by using first channel', () => {
    const leftData = new Float32Array(44100).fill(0);
    leftData[22050] = 0.8;
    const rightData = new Float32Array(44100).fill(0);
    const stereoBuffer = {
      duration: 1,
      sampleRate: 44100,
      length: 44100,
      numberOfChannels: 2,
      getChannelData: (ch: number) => (ch === 0 ? leftData : rightData),
      copyFromChannel: () => {},
      copyToChannel: () => {},
    } as unknown as AudioBuffer;
    const points = detectSlicePoints(stereoBuffer, 0.1, 1000);
    expect(points.length).toBe(1);
  });
});
