import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock all heavy dependencies before importing the module under test
const mockLoadAudioBlobByKey = vi.fn();
const mockSaveAudioBlob = vi.fn();
vi.mock('../audioFileManager', () => ({
  loadAudioBlobByKey: (...args: unknown[]) => mockLoadAudioBlobByKey(...args),
  saveAudioBlob: (...args: unknown[]) => mockSaveAudioBlob(...args),
}));

vi.mock('../aceStepApi', () => ({
  default: {
    releaseLegoTask: vi.fn(),
    queryResult: vi.fn(),
    downloadAudio: vi.fn(),
  },
}));

vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({
    decodeAudioData: vi.fn(),
  }),
}));

vi.mock('../../utils/waveformPeaks', () => ({
  computeWaveformPeaks: vi.fn(() => [0.1, 0.3, 0.5]),
  CLIP_WAVEFORM_PEAK_COUNT: 240,
}));

// Minimal toast mock
vi.mock('../../utils/toast', () => ({
  toastInfo: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

// Mock silence generator
vi.mock('../../utils/silenceWav', () => ({
  generateSilenceWav: vi.fn(() => new Blob(['silence'], { type: 'audio/wav' })),
}));

import { useProjectStore } from '../../store/projectStore';
import { useGenerationStore } from '../../store/generationStore';
import { generateCoverClip, generateRepaintClip } from '../generationPipeline';

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
  });

  it('logs warning when sourceAudioOverride key is not found in storage for cover', async () => {
    // Setup a project with a clip that has audio
    useProjectStore.setState({ project: null });
    useProjectStore.getState().createProject();
    const track = useProjectStore.getState().addTrack('stems');
    // Create a clip on the track
    const clip = useProjectStore.getState().addClip(track.id, {
      name: 'Test Clip',
      startTime: 0,
      duration: 5,
      type: 'audio',
    });
    // Set audio keys directly on the store's clip
    const project = useProjectStore.getState().project!;
    const trackObj = project.tracks.find((t) => t.id === track.id)!;
    const storeClip = trackObj.clips.find((c) => c.id === clip.id)!;
    storeClip.isolatedAudioKey = 'real-audio-key';
    storeClip.generationStatus = 'ready';

    // sourceAudioOverride key returns null (not found), but clip's own audio exists
    mockLoadAudioBlobByKey.mockImplementation(async (key: string) => {
      if (key === 'missing-chained-key') return null;
      if (key === 'real-audio-key') return new Blob(['audio'], { type: 'audio/wav' });
      return null;
    });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // This will fail during the API call, but we only care about the warning
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

    // Both keys return valid blobs
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
