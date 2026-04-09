import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  createTimbreReference,
  validateTimbreStrength,
  type TimbreReference,
} from '../timbreTransfer';

describe('timbreTransfer', () => {
  describe('createTimbreReference', () => {
    beforeEach(() => {
      vi.spyOn(crypto, 'randomUUID').mockReturnValue('test-uuid-1234');
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('creates a reference with required fields', () => {
      const ref = createTimbreReference({
        sourceType: 'clip',
        audioKey: 'audio:proj1:clip1:isolated',
        name: 'Piano Reference',
      });

      expect(ref.id).toBe('test-uuid-1234');
      expect(ref.sourceType).toBe('clip');
      expect(ref.audioKey).toBe('audio:proj1:clip1:isolated');
      expect(ref.name).toBe('Piano Reference');
    });

    it('defaults strength to 0.5', () => {
      const ref = createTimbreReference({
        sourceType: 'clip',
        audioKey: 'key-1',
        name: 'Test',
      });

      expect(ref.strength).toBe(0.5);
    });

    it('uses provided strength', () => {
      const ref = createTimbreReference({
        sourceType: 'upload',
        audioKey: 'key-1',
        name: 'Test',
        strength: 0.8,
      });

      expect(ref.strength).toBe(0.8);
    });

    it('sets sourceType correctly for upload', () => {
      const ref = createTimbreReference({
        sourceType: 'upload',
        audioKey: 'key-1',
        name: 'Uploaded Sample',
      });

      expect(ref.sourceType).toBe('upload');
    });

    it('includes createdAt timestamp', () => {
      const before = Date.now();
      const ref = createTimbreReference({
        sourceType: 'clip',
        audioKey: 'key-1',
        name: 'Test',
      });
      const after = Date.now();

      expect(ref.createdAt).toBeGreaterThanOrEqual(before);
      expect(ref.createdAt).toBeLessThanOrEqual(after);
    });
  });

  describe('validateTimbreStrength', () => {
    it('returns the value when within range', () => {
      expect(validateTimbreStrength(0.5)).toBe(0.5);
      expect(validateTimbreStrength(0)).toBe(0);
      expect(validateTimbreStrength(1)).toBe(1);
    });

    it('clamps values below 0 to 0', () => {
      expect(validateTimbreStrength(-0.5)).toBe(0);
      expect(validateTimbreStrength(-100)).toBe(0);
    });

    it('clamps values above 1 to 1', () => {
      expect(validateTimbreStrength(1.5)).toBe(1);
      expect(validateTimbreStrength(100)).toBe(1);
    });

    it('handles edge values precisely', () => {
      expect(validateTimbreStrength(0.001)).toBe(0.001);
      expect(validateTimbreStrength(0.999)).toBe(0.999);
    });
  });
});
