import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isVideoFile,
  classifyCodec,
  validateVideoFile,
  extractVideoMetadata,
  VIDEO_MAX_FILE_SIZE_BYTES,
  SUPPORTED_VIDEO_EXTENSIONS,
} from '../videoService';

describe('videoService', () => {
  describe('isVideoFile', () => {
    it('returns true for .mp4 files', () => {
      const file = new File([''], 'test.mp4', { type: 'video/mp4' });
      expect(isVideoFile(file)).toBe(true);
    });

    it('returns true for .webm files', () => {
      const file = new File([''], 'test.webm', { type: 'video/webm' });
      expect(isVideoFile(file)).toBe(true);
    });

    it('returns true for .mov files', () => {
      const file = new File([''], 'test.mov', { type: 'video/quicktime' });
      expect(isVideoFile(file)).toBe(true);
    });

    it('returns false for .mp3 files', () => {
      const file = new File([''], 'test.mp3', { type: 'audio/mpeg' });
      expect(isVideoFile(file)).toBe(false);
    });

    it('returns false for image files', () => {
      const file = new File([''], 'test.png', { type: 'image/png' });
      expect(isVideoFile(file)).toBe(false);
    });
  });

  describe('classifyCodec', () => {
    it('classifies h264 as inter-frame', () => {
      const result = classifyCodec('avc1.42E01E');
      expect(result.isIntraOnly).toBe(false);
      expect(result.codecFamily).toBe('h264');
    });

    it('classifies vp9 as inter-frame', () => {
      const result = classifyCodec('vp09.00.10.08');
      expect(result.isIntraOnly).toBe(false);
      expect(result.codecFamily).toBe('vp9');
    });

    it('classifies prores as intra-frame', () => {
      const result = classifyCodec('ap4h');
      expect(result.isIntraOnly).toBe(true);
      expect(result.codecFamily).toBe('prores');
    });

    it('classifies mjpeg as intra-frame', () => {
      const result = classifyCodec('mjpg');
      expect(result.isIntraOnly).toBe(true);
      expect(result.codecFamily).toBe('mjpeg');
    });

    it('returns unknown for unrecognized codecs', () => {
      const result = classifyCodec('xyz123');
      expect(result.codecFamily).toBe('unknown');
    });
  });

  describe('validateVideoFile', () => {
    it('rejects files over 500MB', () => {
      const result = validateVideoFile({
        size: VIDEO_MAX_FILE_SIZE_BYTES + 1,
        name: 'huge.mp4',
        type: 'video/mp4',
      } as File);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('500');
    });

    it('accepts files under 500MB with valid extension', () => {
      const result = validateVideoFile({
        size: 1024 * 1024,
        name: 'clip.mp4',
        type: 'video/mp4',
      } as File);
      expect(result.valid).toBe(true);
    });

    it('rejects non-video files', () => {
      const result = validateVideoFile({
        size: 1024,
        name: 'doc.pdf',
        type: 'application/pdf',
      } as File);
      expect(result.valid).toBe(false);
    });
  });

  describe('SUPPORTED_VIDEO_EXTENSIONS', () => {
    it('includes mp4, webm, mov, avi', () => {
      expect(SUPPORTED_VIDEO_EXTENSIONS).toContain('.mp4');
      expect(SUPPORTED_VIDEO_EXTENSIONS).toContain('.webm');
      expect(SUPPORTED_VIDEO_EXTENSIONS).toContain('.mov');
      expect(SUPPORTED_VIDEO_EXTENSIONS).toContain('.avi');
    });
  });

  describe('VIDEO_MAX_FILE_SIZE_BYTES', () => {
    it('is 500MB', () => {
      expect(VIDEO_MAX_FILE_SIZE_BYTES).toBe(500 * 1024 * 1024);
    });
  });
});
