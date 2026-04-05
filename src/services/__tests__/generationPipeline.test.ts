import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock idb-keyval to prevent "indexedDB is not defined" from debounced auto-save
vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn(() => Promise.resolve()),
  del: vi.fn(() => Promise.resolve()),
  keys: vi.fn(() => Promise.resolve([])),
}));

// Mock all heavy dependencies before importing the module under test
const mockLoadAudioBlobByKey = vi.fn();
const mockSaveAudioBlob = vi.fn();
vi.mock('../audioFileManager', () => ({
  loadAudioBlobByKey: (...args: unknown[]) => mockLoadAudioBlobByKey(...args),
  saveAudioBlob: (...args: unknown[]) => mockSaveAudioBlob(...args),
}));

const mockReleaseLegoTask = vi.fn();
const mockQueryResult = vi.fn();
const mockDownloadAudio = vi.fn();
const mockInitModel = vi.fn();
vi.mock('../aceStepApi', () => ({
  releaseLegoTask: (...args: unknown[]) => mockReleaseLegoTask(...args),
  queryResult: (...args: unknown[]) => mockQueryResult(...args),
  downloadAudio: (...args: unknown[]) => mockDownloadAudio(...args),
  initModel: (...args: unknown[]) => mockInitModel(...args),
  listModels: vi.fn(() => Promise.resolve([])),
  getStats: vi.fn(() => Promise.resolve({})),
  inferModelCategory: vi.fn((model: { category?: string }) => model.category ?? 'text2music'),
}));

const mockDecodeAudioData = vi.fn();
vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    decodeAudioData: mockDecodeAudioData,
  }),
}));

vi.mock('../../utils/waveformPeaks', () => ({
  computeWaveformPeaks: vi.fn(() => [0.1, 0.3, 0.5]),
}));

vi.mock('../../utils/clipAudio', () => ({
  CLIP_WAVEFORM_PEAK_COUNT: 240,
}));

vi.mock('../../hooks/useToast', () => ({
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../silenceGenerator', () => ({
  generateSilenceWav: vi.fn(() => new Blob(['silence'], { type: 'audio/wav' })),
}));

vi.mock('../lazyContextAudioExtractor', () => ({
  extractContextAudioLazy: vi.fn(() => Promise.resolve(null)),
}));

vi.mock('../../utils/generationProgress', () => ({
  computeEta: vi.fn(() => null),
}));

vi.mock('../../utils/wav', () => ({
  audioBufferToWavBlob: vi.fn(() => new Blob(['wav'], { type: 'audio/wav' })),
}));

import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { useModelStore } from '../../store/modelStore';
import {
  resolveContextWindow,
  generateAllTracks,
  regenerateClip,
  generateSingleClip,
  generateCoverClip,
  generateRepaintClip,
  generateText2Music,
} from '../generationPipeline';
import type { Clip } from '../../types/project';

// Helper: create a fake AudioBuffer
function fakeAudioBuffer(duration = 5): AudioBuffer {
  return {
    duration,
    numberOfChannels: 2,
    sampleRate: 48000,
    length: duration * 48000,
    getChannelData: vi.fn(() => new Float32Array(duration * 48000)),
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer;
}

// Helper: mock a successful generation cycle (releaseLegoTask → poll → download)
function mockSuccessfulGeneration(audioPath = '/tmp/audio.wav') {
  mockReleaseLegoTask.mockResolvedValue({ task_id: 'task-123' });
  mockQueryResult.mockResolvedValue([{
    task_id: 'task-123',
    status: 1,
    progress_text: 'Done',
    result: JSON.stringify([{
      file: audioPath,
      seed_value: 42,
      dit_model: 'test-model',
      metas: { bpm: 120, keyscale: 'C major', timesignature: '4/4', genres: ['pop'] },
    }]),
  }]);
  mockDownloadAudio.mockResolvedValue(new Blob(['audio-data'], { type: 'audio/wav' }));
  mockSaveAudioBlob.mockResolvedValue('audio:proj-1:clip-1:isolated');
  mockDecodeAudioData.mockResolvedValue(fakeAudioBuffer(5));
}

describe('resolveContextWindow', () => {
  it('returns null when clip has no generationParams', () => {
    const clip = { startTime: 10, generationParams: undefined } as Clip;
    expect(resolveContextWindow(clip)).toBeNull();
  });

  it('returns null when no contextWindow in generationParams', () => {
    const clip = { startTime: 10, generationParams: { prompt: 'test' } } as Clip;
    expect(resolveContextWindow(clip)).toBeNull();
  });

  it('resolves new relative format (offsetStart/offsetEnd)', () => {
    const clip = {
      startTime: 10,
      generationParams: {
        contextWindow: { offsetStart: -5, offsetEnd: 20, trackIds: ['t1', 't2'] },
      },
    } as unknown as Clip;

    const result = resolveContextWindow(clip);
    expect(result).toEqual({
      startTime: 5,   // 10 + (-5)
      endTime: 30,    // 10 + 20
      trackIds: ['t1', 't2'],
    });
  });

  it('resolves legacy absolute format', () => {
    const clip = {
      startTime: 10,
      generationParams: {
        contextWindow: { startTime: 0, endTime: 60 },
      },
    } as unknown as Clip;

    const result = resolveContextWindow(clip);
    expect(result).toEqual({
      startTime: 0,
      endTime: 60,
      trackIds: [],
    });
  });
});

describe('generateCoverClip return value', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGenerationStore.setState({ isGenerating: false, jobs: [] });
  });

  it('returns undefined when isGenerating is true', async () => {
    useGenerationStore.setState({ isGenerating: true });
    const result = await generateCoverClip({
      clipId: 'clip-1',
      caption: 'test',
      lyrics: '',
      coverStrength: 0.5,
      createNew: false,
    });
    expect(result).toBeUndefined();
  });

  it('returns undefined when source clip is not found', async () => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const result = await generateCoverClip({
      clipId: 'nonexistent',
      caption: 'test',
      lyrics: '',
      coverStrength: 0.5,
      createNew: false,
    });
    expect(result).toBeUndefined();
  });
});

describe('generateRepaintClip return value', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGenerationStore.setState({ isGenerating: false, jobs: [] });
  });

  it('returns undefined when isGenerating is true', async () => {
    useGenerationStore.setState({ isGenerating: true });
    const result = await generateRepaintClip({
      clipId: 'clip-1',
      repaintStart: 0,
      repaintEnd: 5,
      prompt: 'test',
    });
    expect(result).toBeUndefined();
  });
});

describe('sourceAudioOverride fallback warning', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGenerationStore.setState({ isGenerating: false, jobs: [] });
    localStorage.setItem('ace-step-daw-debug', '*');
  });

  afterEach(() => {
    localStorage.removeItem('ace-step-daw-debug');
  });

  it('logs warning when sourceAudioOverride key is not found in storage for cover', async () => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('stems');
    const clip = useProjectStore.getState().addClip(track.id, {
      name: 'Test Clip',
      startTime: 0,
      duration: 5,
      type: 'audio',
    });
    const project = useProjectStore.getState().project!;
    const trackObj = project.tracks.find((t) => t.id === track.id)!;
    const storeClip = trackObj.clips.find((c) => c.id === clip.id)!;
    storeClip.isolatedAudioKey = 'real-audio-key';
    storeClip.generationStatus = 'ready';

    mockLoadAudioBlobByKey.mockImplementation(async (key: string) => {
      if (key === 'missing-chained-key') return null;
      if (key === 'real-audio-key') return new Blob(['audio'], { type: 'audio/wav' });
      return null;
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await generateCoverClip({
        clipId: clip.id,
        caption: 'test',
        lyrics: '',
        coverStrength: 0.5,
        createNew: false,
        sourceAudioOverride: 'missing-chained-key',
      });
    } catch {
      // Expected — API calls are not mocked to succeed
    }

    expect(warnSpy).toHaveBeenCalledWith(
      '[ace-step:generation]',
      '[EnhancePipeline] Chained source audio key "missing-chained-key" not found in storage, falling back to clip audio',
    );

    warnSpy.mockRestore();
  });

  it('does not log warning when sourceAudioOverride key is found in storage', async () => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('stems');
    const clip = useProjectStore.getState().addClip(track.id, {
      name: 'Test Clip',
      startTime: 0,
      duration: 5,
      type: 'audio',
    });
    const project = useProjectStore.getState().project!;
    const trackObj = project.tracks.find((t) => t.id === track.id)!;
    const storeClip = trackObj.clips.find((c) => c.id === clip.id)!;
    storeClip.isolatedAudioKey = 'real-audio-key';
    storeClip.generationStatus = 'ready';

    mockLoadAudioBlobByKey.mockImplementation(async () => {
      return new Blob(['audio'], { type: 'audio/wav' });
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await generateCoverClip({
        clipId: clip.id,
        caption: 'test',
        lyrics: '',
        coverStrength: 0.5,
        createNew: false,
        sourceAudioOverride: 'existing-chained-key',
      });
    } catch {
      // Expected — API calls are not mocked to succeed
    }

    expect(warnSpy).not.toHaveBeenCalledWith(
      expect.stringContaining('[EnhancePipeline] Chained source audio key'),
    );

    warnSpy.mockRestore();
  });
});

describe('generateAllTracks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.getState().createProject();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when no project is loaded', async () => {
    useProjectStore.setState({ project: null });
    await generateAllTracks();
    expect(mockReleaseLegoTask).not.toHaveBeenCalled();
  });

  it('does nothing when generation lock is already held', async () => {
    useGenerationStore.setState({ isGenerating: true });
    await generateAllTracks();
    expect(mockReleaseLegoTask).not.toHaveBeenCalled();
  });

  it('skips clips that are already ready and loads their cumulative blob', async () => {
    const track = useProjectStore.getState().addTrack('stems');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 10,
    });
    // Mark clip as ready with cumulative audio
    const project = useProjectStore.getState().project!;
    const storeClip = project.tracks.find(t => t.id === track.id)!.clips.find(c => c.id === clip.id)!;
    storeClip.generationStatus = 'ready';
    storeClip.cumulativeMixKey = 'cumulative-key';

    mockLoadAudioBlobByKey.mockResolvedValue(new Blob(['cumulative'], { type: 'audio/wav' }));

    await generateAllTracks();

    // Should have loaded the cumulative blob but not submitted a task
    expect(mockLoadAudioBlobByKey).toHaveBeenCalledWith('cumulative-key');
    expect(mockReleaseLegoTask).not.toHaveBeenCalled();
  });

  it('generates pending clips sequentially and releases lock on completion', async () => {
    const track = useProjectStore.getState().addTrack('stems');
    useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 10,
    });

    mockSuccessfulGeneration();

    const promise = generateAllTracks();
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    expect(mockReleaseLegoTask).toHaveBeenCalledTimes(1);
    expect(useGenerationStore.getState().isGenerating).toBe(false);
  });

  it('releases generation lock even if generation fails', async () => {
    const track = useProjectStore.getState().addTrack('stems');
    useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 10,
    });

    mockReleaseLegoTask.mockRejectedValue(new Error('API error'));

    const promise = generateAllTracks();
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    expect(useGenerationStore.getState().isGenerating).toBe(false);
  });

  it('skips non-stems tracks', async () => {
    const track = useProjectStore.getState().addTrack('drums');
    // Change track type to pianoRoll
    useProjectStore.getState().updateTrack(track.id, { trackType: 'pianoRoll' });
    useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 10,
    });

    mockSuccessfulGeneration();

    await generateAllTracks();

    expect(mockReleaseLegoTask).not.toHaveBeenCalled();
  });
});

describe('generateSingleClip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.getState().createProject();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when generation lock is held', async () => {
    useGenerationStore.setState({ isGenerating: true });
    await generateSingleClip('clip-1');
    expect(mockReleaseLegoTask).not.toHaveBeenCalled();
  });

  it('generates clip and submits task via API', async () => {
    const track = useProjectStore.getState().addTrack('stems');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 10,
    });

    mockSuccessfulGeneration();
    mockLoadAudioBlobByKey.mockResolvedValue(null);

    const promise = generateSingleClip(clip.id);
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    // API was called with the task
    expect(mockReleaseLegoTask).toHaveBeenCalledTimes(1);
    // Generation lock is released
    expect(useGenerationStore.getState().isGenerating).toBe(false);
    // Job was added to generation store
    expect(useGenerationStore.getState().jobs.length).toBeGreaterThan(0);
  });

  it('releases lock on API error', async () => {
    const track = useProjectStore.getState().addTrack('stems');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 10,
    });

    // Force API failure with a real clip to exercise the error-handling path
    mockReleaseLegoTask.mockRejectedValue(new Error('API connection refused'));
    mockLoadAudioBlobByKey.mockResolvedValue(null);

    const promise = generateSingleClip(clip.id);
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    expect(useGenerationStore.getState().isGenerating).toBe(false);
  });
});

describe('regenerateClip', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.getState().createProject();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing when generation lock is held', async () => {
    useGenerationStore.setState({ isGenerating: true });
    await regenerateClip('clip-1');
    expect(mockReleaseLegoTask).not.toHaveBeenCalled();
  });

  it('regenerates a clip and submits task via API', async () => {
    const track = useProjectStore.getState().addTrack('stems');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 10,
    });

    mockSuccessfulGeneration();
    mockLoadAudioBlobByKey.mockResolvedValue(null);

    const promise = regenerateClip(clip.id);
    await vi.advanceTimersByTimeAsync(3000);
    await promise;

    expect(mockReleaseLegoTask).toHaveBeenCalled();
    expect(useGenerationStore.getState().isGenerating).toBe(false);
  });
});

describe('generateText2Music', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useModelStore.setState(useModelStore.getInitialState(), true);
    useProjectStore.getState().createProject();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function setupModelStore() {
    useModelStore.setState({
      activeModelId: 'test-t2m-model',
      availableModels: [
        { name: 'test-t2m-model', category: 'text2music', is_default: true, is_loaded: true } as never,
      ],
    });
  }

  it('creates mix track and returns result on success', async () => {
    mockInitModel.mockResolvedValue(undefined);
    setupModelStore();
    mockReleaseLegoTask.mockResolvedValue({ task_id: 'task-t2m' });
    mockQueryResult.mockResolvedValue([{
      task_id: 'task-t2m',
      status: 1,
      progress_text: 'Done',
      result: JSON.stringify([{
        file: '/tmp/fullsong.wav',
        seed_value: 99,
        dit_model: 'test-model',
        metas: { bpm: 128, keyscale: 'A minor', timesignature: '4/4', genres: ['electronic'] },
      }]),
    }]);
    mockDownloadAudio.mockResolvedValue(new Blob(['full-song'], { type: 'audio/wav' }));
    mockSaveAudioBlob.mockResolvedValue('audio:proj:mix:isolated');
    mockDecodeAudioData.mockResolvedValue(fakeAudioBuffer(120));

    const promise = generateText2Music({
      prompt: 'An electronic dance track',
      lyrics: '',
      durationSeconds: 120,
      bpm: 128,
      keyScale: 'A minor',
      timeSignature: '4/4',
      splitToStems: false,
    });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result.succeeded).toBe(true);
    expect(result.mixTrackId).toBeDefined();
    expect(result.mixClipId).toBeDefined();
    expect(result.audioBlob).toBeInstanceOf(Blob);
    expect(useGenerationStore.getState().isGenerating).toBe(false);
  });

  it('fails when generation lock is already held', async () => {
    setupModelStore();
    useGenerationStore.setState({ isGenerating: true });

    let error: Error | undefined;
    try {
      await generateText2Music({
        prompt: 'test',
        lyrics: '',
        durationSeconds: 60,
        bpm: null,
        keyScale: '',
        timeSignature: '',
        splitToStems: false,
      });
    } catch (e) {
      error = e as Error;
    }

    expect(error).toBeDefined();
    expect(error!.message).toContain('already in progress');
  });

  it('returns failure when generation times out', async () => {
    mockInitModel.mockResolvedValue(undefined);
    setupModelStore();
    mockReleaseLegoTask.mockResolvedValue({ task_id: 'task-timeout' });
    mockQueryResult.mockResolvedValue([{
      task_id: 'task-timeout',
      status: 0,
      progress_text: 'Processing...',
      result: '',
    }]);

    const promise = generateText2Music({
      prompt: 'test',
      lyrics: '',
      durationSeconds: 60,
      bpm: null,
      keyScale: '',
      timeSignature: '',
      splitToStems: false,
    });
    // Advance past MAX_POLL_DURATION_MS (20 minutes)
    await vi.advanceTimersByTimeAsync(21 * 60 * 1000);
    const result = await promise;

    expect(result.succeeded).toBe(false);
    expect(result.errorMessage).toContain('timed out');
    expect(useGenerationStore.getState().isGenerating).toBe(false);
  });

  it('handles generation error status from server', async () => {
    mockInitModel.mockResolvedValue(undefined);
    setupModelStore();
    mockReleaseLegoTask.mockResolvedValue({ task_id: 'task-err' });
    mockQueryResult.mockResolvedValue([{
      task_id: 'task-err',
      status: 2,
      progress_text: 'Error',
      result: 'CUDA out of memory',
    }]);

    const promise = generateText2Music({
      prompt: 'test',
      lyrics: '',
      durationSeconds: 60,
      bpm: null,
      keyScale: '',
      timeSignature: '',
      splitToStems: false,
    });
    await vi.advanceTimersByTimeAsync(5000);
    const result = await promise;

    expect(result.succeeded).toBe(false);
    expect(result.errorMessage).toContain('CUDA out of memory');
    expect(useGenerationStore.getState().isGenerating).toBe(false);
  });
});
