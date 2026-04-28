import { describe, it, expect } from 'vitest';
import { classifyGenerationError, type GenerationErrorCategory } from '../generationErrorClassifier';

describe('classifyGenerationError', () => {
  describe('network errors', () => {
    it.each([
      'Failed to fetch',
      'NetworkError when attempting to fetch resource',
      'Network request failed',
      'net::ERR_CONNECTION_REFUSED',
      'ERR_INTERNET_DISCONNECTED',
      'The Internet connection appears to be offline',
      'ECONNREFUSED',
      'ENOTFOUND',
      'Load failed',
    ])('classifies "%s" as network', (message) => {
      const result = classifyGenerationError(message);
      expect(result.category).toBe('network' satisfies GenerationErrorCategory);
      expect(result.suggestion.length).toBeGreaterThan(0);
      expect(result.retryable).toBe(true);
    });
  });

  describe('timeout errors', () => {
    it.each([
      'Generation timed out',
      'Request timed out after 120000ms',
      'Generation timed out — the server did not return a result within the time limit.',
      'Cover generation timed out — the server did not return a result',
      'AbortError: The operation was aborted',
      'The operation timed out',
      'timeout of 60000ms exceeded',
    ])('classifies "%s" as timeout', (message) => {
      const result = classifyGenerationError(message);
      expect(result.category).toBe('timeout' satisfies GenerationErrorCategory);
      expect(result.retryable).toBe(true);
    });
  });

  describe('rate limit errors', () => {
    it.each([
      'Rate limit exceeded',
      '429 Too Many Requests',
      'rate_limit_exceeded',
      'You have exceeded the rate limit',
      'Too many requests, please slow down',
      'throttled',
    ])('classifies "%s" as rate-limited', (message) => {
      const result = classifyGenerationError(message);
      expect(result.category).toBe('rate-limited' satisfies GenerationErrorCategory);
      expect(result.retryable).toBe(true);
      expect(result.retryDelaySeconds).toBeGreaterThan(0);
    });
  });

  describe('model errors', () => {
    it.each([
      'Generation failed: CUDA out of memory',
      'Generation failed: Model inference error',
      'Generation failed: Internal server error',
      'Model switch failed: Model not found',
      '500 Internal Server Error',
      '503 Service Unavailable',
      'Generation failed: invalid parameter',
    ])('classifies "%s" as model-error', (message) => {
      const result = classifyGenerationError(message);
      expect(result.category).toBe('model-error' satisfies GenerationErrorCategory);
    });
  });

  describe('unknown errors', () => {
    it('classifies empty message as unknown', () => {
      const result = classifyGenerationError('');
      expect(result.category).toBe('unknown' satisfies GenerationErrorCategory);
      expect(result.retryable).toBe(true);
    });

    it('classifies undefined message as unknown', () => {
      const result = classifyGenerationError(undefined);
      expect(result.category).toBe('unknown');
    });

    it('classifies unrecognized error as unknown', () => {
      const result = classifyGenerationError('Something completely unexpected happened');
      expect(result.category).toBe('unknown');
    });
  });

  describe('suggestion quality', () => {
    it('network suggestion mentions checking connection', () => {
      const result = classifyGenerationError('Failed to fetch');
      expect(result.suggestion).toMatch(/network|connection|backend/i);
    });

    it('timeout suggestion mentions retry or duration', () => {
      const result = classifyGenerationError('Generation timed out');
      expect(result.suggestion).toMatch(/retry|duration|shorter/i);
    });

    it('rate limit suggestion mentions waiting', () => {
      const result = classifyGenerationError('Rate limit exceeded');
      expect(result.suggestion).toMatch(/wait|moment|seconds/i);
    });

    it('model error suggestion mentions settings or backend', () => {
      const result = classifyGenerationError('Generation failed: CUDA out of memory');
      expect(result.suggestion).toMatch(/setting|parameter|backend|steps/i);
    });
  });
});
