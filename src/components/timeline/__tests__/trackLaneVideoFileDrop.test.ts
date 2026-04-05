import { describe, it, expect, vi } from 'vitest';
import { processTrackLaneFileDrop } from '../trackLaneFileDrop';

// Mock the videoService module — uses MIME-first logic matching real implementation
vi.mock('../../../services/videoService', () => ({
  isVideoFile: (file: File) => {
    const mimeType = file.type.trim().toLowerCase();
    if (mimeType) {
      return new Set(['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']).has(mimeType);
    }
    return /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(file.name);
  },
}));

function createMockOptions(overrides: Record<string, any> = {}) {
  return {
    file: new File([], 'test.mp4', { type: 'video/mp4' }),
    trackType: 'video' as const,
    trackId: 'track-1',
    startTime: 5,
    wantsQuickSampler: false,
    importAudioFileAsSampler: vi.fn(),
    importAudioFileAsNewQuickSampler: vi.fn(),
    importAudioToTrack: vi.fn(),
    importVideoToTrack: vi.fn(),
    importMidiFile: vi.fn(),
    convertMidiFileToStrudel: vi.fn(),
    applyStrudelCodeToTrack: vi.fn(),
    setOpenStrudelEditor: vi.fn(),
    ...overrides,
  };
}

describe('processTrackLaneFileDrop — video files', () => {
  it('routes MP4 files to importVideoToTrack on video track', async () => {
    const options = createMockOptions({
      file: new File([], 'movie.mp4', { type: 'video/mp4' }),
      trackType: 'video',
    });
    await processTrackLaneFileDrop(options);
    expect(options.importVideoToTrack).toHaveBeenCalledWith(
      options.file,
      'track-1',
      5,
    );
    expect(options.importAudioToTrack).not.toHaveBeenCalled();
  });

  it('routes WebM video files to importVideoToTrack on video track', async () => {
    const options = createMockOptions({
      file: new File([], 'clip.webm', { type: 'video/webm' }),
      trackType: 'video',
    });
    await processTrackLaneFileDrop(options);
    expect(options.importVideoToTrack).toHaveBeenCalledWith(
      options.file,
      'track-1',
      5,
    );
  });

  it('routes MOV files to importVideoToTrack on video track', async () => {
    const options = createMockOptions({
      file: new File([], 'footage.mov', { type: 'video/quicktime' }),
      trackType: 'video',
    });
    await processTrackLaneFileDrop(options);
    expect(options.importVideoToTrack).toHaveBeenCalledWith(
      options.file,
      'track-1',
      5,
    );
  });

  it('does NOT route video files to video handler on non-video tracks', async () => {
    const options = createMockOptions({
      file: new File([], 'movie.mp4', { type: 'video/mp4' }),
      trackType: 'sample',
    });
    await processTrackLaneFileDrop(options);
    expect(options.importVideoToTrack).not.toHaveBeenCalled();
    // video/mp4 is not audio, so it falls through without routing
  });

  it('does NOT route audio files to video handler', async () => {
    const options = createMockOptions({
      file: new File([], 'song.wav', { type: 'audio/wav' }),
      trackType: 'sample',
    });
    await processTrackLaneFileDrop(options);
    expect(options.importVideoToTrack).not.toHaveBeenCalled();
    expect(options.importAudioToTrack).toHaveBeenCalled();
  });

  it('does NOT route MIDI files to video handler', async () => {
    const options = createMockOptions({
      file: new File([], 'song.mid', { type: '' }),
      trackType: 'pianoRoll',
    });
    await processTrackLaneFileDrop(options);
    expect(options.importVideoToTrack).not.toHaveBeenCalled();
    expect(options.importMidiFile).toHaveBeenCalled();
  });

  it('does NOT treat audio/webm as video', async () => {
    const options = createMockOptions({
      file: new File([], 'recording.webm', { type: 'audio/webm' }),
      trackType: 'video',
    });
    await processTrackLaneFileDrop(options);
    // audio/webm is not a video MIME type, so isVideoFile returns false
    expect(options.importVideoToTrack).not.toHaveBeenCalled();
  });
});
