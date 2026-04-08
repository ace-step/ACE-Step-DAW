import { describe, it, expect, vi } from 'vitest';
import {
  encodeBufferToFormat,
  batchEncodeBuffer,
  buildAutoFilledMetadata,
  type BatchExportResult,
} from '../batchExport';
import type { ExportMetadataExtended } from '../../types/exportPresets';

// Mock AudioBuffer for testing
function createMockAudioBuffer(duration = 1, sampleRate = 48000): AudioBuffer {
  const length = Math.ceil(duration * sampleRate);
  const buffer = {
    length,
    duration,
    sampleRate,
    numberOfChannels: 2,
    getChannelData: (ch: number) => new Float32Array(length),
  } as unknown as AudioBuffer;
  return buffer;
}

describe('batchExport', () => {
  describe('encodeBufferToFormat', () => {
    it('encodes to WAV 16-bit', () => {
      const buffer = createMockAudioBuffer(0.1, 44100);
      const blob = encodeBufferToFormat(buffer, 'wav', {
        bitDepth: 16,
        mp3Bitrate: 320,
        oggQuality: 0.5,
      });
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('audio/wav');
      expect(blob.size).toBeGreaterThan(0);
    });

    it('encodes to WAV 24-bit', () => {
      const buffer = createMockAudioBuffer(0.1, 44100);
      const blob = encodeBufferToFormat(buffer, 'wav', { bitDepth: 24, mp3Bitrate: 320, oggQuality: 0.5 });
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it('encodes to MP3 with metadata', () => {
      const buffer = createMockAudioBuffer(0.1, 44100);
      const blob = encodeBufferToFormat(buffer, 'mp3', {
        bitDepth: 16,
        mp3Bitrate: 320,
        oggQuality: 0.5,
        metadata: { title: 'Test', artist: 'Bot', bpm: 120, key: 'C major' },
      });
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('audio/mpeg');
    });

    it('encodes to FLAC with metadata', () => {
      const buffer = createMockAudioBuffer(0.1, 44100);
      const blob = encodeBufferToFormat(buffer, 'flac', {
        bitDepth: 16,
        mp3Bitrate: 320,
        oggQuality: 0.5,
        metadata: { title: 'Test', bpm: 140, key: 'A minor' },
      });
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('audio/flac');
    });

    // OGG encoding requires browser MediaRecorder — skip in unit tests
  });

  describe('batchEncodeBuffer', () => {
    it('encodes a buffer to multiple formats', () => {
      const buffer = createMockAudioBuffer(0.1, 44100);
      const results = batchEncodeBuffer(buffer, ['wav', 'mp3', 'flac'], {
        bitDepth: 16,
        mp3Bitrate: 320,
        oggQuality: 0.5,
      });
      expect(results.length).toBe(3);
      expect(results.map((r) => r.format)).toEqual(['wav', 'mp3', 'flac']);
      for (const result of results) {
        expect(result.blob).toBeInstanceOf(Blob);
        expect(result.blob.size).toBeGreaterThan(0);
      }
    });

    it('returns empty array for empty formats list', () => {
      const buffer = createMockAudioBuffer(0.1, 44100);
      const results = batchEncodeBuffer(buffer, [], {
        bitDepth: 16,
        mp3Bitrate: 320,
        oggQuality: 0.5,
      });
      expect(results).toEqual([]);
    });

    it('encodes single format', () => {
      const buffer = createMockAudioBuffer(0.1, 44100);
      const results = batchEncodeBuffer(buffer, ['mp3'], {
        bitDepth: 16,
        mp3Bitrate: 256,
        oggQuality: 0.5,
      });
      expect(results.length).toBe(1);
      expect(results[0].format).toBe('mp3');
    });

    it('includes metadata in all encoded formats', () => {
      const buffer = createMockAudioBuffer(0.1, 44100);
      const metadata: ExportMetadataExtended = { title: 'Song', artist: 'Me', bpm: 128 };
      const results = batchEncodeBuffer(buffer, ['mp3', 'flac'], {
        bitDepth: 16,
        mp3Bitrate: 320,
        oggQuality: 0.5,
        metadata,
      });
      // Both should encode successfully with metadata
      expect(results.length).toBe(2);
      expect(results[0].blob.size).toBeGreaterThan(0);
      expect(results[1].blob.size).toBeGreaterThan(0);
    });
  });

  describe('buildAutoFilledMetadata', () => {
    it('fills metadata from project state', () => {
      const meta = buildAutoFilledMetadata({
        projectName: 'My Song',
        bpm: 128,
        key: 'C major',
      });
      expect(meta.title).toBe('My Song');
      expect(meta.bpm).toBe(128);
      expect(meta.key).toBe('C major');
    });

    it('merges with existing metadata (existing takes precedence)', () => {
      const meta = buildAutoFilledMetadata(
        { projectName: 'Auto Title', bpm: 120, key: 'D minor' },
        { title: 'Manual Title', artist: 'Manual Artist' },
      );
      expect(meta.title).toBe('Manual Title');
      expect(meta.artist).toBe('Manual Artist');
      expect(meta.bpm).toBe(120);
      expect(meta.key).toBe('D minor');
    });

    it('uses project name as title when no manual title', () => {
      const meta = buildAutoFilledMetadata(
        { projectName: 'Untitled', bpm: 90 },
        { artist: 'Artist' },
      );
      expect(meta.title).toBe('Untitled');
      expect(meta.artist).toBe('Artist');
      expect(meta.bpm).toBe(90);
    });

    it('handles empty project state gracefully', () => {
      const meta = buildAutoFilledMetadata({});
      expect(meta.title).toBeUndefined();
      expect(meta.bpm).toBeUndefined();
      expect(meta.key).toBeUndefined();
    });
  });
});
