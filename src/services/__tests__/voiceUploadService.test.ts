import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock idb-keyval
vi.mock('idb-keyval', () => ({
  get: vi.fn(),
  set: vi.fn().mockResolvedValue(undefined),
  del: vi.fn().mockResolvedValue(undefined),
  keys: vi.fn().mockResolvedValue([]),
}));

import { useVoiceStore, MIN_VOICE_SAMPLE_DURATION } from '../../store/voiceStore';
import { uploadVoiceFile } from '../voiceUploadService';
import { audioBufferToWavBlob } from '../../utils/wav';

// Mock AudioContext — must be a class-like constructor
const mockDecodeAudioData = vi.fn();
const mockClose = vi.fn().mockResolvedValue(undefined);

class MockAudioContext {
  decodeAudioData = mockDecodeAudioData;
  close = mockClose;
}

vi.stubGlobal('AudioContext', MockAudioContext);

function makeAudioBuffer(duration: number, sampleRate = 44100): AudioBuffer {
  const numFrames = Math.round(duration * sampleRate);
  const channelData = new Float32Array(numFrames);
  // Fill with a simple sine wave
  for (let i = 0; i < numFrames; i++) {
    channelData[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
  }
  return {
    duration,
    sampleRate,
    numberOfChannels: 1,
    length: numFrames,
    getChannelData: () => channelData,
    copyFromChannel: vi.fn(),
    copyToChannel: vi.fn(),
  } as unknown as AudioBuffer;
}

function makeFile(name: string, type: string, size = 1024): File {
  const content = new Uint8Array(size);
  return new File([content], name, { type });
}

describe('voiceUploadService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    useVoiceStore.setState(useVoiceStore.getInitialState(), true);
  });

  describe('uploadVoiceFile', () => {
    it('rejects unsupported file types', async () => {
      const file = makeFile('test.pdf', 'application/pdf');
      const result = await uploadVoiceFile(file);

      expect(result).toBeNull();
      expect(useVoiceStore.getState().error).toContain('Unsupported file type');
    });

    it('accepts WAV files', async () => {
      mockDecodeAudioData.mockResolvedValueOnce(makeAudioBuffer(45));
      const file = makeFile('my-voice.wav', 'audio/wav');
      const result = await uploadVoiceFile(file);

      expect(result).toBeTruthy();
      expect(useVoiceStore.getState().profiles).toHaveLength(1);
      expect(useVoiceStore.getState().profiles[0].name).toBe('my-voice');
    });

    it('accepts MP3 files', async () => {
      mockDecodeAudioData.mockResolvedValueOnce(makeAudioBuffer(60));
      const file = makeFile('singer.mp3', 'audio/mpeg');
      const result = await uploadVoiceFile(file);

      expect(result).toBeTruthy();
      expect(useVoiceStore.getState().profiles[0].name).toBe('singer');
    });

    it('accepts FLAC files', async () => {
      mockDecodeAudioData.mockResolvedValueOnce(makeAudioBuffer(45));
      const file = makeFile('vocal.flac', 'audio/flac');
      const result = await uploadVoiceFile(file);

      expect(result).toBeTruthy();
    });

    it('accepts files by extension when MIME type is missing', async () => {
      mockDecodeAudioData.mockResolvedValueOnce(makeAudioBuffer(45));
      const file = makeFile('recording.wav', '');
      const result = await uploadVoiceFile(file);

      expect(result).toBeTruthy();
    });

    it('rejects samples shorter than minimum duration', async () => {
      mockDecodeAudioData.mockResolvedValueOnce(makeAudioBuffer(15));
      const file = makeFile('short.wav', 'audio/wav');
      const result = await uploadVoiceFile(file);

      expect(result).toBeNull();
      expect(useVoiceStore.getState().error).toContain(`${MIN_VOICE_SAMPLE_DURATION}`);
    });

    it('sets error on decode failure', async () => {
      mockDecodeAudioData.mockRejectedValueOnce(new Error('Invalid audio data'));
      const file = makeFile('corrupt.wav', 'audio/wav');
      const result = await uploadVoiceFile(file);

      expect(result).toBeNull();
      expect(useVoiceStore.getState().error).toContain('Invalid audio data');
    });

    it('strips file extension from profile name', async () => {
      mockDecodeAudioData.mockResolvedValueOnce(makeAudioBuffer(45));
      const file = makeFile('my.voice.sample.wav', 'audio/wav');
      const result = await uploadVoiceFile(file);

      expect(result).toBeTruthy();
      expect(useVoiceStore.getState().profiles[0].name).toBe('my.voice.sample');
    });
  });

  describe('audioBufferToWavBlob', () => {
    it('produces a valid WAV blob', () => {
      const buffer = makeAudioBuffer(1, 44100);
      const blob = audioBufferToWavBlob(buffer);

      expect(blob.type).toBe('audio/wav');
      expect(blob.size).toBeGreaterThan(44); // At least header size
    });

    it('has correct size for mono 16-bit audio', () => {
      const sampleRate = 44100;
      const duration = 1;
      const buffer = makeAudioBuffer(duration, sampleRate);
      const blob = audioBufferToWavBlob(buffer);

      const expectedFrames = Math.round(duration * sampleRate);
      const expectedSize = 44 + expectedFrames * 2; // header + 16-bit mono
      expect(blob.size).toBe(expectedSize);
    });
  });
});
