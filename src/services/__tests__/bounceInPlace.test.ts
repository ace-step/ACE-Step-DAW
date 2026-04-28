import { describe, it, expect, vi } from 'vitest';
import {
  resolveBounceRange,
  normalizeAudioBuffer,
  DEFAULT_BOUNCE_IN_PLACE_OPTIONS,
} from '../bounceInPlace';
import type { Project, Track, BounceInPlaceOptions } from '../../types/project';

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: 'track-1',
    displayName: 'Test Track',
    trackName: 'stems',
    trackType: 'stems',
    color: '#ffffff',
    volume: 0.8,
    pan: 0,
    muted: false,
    soloed: false,
    clips: [],
    ...overrides,
  } as Track;
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'Test Project',
    bpm: 120,
    timeSignature: 4,
    timeSignatureDenominator: 4,
    keyScale: 'C major',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    tracks: [],
    totalDuration: 30,
    measures: 16,
    tempoMap: [],
    timeSignatureMap: [],
    ...overrides,
  } as Project;
}

describe('bounceInPlace service', () => {
  describe('resolveBounceRange', () => {
    it('returns clip content range when no explicit range is provided', () => {
      const track = makeTrack({
        clips: [
          { id: 'c1', startTime: 2, duration: 4 } as any,
          { id: 'c2', startTime: 8, duration: 3 } as any,
        ],
      });
      const project = makeProject({ tracks: [track] });

      const range = resolveBounceRange(project, track, DEFAULT_BOUNCE_IN_PLACE_OPTIONS);

      expect(range.startTime).toBe(2);
      expect(range.duration).toBe(9); // 11 - 2
    });

    it('uses explicit startTime and duration when provided', () => {
      const track = makeTrack({
        clips: [{ id: 'c1', startTime: 0, duration: 10 } as any],
      });
      const project = makeProject({ tracks: [track] });
      const options: BounceInPlaceOptions = {
        ...DEFAULT_BOUNCE_IN_PLACE_OPTIONS,
        startTime: 5,
        duration: 3,
      };

      const range = resolveBounceRange(project, track, options);

      expect(range.startTime).toBe(5);
      expect(range.duration).toBe(3);
    });

    it('clamps negative explicit startTime to 0', () => {
      const track = makeTrack();
      const project = makeProject();
      const options: BounceInPlaceOptions = {
        ...DEFAULT_BOUNCE_IN_PLACE_OPTIONS,
        startTime: -5,
        duration: 10,
      };

      const range = resolveBounceRange(project, track, options);

      expect(range.startTime).toBe(0);
    });

    it('falls back to project total duration when track has no clips', () => {
      const track = makeTrack({ clips: [] });
      const project = makeProject({ totalDuration: 60 });

      const range = resolveBounceRange(project, track, DEFAULT_BOUNCE_IN_PLACE_OPTIONS);

      expect(range.startTime).toBe(0);
      expect(range.duration).toBe(60);
    });

    it('handles single clip', () => {
      const track = makeTrack({
        clips: [{ id: 'c1', startTime: 5, duration: 10 } as any],
      });
      const project = makeProject();

      const range = resolveBounceRange(project, track, DEFAULT_BOUNCE_IN_PLACE_OPTIONS);

      expect(range.startTime).toBe(5);
      expect(range.duration).toBe(10);
    });

    it('ensures minimum duration of 0.01s when explicit duration is 0', () => {
      const track = makeTrack();
      const project = makeProject();
      const options: BounceInPlaceOptions = {
        ...DEFAULT_BOUNCE_IN_PLACE_OPTIONS,
        startTime: 0,
        duration: 0,
      };

      const range = resolveBounceRange(project, track, options);

      expect(range.duration).toBe(0.01);
    });

    it('uses only explicit startTime with auto-computed duration', () => {
      const track = makeTrack({ clips: [] });
      const project = makeProject({ totalDuration: 20 });
      const options: BounceInPlaceOptions = {
        ...DEFAULT_BOUNCE_IN_PLACE_OPTIONS,
        startTime: 5,
      };

      const range = resolveBounceRange(project, track, options);

      expect(range.startTime).toBe(5);
      expect(range.duration).toBe(15); // 20 - 5
    });
  });

  describe('normalizeAudioBuffer', () => {
    function createMockBuffer(channels: Float32Array[], sampleRate: number = 48000) {
      const length = channels[0]?.length ?? 0;
      return {
        numberOfChannels: channels.length,
        length,
        sampleRate,
        duration: length / sampleRate,
        getChannelData: (ch: number) => channels[ch],
        copyFromChannel: vi.fn(),
        copyToChannel: vi.fn(),
      } as unknown as AudioBuffer;
    }

    it('returns same buffer when audio is silent', () => {
      const buffer = createMockBuffer([new Float32Array([0, 0, 0])]);
      const result = normalizeAudioBuffer(buffer);
      expect(result).toBe(buffer);
    });

    it('returns same buffer when peak equals target (mono)', () => {
      // Use 0.5 which is exactly representable in Float32
      const buffer = createMockBuffer([new Float32Array([0.25, 0.5, -0.125])]);
      const result = normalizeAudioBuffer(buffer, 0.5);
      expect(result).toBe(buffer);
    });

    it('returns same buffer when peak equals target (stereo)', () => {
      const buffer = createMockBuffer([
        new Float32Array([0.125, 0.25]),
        new Float32Array([0.25, 0.5]),
      ]);
      const result = normalizeAudioBuffer(buffer, 0.5);
      expect(result).toBe(buffer);
    });

    it('detects cross-channel peak correctly', () => {
      // Use 0.5 which is exactly representable in Float32
      // Left peak is 0.25, right peak is 0.5 → overall peak is 0.5
      // target is 0.5 → should return same buffer
      const buffer = createMockBuffer([
        new Float32Array([0.25, 0.125]),
        new Float32Array([0.5, 0.125]),
      ]);
      const result = normalizeAudioBuffer(buffer, 0.5);
      expect(result).toBe(buffer);
    });
  });

  describe('DEFAULT_BOUNCE_IN_PLACE_OPTIONS', () => {
    it('has correct default values', () => {
      expect(DEFAULT_BOUNCE_IN_PLACE_OPTIONS.includeEffects).toBe(true);
      expect(DEFAULT_BOUNCE_IN_PLACE_OPTIONS.includeAutomation).toBe(true);
      expect(DEFAULT_BOUNCE_IN_PLACE_OPTIONS.normalize).toBe(false);
      expect(DEFAULT_BOUNCE_IN_PLACE_OPTIONS.replaceOriginal).toBe(true);
    });
  });
});
