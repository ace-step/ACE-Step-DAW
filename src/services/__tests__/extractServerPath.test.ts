import { describe, it, expect } from 'vitest';
import { extractServerPath, sanitizeServerPath } from '../../utils/serverPath';

/**
 * Regression tests for #1702: multi-stem LEGO generation fails when
 * extractServerPath returns absolute paths that the release_task
 * endpoint rejects with "absolute audio file paths are not allowed".
 */
describe('extractServerPath', () => {
  it('returns null for backend audio URLs with absolute query path', () => {
    // Backend returns URLs like /v1/audio?path=/tmp/.../output.wav
    // The extracted path (/tmp/.../output.wav) is absolute → reject
    expect(extractServerPath('/v1/audio?path=/tmp/ace-step/output.wav')).toBeNull();
  });

  it('returns null for raw absolute paths', () => {
    expect(extractServerPath('/tmp/ace-step/output.wav')).toBeNull();
    expect(extractServerPath('/home/user/audio/stem.wav')).toBeNull();
  });

  it('returns relative path from query parameter', () => {
    // If the backend ever returns a relative path, accept it
    expect(extractServerPath('/v1/audio?path=outputs/stem.wav')).toBe('outputs/stem.wav');
  });

  it('returns null for URLs without path query param', () => {
    expect(extractServerPath('/v1/audio')).toBeNull();
    expect(extractServerPath('/v1/audio?format=wav')).toBeNull();
  });

  it('returns null for full HTTP URLs with absolute path param', () => {
    expect(extractServerPath('http://localhost:8000/v1/audio?path=/tmp/output.wav')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractServerPath('')).toBeNull();
  });

  it('returns null for blob URLs', () => {
    expect(extractServerPath('blob:http://localhost/abc-123')).toBeNull();
  });

  it('returns null for Windows absolute paths in query param', () => {
    expect(extractServerPath('/v1/audio?path=C:\\tmp\\output.wav')).toBeNull();
    expect(extractServerPath('/v1/audio?path=D:/users/audio/stem.wav')).toBeNull();
  });

  it('returns null for UNC paths in query param', () => {
    expect(extractServerPath('/v1/audio?path=\\\\server\\share\\output.wav')).toBeNull();
    expect(extractServerPath('/v1/audio?path=//server/share/output.wav')).toBeNull();
  });

  it('rejects persisted absolute server paths before reuse', () => {
    expect(sanitizeServerPath('/tmp/ace-step/output.wav')).toBeNull();
    expect(sanitizeServerPath('C:\\tmp\\output.wav')).toBeNull();
    expect(sanitizeServerPath('\\\\server\\share\\output.wav')).toBeNull();
  });

  it('keeps persisted relative server paths before reuse', () => {
    expect(sanitizeServerPath('outputs/stem.wav')).toBe('outputs/stem.wav');
  });
});
