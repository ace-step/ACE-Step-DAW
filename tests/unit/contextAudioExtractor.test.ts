/**
 * Tests that contextAudioExtractor applies timeStretchRate, audioOffset,
 * and warpMarkers when rendering context audio — matching timeline playback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks -----------------------------------------------------------

// Mock projectStore
const mockGetState = vi.fn();
vi.mock('../../src/store/projectStore', () => ({
  useProjectStore: { getState: () => mockGetState() },
}));

// Mock audioFileManager
const mockLoadAudioBlobByKey = vi.fn();
vi.mock('../../src/services/audioFileManager', () => ({
  loadAudioBlobByKey: (key: string) => mockLoadAudioBlobByKey(key),
}));

// Track all OfflineAudioContext source nodes created
let createdSources: Array<{
  buffer: AudioBuffer | null;
  playbackRate: number;
  startTime: number;
  offset: number;
  duration: number;
}> = [];

// Capture scheduling parameters from OfflineAudioContext
const mockConnect = vi.fn();
const mockSourceStart = vi.fn();

class MockAudioBufferSource {
  buffer: AudioBuffer | null = null;
  playbackRate = { value: 1 };
  connect = mockConnect;
  start = vi.fn((when: number, offset?: number, duration?: number) => {
    createdSources.push({
      buffer: this.buffer,
      playbackRate: this.playbackRate.value,
      startTime: when,
      offset: offset ?? 0,
      duration: duration ?? 0,
    });
  });
}

// Create a real-ish AudioBuffer for testing
function createTestBuffer(duration: number, sampleRate = 48000): AudioBuffer {
  const length = Math.ceil(duration * sampleRate);
  const channels = 2;
  const channelData: Float32Array[] = [];
  for (let ch = 0; ch < channels; ch++) {
    const data = new Float32Array(length);
    // Fill with identifiable pattern
    for (let i = 0; i < length; i++) {
      data[i] = Math.sin(i * 0.01) * 0.5;
    }
    channelData.push(data);
  }
  return {
    length,
    duration,
    sampleRate,
    numberOfChannels: channels,
    getChannelData: (ch: number) => channelData[ch],
  } as unknown as AudioBuffer;
}

// Mock OfflineAudioContext
class MockOfflineAudioContext {
  destination = {};
  sampleRate: number;
  length: number;

  constructor(channels: number, length: number, sampleRate: number) {
    this.sampleRate = sampleRate;
    this.length = length;
  }

  createBufferSource() {
    return new MockAudioBufferSource();
  }

  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer {
    return createTestBuffer(length / sampleRate, sampleRate);
  }

  async decodeAudioData(buffer: ArrayBuffer): Promise<AudioBuffer> {
    // Return a 4-second buffer by default
    return createTestBuffer(4, this.sampleRate);
  }

  async startRendering(): Promise<AudioBuffer> {
    return createTestBuffer(this.length / this.sampleRate, this.sampleRate);
  }
}

// @ts-expect-error - mock global
globalThis.OfflineAudioContext = MockOfflineAudioContext;

// Mock audioBufferToWavBlob
vi.mock('../../src/utils/wav', () => ({
  audioBufferToWavBlob: (buf: AudioBuffer) => new Blob(['mock-wav'], { type: 'audio/wav' }),
}));

// --- Import after mocks ---
import { extractContextAudio } from '../../src/services/contextAudioExtractor';

// --- Helpers ---------------------------------------------------------

function makeClip(overrides: Record<string, unknown> = {}) {
  return {
    id: 'clip-1',
    startTime: 0,
    duration: 4,
    generationStatus: 'ready',
    isolatedAudioKey: 'key-1',
    cumulativeMixKey: undefined,
    audioOffset: 0,
    timeStretchRate: undefined,
    warpMarkers: undefined,
    ...overrides,
  };
}

function makeTrack(clips: ReturnType<typeof makeClip>[], overrides: Record<string, unknown> = {}) {
  return {
    id: 'track-1',
    muted: false,
    soloed: false,
    clips,
    ...overrides,
  };
}

function setupStore(tracks: ReturnType<typeof makeTrack>[]) {
  mockGetState.mockReturnValue({
    project: { tracks },
  });
}

function setupAudioBlob() {
  // Return a minimal valid blob that decodeAudioData will process
  mockLoadAudioBlobByKey.mockResolvedValue(new Blob(['audio'], { type: 'audio/wav' }));
}

// --- Tests -----------------------------------------------------------

describe('contextAudioExtractor', () => {
  beforeEach(() => {
    createdSources = [];
    mockGetState.mockReset();
    mockLoadAudioBlobByKey.mockReset();
    mockConnect.mockReset();
  });

  it('applies timeStretchRate to source playbackRate', async () => {
    const clip = makeClip({ timeStretchRate: 0.5 }); // half speed
    setupStore([makeTrack([clip])]);
    setupAudioBlob();

    await extractContextAudio({ startTime: 0, endTime: 4 });

    expect(createdSources.length).toBe(1);
    expect(createdSources[0].playbackRate).toBe(0.5);
  });

  it('applies audioOffset as buffer offset in source.start()', async () => {
    const clip = makeClip({ audioOffset: 1.5 }); // 1.5s into buffer
    setupStore([makeTrack([clip])]);
    setupAudioBlob();

    await extractContextAudio({ startTime: 0, endTime: 4 });

    expect(createdSources.length).toBe(1);
    expect(createdSources[0].offset).toBeGreaterThanOrEqual(1.5);
  });

  it('schedules warped segments with correct playbackRates', async () => {
    const clip = makeClip({
      duration: 4,
      warpMarkers: [
        { originalTime: 1.0, quantizedTime: 1.5 }, // stretch first second
        { originalTime: 3.0, quantizedTime: 3.0 }, // compress middle
      ],
    });
    setupStore([makeTrack([clip])]);
    setupAudioBlob();

    await extractContextAudio({ startTime: 0, endTime: 4 });

    // With warp markers we expect multiple segments, not a single source
    expect(createdSources.length).toBeGreaterThan(1);

    // Each segment should have its own playbackRate
    const rates = createdSources.map((s) => s.playbackRate);
    const uniqueRates = new Set(rates);
    expect(uniqueRates.size).toBeGreaterThan(1);
  });

  it('uses timeStretchRate=1 when not specified (no change to pitch)', async () => {
    const clip = makeClip({ timeStretchRate: undefined });
    setupStore([makeTrack([clip])]);
    setupAudioBlob();

    await extractContextAudio({ startTime: 0, endTime: 4 });

    expect(createdSources.length).toBe(1);
    expect(createdSources[0].playbackRate).toBe(1);
  });

  // ── Null/invalid inputs ──

  it('returns null when project is null', async () => {
    mockGetState.mockReturnValue({ project: null });
    const result = await extractContextAudio({ startTime: 0, endTime: 10 });
    expect(result).toBeNull();
  });

  it('returns null when context window is invalid (endTime <= startTime)', async () => {
    setupStore([makeTrack([makeClip()])]);
    const result = await extractContextAudio({ startTime: 5, endTime: 5 });
    expect(result).toBeNull();
  });

  it('returns null when context window end is before start', async () => {
    setupStore([makeTrack([makeClip()])]);
    const result = await extractContextAudio({ startTime: 10, endTime: 5 });
    expect(result).toBeNull();
  });

  // ── No clips overlap ──

  it('returns null when no clips overlap the context window', async () => {
    const clip = makeClip({ startTime: 10, duration: 5 }); // clip is at 10-15
    setupStore([makeTrack([clip])]);
    setupAudioBlob();

    const result = await extractContextAudio({ startTime: 0, endTime: 5 }); // window at 0-5
    expect(result).toBeNull();
  });

  // ── Mute/solo logic ──

  it('skips muted tracks', async () => {
    const clip = makeClip();
    setupStore([makeTrack([clip], { muted: true })]);
    setupAudioBlob();

    const result = await extractContextAudio({ startTime: 0, endTime: 4 });
    expect(result).toBeNull();
    expect(createdSources.length).toBe(0);
  });

  it('skips non-soloed tracks when any track is soloed', async () => {
    const clip1 = makeClip({ id: 'clip-1' });
    const clip2 = makeClip({ id: 'clip-2' });
    setupStore([
      makeTrack([clip1], { id: 'track-1', soloed: false }), // should be skipped
      makeTrack([clip2], { id: 'track-2', soloed: true }),   // should be included
    ]);
    setupAudioBlob();

    await extractContextAudio({ startTime: 0, endTime: 4 });

    // Only the soloed track's clip should be scheduled
    expect(createdSources.length).toBe(1);
  });

  // ── generationStatus filtering ──

  it('skips clips that are not ready', async () => {
    const clip = makeClip({ generationStatus: 'generating' });
    setupStore([makeTrack([clip])]);
    setupAudioBlob();

    const result = await extractContextAudio({ startTime: 0, endTime: 4 });
    expect(result).toBeNull();
    expect(createdSources.length).toBe(0);
  });

  // ── Audio key preference ──

  it('prefers isolatedAudioKey over cumulativeMixKey', async () => {
    const clip = makeClip({
      isolatedAudioKey: 'isolated-key',
      cumulativeMixKey: 'cumulative-key',
    });
    setupStore([makeTrack([clip])]);
    setupAudioBlob();

    await extractContextAudio({ startTime: 0, endTime: 4 });

    expect(mockLoadAudioBlobByKey).toHaveBeenCalledWith('isolated-key');
    expect(mockLoadAudioBlobByKey).not.toHaveBeenCalledWith('cumulative-key');
  });

  it('falls back to cumulativeMixKey when isolatedAudioKey is null', async () => {
    const clip = makeClip({
      isolatedAudioKey: null,
      cumulativeMixKey: 'cumulative-key',
    });
    setupStore([makeTrack([clip])]);
    setupAudioBlob();

    await extractContextAudio({ startTime: 0, endTime: 4 });

    expect(mockLoadAudioBlobByKey).toHaveBeenCalledWith('cumulative-key');
  });

  it('skips clip when no audio blob is found', async () => {
    const clip = makeClip({
      isolatedAudioKey: 'missing-key',
      cumulativeMixKey: null,
    });
    setupStore([makeTrack([clip])]);
    mockLoadAudioBlobByKey.mockResolvedValue(undefined);

    const result = await extractContextAudio({ startTime: 0, endTime: 4 });
    expect(result).toBeNull();
  });

  // ── Multiple clips/tracks ──

  it('renders multiple clips from multiple tracks', async () => {
    const clip1 = makeClip({ id: 'c1', startTime: 0, duration: 4, isolatedAudioKey: 'k1' });
    const clip2 = makeClip({ id: 'c2', startTime: 0, duration: 4, isolatedAudioKey: 'k2' });
    setupStore([
      makeTrack([clip1], { id: 't1' }),
      makeTrack([clip2], { id: 't2' }),
    ]);
    setupAudioBlob();

    const result = await extractContextAudio({ startTime: 0, endTime: 4 });

    expect(result).not.toBeNull();
    expect(createdSources.length).toBe(2);
  });

  // ── Partial clip overlap ──

  it('renders clip that partially overlaps context window start', async () => {
    const clip = makeClip({ startTime: 2, duration: 4 }); // clip spans 2-6
    setupStore([makeTrack([clip])]);
    setupAudioBlob();

    const result = await extractContextAudio({ startTime: 0, endTime: 4 }); // window 0-4

    expect(result).not.toBeNull();
    expect(createdSources.length).toBe(1);
  });

  it('renders clip that starts before context window', async () => {
    const clip = makeClip({ startTime: 0, duration: 8 }); // clip spans 0-8
    setupStore([makeTrack([clip])]);
    setupAudioBlob();

    const result = await extractContextAudio({ startTime: 3, endTime: 6 }); // window 3-6

    expect(result).not.toBeNull();
    expect(createdSources.length).toBe(1);
    // Source should seek into the buffer
    expect(createdSources[0].offset).toBeGreaterThan(0);
  });
});
