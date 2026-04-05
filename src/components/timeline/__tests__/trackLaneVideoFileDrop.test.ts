import { describe, it, expect, vi } from 'vitest';
import { processTrackLaneFileDrop } from '../trackLaneFileDrop';

// Mock the videoService module
vi.mock('../../../services/videoService', () => ({
  isVideoFile: (file: File) =>
    file.type.startsWith('video/') || /\.(mp4|mov|webm|mkv|avi|m4v)$/i.test(file.name),
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
  it('routes MP4 files to importVideoToTrack', async () => {
    const options = createMockOptions({
      file: new File([], 'movie.mp4', { type: 'video/mp4' }),
    });
    await processTrackLaneFileDrop(options);
    expect(options.importVideoToTrack).toHaveBeenCalledWith(
      options.file,
      'track-1',
      5,
    );
    expect(options.importAudioToTrack).not.toHaveBeenCalled();
  });

  it('routes WebM video files to importVideoToTrack', async () => {
    const options = createMockOptions({
      file: new File([], 'clip.webm', { type: 'video/webm' }),
    });
    await processTrackLaneFileDrop(options);
    expect(options.importVideoToTrack).toHaveBeenCalledWith(
      options.file,
      'track-1',
      5,
    );
  });

  it('routes MOV files to importVideoToTrack', async () => {
    const options = createMockOptions({
      file: new File([], 'footage.mov', { type: 'video/quicktime' }),
    });
    await processTrackLaneFileDrop(options);
    expect(options.importVideoToTrack).toHaveBeenCalledWith(
      options.file,
      'track-1',
      5,
    );
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

  it('video detection takes priority over audio for .webm files with video type', async () => {
    // .webm can be audio or video; video/ MIME should route to video handler
    const options = createMockOptions({
      file: new File([], 'recording.webm', { type: 'video/webm' }),
    });
    await processTrackLaneFileDrop(options);
    expect(options.importVideoToTrack).toHaveBeenCalled();
    expect(options.importAudioToTrack).not.toHaveBeenCalled();
  });
});
