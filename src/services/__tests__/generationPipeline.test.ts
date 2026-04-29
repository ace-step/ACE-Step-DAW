import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock idb-keyval to prevent "indexedDB is not defined" from debounced auto-save
vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => ({})),
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
  computeWaveformWithMipmap: vi.fn(async () => [0.1, 0.3, 0.5]),
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
import { useVoiceStore } from '../../store/voiceStore';
import {
  resolveContextWindow,
  generateAllTracks,
  regenerateClip,
  generateSingleClip,
  generateCoverClip,
  generateRepaintClip,
  generateText2Music,
  generateVocalReplacement,
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

describe('negative prompt pipeline forwarding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useProjectStore.getState().createProject();
    mockLoadAudioBlobByKey.mockResolvedValue(new Blob(['audio'], { type: 'audio/wav' }));
    mockReleaseLegoTask.mockRejectedValue(new Error('stop after params'));
  });

  it('passes negative_prompt to cover generation params', async () => {
    const track = useProjectStore.getState().addTrack('stems');
    const clip = useProjectStore.getState().addClip(track.id, {
      name: 'Cover Source',
      startTime: 0,
      duration: 5,
      type: 'audio',
    });
    useProjectStore.getState().updateClip(clip.id, {
      isolatedAudioKey: 'source-audio',
      generationStatus: 'ready',
    });

    await generateCoverClip({
      clipId: clip.id,
      caption: 'jazz cover',
      lyrics: '',
      coverStrength: 0.5,
      createNew: false,
      negativePrompt: ' no distortion ',
    });

    expect(mockReleaseLegoTask).toHaveBeenCalled();
    expect(mockReleaseLegoTask.mock.calls[0][1]).toMatchObject({
      task_type: 'cover',
      negative_prompt: 'no distortion',
    });
  });

  it('passes negative_prompt to repaint generation params', async () => {
    const track = useProjectStore.getState().addTrack('stems');
    const clip = useProjectStore.getState().addClip(track.id, {
      name: 'Repaint Source',
      startTime: 0,
      duration: 5,
      type: 'audio',
    });
    useProjectStore.getState().updateClip(clip.id, {
      cumulativeMixKey: 'source-audio',
      generationStatus: 'ready',
    });

    await generateRepaintClip({
      clipId: clip.id,
      repaintStart: 0,
      repaintEnd: 5,
      prompt: 'gentle piano',
      negativePrompt: ' no harsh vocals ',
    });

    expect(mockReleaseLegoTask).toHaveBeenCalled();
    expect(mockReleaseLegoTask.mock.calls[0][1]).toMatchObject({
      task_type: 'repaint',
      negative_prompt: 'no harsh vocals',
    });
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

  it('regenerates text2music with the clip saved voice influence instead of current selection', async () => {
    useModelStore.setState({
      activeModelId: 'test-t2m-model',
      availableModels: [
        { name: 'test-t2m-model', category: 'text2music', is_default: true, is_loaded: true } as never,
      ],
    });
    const track = useProjectStore.getState().addTrack('custom', 'mix');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 60,
      prompt: 'Saved prompt',
      lyrics: '',
    });
    useProjectStore.getState().updateClip(clip.id, {
      generationParams: {
        type: 'text2music',
        prompt: 'Saved prompt',
        lyrics: '',
        durationSeconds: 60,
        useProjectMeta: false,
        guidanceScale: 10,
        voiceProfileId: 'saved-voice',
        audioInfluence: 70,
        styleInfluence: 30,
      },
    });
    useVoiceStore.setState({
      voices: [
        {
          id: 'saved-voice',
          name: 'Saved Voice',
          createdAt: 1,
          updatedAt: 1,
          audioKey: 'voice-audio:saved',
          durationSeconds: 12,
          skillLevel: 'professional',
          tags: [],
          defaultAudioInfluence: 20,
          defaultStyleInfluence: 80,
          source: 'upload',
        },
        {
          id: 'current-voice',
          name: 'Current Voice',
          createdAt: 1,
          updatedAt: 1,
          audioKey: 'voice-audio:current',
          durationSeconds: 12,
          skillLevel: 'professional',
          tags: [],
          defaultAudioInfluence: 95,
          defaultStyleInfluence: 95,
          source: 'upload',
        },
      ],
      selectedVoiceId: 'current-voice',
      searchQuery: '',
      filterTag: null,
    });
    const voiceBlob = new Blob(['saved-voice'], { type: 'audio/wav' });
    mockSuccessfulGeneration('/tmp/regenerated.wav');
    mockLoadAudioBlobByKey.mockResolvedValue(voiceBlob);

    const promise = regenerateClip(clip.id);
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    expect(mockLoadAudioBlobByKey).toHaveBeenCalledWith('voice-audio:saved');
    const [, params, options] = mockReleaseLegoTask.mock.calls[0];
    expect(params.audio_cover_strength).toBe(0.7);
    expect(params.guidance_scale).toBe(6);
    expect(options.referenceAudioBlob).toBe(voiceBlob);
  });

  it('falls back to the selected voice when regenerating legacy text2music clips', async () => {
    useModelStore.setState({
      activeModelId: 'test-t2m-model',
      availableModels: [
        { name: 'test-t2m-model', category: 'text2music', is_default: true, is_loaded: true } as never,
      ],
    });
    const track = useProjectStore.getState().addTrack('custom', 'mix');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 60,
      prompt: 'Legacy prompt',
      lyrics: '',
    });
    useProjectStore.getState().updateClip(clip.id, {
      generationParams: {
        type: 'text2music',
        prompt: 'Legacy prompt',
        lyrics: '',
        durationSeconds: 60,
        useProjectMeta: false,
        guidanceScale: 10,
      },
    });
    useVoiceStore.setState({
      voices: [{
        id: 'current-voice',
        name: 'Current Voice',
        createdAt: 1,
        updatedAt: 1,
        audioKey: 'voice-audio:current',
        durationSeconds: 12,
        skillLevel: 'professional',
        tags: [],
        defaultAudioInfluence: 55,
        defaultStyleInfluence: 50,
        source: 'upload',
      }],
      selectedVoiceId: 'current-voice',
      searchQuery: '',
      filterTag: null,
    });
    const voiceBlob = new Blob(['current-voice'], { type: 'audio/wav' });
    mockSuccessfulGeneration('/tmp/regenerated.wav');
    mockLoadAudioBlobByKey.mockResolvedValue(voiceBlob);

    const promise = regenerateClip(clip.id);
    await vi.advanceTimersByTimeAsync(5000);
    await promise;

    expect(mockLoadAudioBlobByKey).toHaveBeenCalledWith('voice-audio:current');
    const [, params, options] = mockReleaseLegoTask.mock.calls[0];
    expect(params.audio_cover_strength).toBe(0.55);
    expect(params.guidance_scale).toBe(10);
    expect(options.referenceAudioBlob).toBe(voiceBlob);
  });
});

describe('generateText2Music', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    useProjectStore.setState(useProjectStore.getInitialState(), true);
    useGenerationStore.setState(useGenerationStore.getInitialState(), true);
    useModelStore.setState(useModelStore.getInitialState(), true);
    useVoiceStore.setState({ voices: [], selectedVoiceId: null, searchQuery: '', filterTag: null });
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

  it('attaches the selected voice profile to initial text2music submissions', async () => {
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
    const voiceBlob = new Blob(['voice'], { type: 'audio/wav' });
    mockLoadAudioBlobByKey.mockResolvedValue(voiceBlob);
    useVoiceStore.setState({
      voices: [{
        id: 'voice-1',
        name: 'Lead vocal',
        createdAt: 1,
        updatedAt: 1,
        audioKey: 'voice-audio:voice-1',
        durationSeconds: 12,
        skillLevel: 'professional',
        tags: [],
        defaultAudioInfluence: 70,
        defaultStyleInfluence: 35,
        source: 'upload',
      }],
      selectedVoiceId: 'voice-1',
    });

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
    await promise;

    expect(mockLoadAudioBlobByKey).toHaveBeenCalledWith('voice-audio:voice-1');
    const [, params, options] = mockReleaseLegoTask.mock.calls[0];
    expect(params.reference_audio_path).toBeUndefined();
    expect(params.audio_cover_strength).toBe(0.7);
    expect(params.guidance_scale).toBe(4.9);
    expect(options.referenceAudioBlob).toBe(voiceBlob);
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

  it('keeps an empty full-song placeholder empty when generation is cancelled before audio is saved', async () => {
    mockInitModel.mockResolvedValue(undefined);
    setupModelStore();
    mockReleaseLegoTask.mockRejectedValue(new DOMException('Aborted', 'AbortError'));

    const result = await generateText2Music({
      prompt: 'test',
      lyrics: '',
      durationSeconds: 60,
      bpm: null,
      keyScale: '',
      timeSignature: '',
      splitToStems: false,
    });

    const clip = useProjectStore
      .getState()
      .project?.tracks.flatMap((track) => track.clips)
      .find((candidate) => candidate.id === result.mixClipId);
    const job = useGenerationStore.getState().jobs.find((candidate) => candidate.clipId === result.mixClipId);

    expect(result.succeeded).toBe(false);
    expect(result.errorMessage).toBe('Cancelled');
    expect(clip?.generationStatus).toBe('empty');
    expect(clip?.isolatedAudioKey).toBeNull();
    expect(job?.status).toBe('cancelled');
  });
});

// ─── generateVocalReplacement ───────────────────────────────────────────────

describe('generateVocalReplacement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useGenerationStore.setState({ isGenerating: false, jobs: [] });
  });

  it('returns early when isGenerating is true (lock not acquired)', async () => {
    useGenerationStore.setState({ isGenerating: true });
    await generateVocalReplacement({
      clipId: 'clip-1',
      vocalStyle: 'warm female vocals',
      lyrics: 'la la la',
      targetTrackId: 'track-vocals',
      bpm: 120,
      keyScale: 'C major',
    });
    // No API calls should have been made
    expect(mockReleaseLegoTask).not.toHaveBeenCalled();
  });

  it('returns early when source clip has no audio', async () => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('drums', 'stems');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 10,
      prompt: 'Rock drums',
    });
    // No audio keys set — isolatedAudioKey and cumulativeMixKey are null
    mockLoadAudioBlobByKey.mockResolvedValue(null);

    const vocalTrack = useProjectStore.getState().addTrack('vocals', 'stems');

    await generateVocalReplacement({
      clipId: clip.id,
      vocalStyle: 'warm vocals',
      lyrics: 'hello world',
      targetTrackId: vocalTrack.id,
      bpm: 120,
      keyScale: '',
    });

    expect(mockReleaseLegoTask).not.toHaveBeenCalled();
  });

  it('submits lego task with track_name=vocals and polls for result', async () => {
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('drums', 'stems');
    const clip = useProjectStore.getState().addClip(track.id, {
      startTime: 0,
      duration: 10,
      prompt: 'Rock drums',
    });
    // Set audio key on clip
    const project = useProjectStore.getState().project!;
    const trackObj = project.tracks.find((t) => t.id === track.id)!;
    const storeClip = trackObj.clips.find((c) => c.id === clip.id)!;
    storeClip.isolatedAudioKey = 'drums-audio-key';
    storeClip.generationStatus = 'ready';

    const vocalTrack = useProjectStore.getState().addTrack('vocals', 'stems');

    mockLoadAudioBlobByKey.mockResolvedValue(new Blob(['audio'], { type: 'audio/wav' }));
    mockReleaseLegoTask.mockResolvedValue({ task_id: 'task-123', status: 'queued' });
    mockQueryResult.mockResolvedValue([{
      task_id: 'task-123',
      status: 1,
      result: JSON.stringify([{ file: '/v1/audio?path=/tmp/vocal.wav', metas: { bpm: 120 } }]),
      progress_text: 'Done',
    }]);
    mockDownloadAudio.mockResolvedValue(new Blob(['vocal-audio'], { type: 'audio/wav' }));
    mockDecodeAudioData.mockResolvedValue(fakeAudioBuffer(10));
    mockSaveAudioBlob.mockResolvedValue('saved-key');

    await generateVocalReplacement({
      clipId: clip.id,
      vocalStyle: 'soulful R&B',
      lyrics: 'oh baby yeah',
      targetTrackId: vocalTrack.id,
      bpm: 120,
      keyScale: 'C major',
    });

    // Should have called releaseLegoTask with lego params
    expect(mockReleaseLegoTask).toHaveBeenCalledTimes(1);
    const [, params] = mockReleaseLegoTask.mock.calls[0];
    expect(params.task_type).toBe('lego');
    expect(params.track_name).toBe('vocals');
    expect(params.lyrics).toBe('oh baby yeah');
  });
});
