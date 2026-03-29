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
});
