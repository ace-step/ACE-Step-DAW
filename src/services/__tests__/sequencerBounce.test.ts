import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SequencerPattern, SequencerRow } from '../../types/project';

// ── Mocks ────────────────────────────────────────────────────────

const mockAudioBuffer = {
  duration: 0.5,
  length: 22050,
  numberOfChannels: 1,
  sampleRate: 44100,
  getChannelData: vi.fn(() => new Float32Array(22050)),
  copyFromChannel: vi.fn(),
  copyToChannel: vi.fn(),
};

vi.mock('../sampleManager', () => ({
  getSample: vi.fn(async () => mockAudioBuffer),
}));

vi.mock('../../utils/wav', () => ({
  audioBufferToWavBlob: vi.fn(() => new Blob(['wav'], { type: 'audio/wav' })),
}));

vi.mock('../../utils/waveformPeaks', () => ({
  computeWaveformWithMipmap: vi.fn(async () => [0.1, 0.5, 0.8]),
}));

vi.mock('../audioFileManager', () => ({
  saveAudioBlob: vi.fn(async () => 'audio-key-123'),
}));

const mockProjectState = {
  project: { id: 'proj-1' },
  addClip: vi.fn(() => ({ id: 'new-clip-1' })),
  updateClipStatus: vi.fn(),
};

vi.mock('../../store/projectStore', () => ({
  useProjectStore: { getState: () => mockProjectState },
}));

const mockEngine = {
  resume: vi.fn(async () => {}),
  ctx: { sampleRate: 44100 } as AudioContext,
};

vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => mockEngine,
}));

// Mock OfflineAudioContext
const mockOfflineCtx = {
  createBufferSource: vi.fn(() => ({
    buffer: null,
    connect: vi.fn().mockReturnThis(),
    start: vi.fn(),
  })),
  createGain: vi.fn(() => ({
    gain: { value: 1 },
    connect: vi.fn().mockReturnThis(),
  })),
  createStereoPanner: vi.fn(() => ({
    pan: { value: 0 },
    connect: vi.fn().mockReturnThis(),
  })),
  destination: {} as AudioDestinationNode,
  startRendering: vi.fn(async () => mockAudioBuffer),
};

const offlineCtxConstructorArgs: Array<[number, number, number]> = [];

class MockOfflineAudioContext {
  createBufferSource = mockOfflineCtx.createBufferSource;
  createGain = mockOfflineCtx.createGain;
  createStereoPanner = mockOfflineCtx.createStereoPanner;
  destination = mockOfflineCtx.destination;
  startRendering = mockOfflineCtx.startRendering;
  constructor(channels: number, length: number, sampleRate: number) {
    offlineCtxConstructorArgs.push([channels, length, sampleRate]);
  }
}

vi.stubGlobal('OfflineAudioContext', MockOfflineAudioContext);

// Mock AudioBuffer constructor for trimming
class MockAudioBuffer {
  length: number;
  numberOfChannels: number;
  sampleRate: number;
  duration: number;
  getChannelData = vi.fn(() => new Float32Array(this.length));
  copyFromChannel = vi.fn();
  copyToChannel = vi.fn();
  constructor({ length, numberOfChannels, sampleRate }: { length: number; numberOfChannels: number; sampleRate: number }) {
    this.length = length;
    this.numberOfChannels = numberOfChannels;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
  }
}

vi.stubGlobal('AudioBuffer', MockAudioBuffer);

import { bounceSequencerToAudio } from '../sequencerBounce';

// ── Helpers ────────────────────────────────────────────────────────

function makeRow(overrides: Partial<SequencerRow> = {}): SequencerRow {
  return {
    id: 'row-1',
    sampleKey: 'kick',
    label: 'Kick',
    muted: false,
    volume: 1,
    steps: [
      { active: true, velocity: 1 },
      { active: false, velocity: 1 },
      { active: true, velocity: 0.5 },
      { active: false, velocity: 1 },
    ],
    ...overrides,
  } as SequencerRow;
}

function makePattern(overrides: Partial<SequencerPattern> = {}): SequencerPattern {
  return {
    name: 'Test Pattern',
    rows: [makeRow()],
    stepsPerBar: 4,
    bars: 1,
    swing: 0,
    ...overrides,
  } as SequencerPattern;
}

// ── Tests ─────────────────────────────────────────────────────────

afterAll(() => {
  vi.unstubAllGlobals();
});

describe('bounceSequencerToAudio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    offlineCtxConstructorArgs.length = 0;
    mockProjectState.project = { id: 'proj-1' } as typeof mockProjectState.project;
  });

  it('resumes audio engine before rendering', async () => {
    await bounceSequencerToAudio('track-1', makePattern(), 120);
    expect(mockEngine.resume).toHaveBeenCalled();
  });

  it('creates OfflineAudioContext with correct parameters', async () => {
    const pattern = makePattern({ stepsPerBar: 4, bars: 1 });
    await bounceSequencerToAudio('track-1', pattern, 120);

    expect(offlineCtxConstructorArgs.length).toBeGreaterThan(0);
    expect(offlineCtxConstructorArgs[0][2]).toBe(44100); // sampleRate
  });

  it('still creates a clip when all steps are inactive (pattern has duration)', async () => {
    const pattern = makePattern({
      rows: [makeRow({ steps: [{ active: false, velocity: 1 }, { active: false, velocity: 1 }] })],
    });
    await bounceSequencerToAudio('track-1', pattern, 120);

    // Pattern has non-zero duration, so a clip is created even with no active steps
    expect(mockProjectState.addClip).toHaveBeenCalled();
  });

  it('skips muted rows', async () => {
    const pattern = makePattern({
      rows: [
        makeRow({ id: 'row-1', muted: true }),
        makeRow({ id: 'row-2', muted: false, sampleKey: 'snare' }),
      ],
    });

    const { getSample } = await import('../sampleManager');
    await bounceSequencerToAudio('track-1', pattern, 120);

    // Should only load sample for non-muted row (snare), not the muted one
    const calls = vi.mocked(getSample).mock.calls;
    const sampleKeys = calls.map((c) => c[1]);
    expect(sampleKeys).toContain('snare');
    expect(sampleKeys.filter(k => k === 'kick')).toHaveLength(0);
  });

  it('creates a clip and updates its status', async () => {
    await bounceSequencerToAudio('track-1', makePattern(), 120);

    expect(mockProjectState.addClip).toHaveBeenCalledWith(
      'track-1',
      expect.objectContaining({
        startTime: 0,
        prompt: expect.stringContaining('Sequencer'),
      }),
    );
    expect(mockProjectState.updateClipStatus).toHaveBeenCalledWith(
      'new-clip-1',
      'ready',
      expect.objectContaining({
        isolatedAudioKey: 'audio-key-123',
        waveformPeaks: [0.1, 0.5, 0.8],
      }),
    );
  });

  it('respects custom startTime', async () => {
    await bounceSequencerToAudio('track-1', makePattern(), 120, 8);

    expect(mockProjectState.addClip).toHaveBeenCalledWith(
      'track-1',
      expect.objectContaining({ startTime: 8 }),
    );
  });

  it('returns early when no project exists', async () => {
    mockProjectState.project = null as unknown as typeof mockProjectState.project;
    await bounceSequencerToAudio('track-1', makePattern(), 120);

    expect(mockProjectState.addClip).not.toHaveBeenCalled();
  });

  it('uses stereo when rows have non-zero pan', async () => {
    const pattern = makePattern({
      rows: [makeRow({ pan: -0.5 })],
    });
    await bounceSequencerToAudio('track-1', pattern, 120);

    // Should create stereo OfflineAudioContext (2 channels)
    const stereoCall = offlineCtxConstructorArgs.find(args => args[0] === 2);
    expect(stereoCall).toBeTruthy();
    expect(stereoCall![2]).toBe(44100);
  });

  it('handles swing offset for odd-numbered steps', async () => {
    // Make step at odd index (1) active to test swing offset
    const swingRow = makeRow({
      steps: [
        { active: true, velocity: 1 },
        { active: true, velocity: 1 },  // odd index — should receive swing offset
        { active: false, velocity: 1 },
        { active: false, velocity: 1 },
      ],
    });
    const pattern = makePattern({ swing: 0.5, rows: [swingRow] });
    await bounceSequencerToAudio('track-1', pattern, 120);

    const startCalls = mockOfflineCtx.createBufferSource.mock.results
      .map((r: { value: { start: { mock: { calls: number[][] } } } }) => r.value.start.mock.calls)
      .flat();
    const startTimes = startCalls.map(([when]: number[]) => when);

    // At 120 BPM with stepsPerBar=4, stepDuration = (60/120) / (4/4) = 0.5s
    // With swing=0.5, odd step offset = 0.5 * 0.5 * 0.5 = 0.125s
    // Step 1 (odd) should start at 0.5 + 0.125 = 0.625s
    const stepDuration = (60 / 120) / (pattern.stepsPerBar / 4);
    const expectedOddStepStart = stepDuration + stepDuration * pattern.swing * 0.5;

    expect(startTimes.length).toBe(2); // two active steps
    expect(
      startTimes.some((time: number) => Math.abs(time - expectedOddStepStart) < 1e-6),
    ).toBe(true);
  });
});
