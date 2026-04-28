import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createProjectShare } from '../projectSharingService';
import type { Project } from '../../types/project';
import type { SharedStemAsset } from '../cloudStorageService';

// Mock dependencies
vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: vi.fn().mockReturnValue({
    decodeAudioData: vi.fn().mockResolvedValue({
      duration: 10,
      numberOfChannels: 2,
      sampleRate: 44100,
      length: 441000,
      getChannelData: vi.fn().mockReturnValue(new Float32Array(441000)),
    }),
  }),
}));

vi.mock('../../engine/exportMix', () => ({
  exportMix: vi.fn().mockResolvedValue(new Blob(['audio'], { type: 'audio/mp3' })),
}));

vi.mock('../../engine/offlineRender', () => ({
  renderMidiTrackOffline: vi.fn().mockResolvedValue(null),
  renderSamplerTrackOffline: vi.fn().mockResolvedValue(null),
  renderSequencerTrackOffline: vi.fn().mockResolvedValue({
    duration: 10,
    numberOfChannels: 2,
    sampleRate: 44100,
    length: 441000,
    getChannelData: vi.fn().mockReturnValue(new Float32Array(441000)),
  }),
}));

vi.mock('../../engine/SamplerEngine', () => ({
  createSamplerConfig: vi.fn(),
}));

vi.mock('../audioFileManager', () => ({
  loadAudioBlobByKey: vi.fn().mockResolvedValue(new Blob(['audio'])),
}));

vi.mock('../cloudStorageService', () => ({
  cloudStorage: {
    saveSharedProject: vi.fn().mockResolvedValue({
      token: 'share_test_token',
      projectId: 'proj-1',
      owner: 'TestUser',
      sharedAt: Date.now(),
      project: {},
      stems: [],
    }),
  },
}));

vi.mock('../../utils/audioEncoders', () => ({
  DEFAULT_EXPORT_OPTIONS: { sampleRate: 44100, bitDepth: 16 },
}));

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Test Song',
    bpm: 120,
    totalDuration: 30,
    tracks: [
      {
        id: 't1',
        displayName: 'Vocals',
        color: '#ff0000',
        volume: 0.8,
        pan: 0,
        muted: false,
        soloed: false,
        trackType: 'stems',
        clips: [
          {
            id: 'c1',
            trackId: 't1',
            startTime: 0,
            duration: 10,
            generationStatus: 'ready',
            isolatedAudioKey: 'audio:proj-1:c1:isolated',
            lyrics: 'Hello world',
          },
        ],
        effects: [],
      },
    ],
    ...overrides,
  } as unknown as Project;
}

describe('createProjectShare', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a share URL and record', async () => {
    const project = makeProject();
    const result = await createProjectShare(project, 'https://example.com');

    expect(result.shareUrl).toContain('share=share_test_token');
    expect(result.shareUrl).toContain('project=proj-1');
    expect(result.shareUrl).toContain('mode=player');
    expect(result.record).toBeTruthy();
    expect(result.record.token).toBe('share_test_token');
  });

  it('reports progress for each track', async () => {
    const project = makeProject();
    const onProgress = vi.fn();

    await createProjectShare(project, 'https://example.com', { onProgress });

    // Should report progress for each track + completion
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        completedTracks: 0,
        totalTracks: 1,
        currentTrackName: 'Vocals',
      }),
    );
    expect(onProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        completedTracks: 1,
        totalTracks: 1,
        currentTrackName: 'Upload complete',
      }),
    );
  });

  it('saves shared project to cloud storage', async () => {
    const { cloudStorage } = await import('../cloudStorageService');
    const project = makeProject();

    await createProjectShare(project, 'https://example.com', { owner: 'CustomUser' });

    expect(cloudStorage.saveSharedProject).toHaveBeenCalledWith(
      expect.objectContaining({
        project,
        owner: 'CustomUser',
      }),
    );
  });

  it('defaults owner to "Local user"', async () => {
    const { cloudStorage } = await import('../cloudStorageService');
    const project = makeProject();

    await createProjectShare(project, 'https://example.com');

    expect(cloudStorage.saveSharedProject).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'Local user',
      }),
    );
  });

  it('handles project with no tracks', async () => {
    const project = makeProject({ tracks: [] as Project['tracks'] });
    const result = await createProjectShare(project, 'https://example.com');

    expect(result.shareUrl).toBeTruthy();
    expect(result.record).toBeTruthy();
  });

  it('builds correct URL with base URL path', async () => {
    const project = makeProject();
    const result = await createProjectShare(project, 'https://my-daw.com/app');

    expect(result.shareUrl).toContain('https://my-daw.com/app?');
    expect(result.shareUrl).toContain('share=');
    expect(result.shareUrl).toContain('mode=player');
  });
});
