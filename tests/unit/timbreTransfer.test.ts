import { describe, it, expect } from 'vitest';
import {
  createTimbreReference,
  validateTimbreStrength,
} from '../../src/services/timbreTransfer';

describe('timbreTransfer', () => {
  describe('createTimbreReference', () => {
    it('creates a reference from a clip audio key', () => {
      const ref = createTimbreReference({
        sourceType: 'clip',
        audioKey: 'audio-123',
        name: 'My Bass Sound',
      });
      expect(ref.id).toBeTruthy();
      expect(ref.sourceType).toBe('clip');
      expect(ref.audioKey).toBe('audio-123');
      expect(ref.name).toBe('My Bass Sound');
      expect(ref.strength).toBe(0.5); // default
    });

    it('creates a reference from an uploaded file', () => {
      const ref = createTimbreReference({
        sourceType: 'upload',
        audioKey: 'upload-456',
        name: 'Reference Track',
        strength: 0.8,
      });
      expect(ref.sourceType).toBe('upload');
      expect(ref.strength).toBe(0.8);
    });

    it('generates unique IDs', () => {
      const ref1 = createTimbreReference({ sourceType: 'clip', audioKey: 'a', name: 'A' });
      const ref2 = createTimbreReference({ sourceType: 'clip', audioKey: 'b', name: 'B' });
      expect(ref1.id).not.toBe(ref2.id);
    });

    it('defaults strength to 0.5 when not provided', () => {
      const ref = createTimbreReference({ sourceType: 'clip', audioKey: 'a', name: 'A' });
      expect(ref.strength).toBe(0.5);
    });
  });

  describe('validateTimbreStrength', () => {
    it('clamps strength between 0 and 1', () => {
      expect(validateTimbreStrength(-0.5)).toBe(0);
      expect(validateTimbreStrength(1.5)).toBe(1);
      expect(validateTimbreStrength(0.7)).toBe(0.7);
    });

    it('handles edge values', () => {
      expect(validateTimbreStrength(0)).toBe(0);
      expect(validateTimbreStrength(1)).toBe(1);
    });
  });
});
