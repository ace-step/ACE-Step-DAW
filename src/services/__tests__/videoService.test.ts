import { describe, it, expect } from 'vitest';
import {
  isVideoFile,
  isIntraFrameCodec,
  validateVideoFile,
  MAX_VIDEO_FILE_SIZE,
} from '../videoService';

describe('videoService', () => {
  describe('isVideoFile', () => {
    it('recognizes video/mp4 MIME type', () => {
      const file = new File([], 'movie.mp4', { type: 'video/mp4' });
      expect(isVideoFile(file)).toBe(true);
    });

    it('recognizes video/webm MIME type', () => {
      const file = new File([], 'movie.webm', { type: 'video/webm' });
      expect(isVideoFile(file)).toBe(true);
    });

    it('recognizes video/quicktime MIME type', () => {
      const file = new File([], 'movie.mov', { type: 'video/quicktime' });
      expect(isVideoFile(file)).toBe(true);
    });

    it('recognizes by extension when MIME is empty', () => {
      const file = new File([], 'movie.mp4', { type: '' });
      expect(isVideoFile(file)).toBe(true);
    });

    it('recognizes .mov extension', () => {
      const file = new File([], 'footage.mov', { type: '' });
      expect(isVideoFile(file)).toBe(true);
    });

    it('recognizes .webm extension', () => {
      const file = new File([], 'clip.webm', { type: '' });
      expect(isVideoFile(file)).toBe(true);
    });

    it('recognizes .mkv extension', () => {
      const file = new File([], 'movie.mkv', { type: '' });
      expect(isVideoFile(file)).toBe(true);
    });

    it('rejects audio files', () => {
      const file = new File([], 'song.mp3', { type: 'audio/mpeg' });
      expect(isVideoFile(file)).toBe(false);
    });

    it('rejects audio/webm (not video/webm)', () => {
      const file = new File([], 'recording.webm', { type: 'audio/webm' });
      expect(isVideoFile(file)).toBe(false);
    });

    it('rejects plain text files', () => {
      const file = new File([], 'notes.txt', { type: 'text/plain' });
      expect(isVideoFile(file)).toBe(false);
    });

    it('rejects image files', () => {
      const file = new File([], 'photo.jpg', { type: 'image/jpeg' });
      expect(isVideoFile(file)).toBe(false);
    });
  });

  describe('isIntraFrameCodec', () => {
    it('identifies ProRes (apcn) as intra-frame', () => {
      expect(isIntraFrameCodec('apcn')).toBe(true);
    });

    it('identifies ProRes HQ (apch) as intra-frame', () => {
      expect(isIntraFrameCodec('apch')).toBe(true);
    });

    it('identifies ProRes 4444 (ap4h) as intra-frame', () => {
      expect(isIntraFrameCodec('ap4h')).toBe(true);
    });

    it('identifies DNxHD (AVdn) as intra-frame', () => {
      expect(isIntraFrameCodec('AVdn')).toBe(true);
    });

    it('identifies Motion JPEG (mjp2) as intra-frame', () => {
      expect(isIntraFrameCodec('mjp2')).toBe(true);
    });

    it('identifies Photo-JPEG as intra-frame', () => {
      expect(isIntraFrameCodec('jpeg')).toBe(true);
    });

    it('does NOT identify H.264 (avc1) as intra-frame', () => {
      expect(isIntraFrameCodec('avc1')).toBe(false);
      expect(isIntraFrameCodec('avc1.64001f')).toBe(false);
    });

    it('does NOT identify VP9 as intra-frame', () => {
      expect(isIntraFrameCodec('vp9')).toBe(false);
      expect(isIntraFrameCodec('vp09.00.10.08')).toBe(false);
    });

    it('does NOT identify AV1 as intra-frame', () => {
      expect(isIntraFrameCodec('av01')).toBe(false);
    });

    it('is case insensitive', () => {
      expect(isIntraFrameCodec('APCN')).toBe(true);
      expect(isIntraFrameCodec('Apch')).toBe(true);
    });
  });

  describe('validateVideoFile', () => {
    it('returns null for valid MP4 under size limit', () => {
      const file = new File([new ArrayBuffer(1024)], 'video.mp4', { type: 'video/mp4' });
      expect(validateVideoFile(file)).toBeNull();
    });

    it('returns error for files exceeding 500 MB', () => {
      // Create a mock file object with a large size
      const file = new File([], 'huge.mp4', { type: 'video/mp4' });
      Object.defineProperty(file, 'size', { value: MAX_VIDEO_FILE_SIZE + 1 });
      const error = validateVideoFile(file);
      expect(error).toContain('too large');
      expect(error).toContain('500 MB');
    });

    it('returns error for unsupported format', () => {
      const file = new File([], 'document.pdf', { type: 'application/pdf' });
      const error = validateVideoFile(file);
      expect(error).toContain('Unsupported format');
      expect(error).toContain('MP4');
      expect(error).toContain('MKV');
    });

    it('accepts WebM files', () => {
      const file = new File([new ArrayBuffer(100)], 'clip.webm', { type: 'video/webm' });
      expect(validateVideoFile(file)).toBeNull();
    });

    it('accepts MOV files', () => {
      const file = new File([new ArrayBuffer(100)], 'footage.mov', { type: 'video/quicktime' });
      expect(validateVideoFile(file)).toBeNull();
    });
  });
});
