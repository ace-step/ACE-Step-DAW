import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { VoiceProfile } from '../../types/voice';

// Mock idb-keyval before importing
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockKeys = vi.fn();
vi.mock('idb-keyval', () => ({
  get: (...args: unknown[]) => mockGet(...args),
  set: (...args: unknown[]) => mockSet(...args),
  del: (...args: unknown[]) => mockDel(...args),
  keys: (...args: unknown[]) => mockKeys(...args),
}));

import {
  saveVoiceProfile,
  loadVoiceProfile,
  loadVoiceAudio,
  deleteVoiceProfile,
  updateVoiceProfileName,
  listVoiceProfiles,
  validateName,
  validateDuration,
  validateFileSize,
  validateMimeType,
  VoiceProfileError,
} from '../voiceProfileService';

function makeProfile(overrides: Partial<VoiceProfile> = {}): VoiceProfile {
  return {
    id: 'voice-1',
    name: 'My Voice',
    source: 'upload',
    mimeType: 'audio/wav',
    duration: 30,
    fileSize: 1024 * 100,
    waveformPeaks: [0.1, 0.5, 0.8],
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  };
}

function makeBlob(size = 1024 * 100, type = 'audio/wav'): Blob {
  return new Blob([new ArrayBuffer(size)], { type });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockSet.mockResolvedValue(undefined);
  mockDel.mockResolvedValue(undefined);
});

// ── Validation ──

describe('validateName', () => {
  it('accepts a normal name', () => {
    expect(() => validateName('My Voice')).not.toThrow();
  });

  it('rejects empty string', () => {
    expect(() => validateName('')).toThrow(VoiceProfileError);
    expect(() => validateName('  ')).toThrow(VoiceProfileError);
  });

  it('rejects name over 100 characters', () => {
    expect(() => validateName('a'.repeat(101))).toThrow(VoiceProfileError);
  });

  it('throws with INVALID_NAME code', () => {
    try {
      validateName('');
    } catch (e) {
      expect((e as VoiceProfileError).code).toBe('INVALID_NAME');
    }
  });
});

describe('validateDuration', () => {
  it('accepts duration within range', () => {
    expect(() => validateDuration(30)).not.toThrow();
    expect(() => validateDuration(10)).not.toThrow();
    expect(() => validateDuration(300)).not.toThrow();
  });

  it('rejects too short', () => {
    expect(() => validateDuration(5)).toThrow(VoiceProfileError);
  });

  it('rejects too long', () => {
    expect(() => validateDuration(301)).toThrow(VoiceProfileError);
  });

  it('rejects NaN and Infinity', () => {
    expect(() => validateDuration(NaN)).toThrow(VoiceProfileError);
    expect(() => validateDuration(Infinity)).toThrow(VoiceProfileError);
  });
});

describe('validateFileSize', () => {
  it('accepts valid sizes', () => {
    expect(() => validateFileSize(1024)).not.toThrow();
  });

  it('rejects zero', () => {
    expect(() => validateFileSize(0)).toThrow(VoiceProfileError);
  });

  it('rejects over 50 MB', () => {
    expect(() => validateFileSize(51 * 1024 * 1024)).toThrow(VoiceProfileError);
  });
});

describe('validateMimeType', () => {
  it('accepts wav', () => {
    expect(() => validateMimeType('audio/wav')).not.toThrow();
  });

  it('accepts mp3 and flac', () => {
    expect(() => validateMimeType('audio/mpeg')).not.toThrow();
    expect(() => validateMimeType('audio/flac')).not.toThrow();
  });

  it('rejects video/mp4', () => {
    expect(() => validateMimeType('video/mp4')).toThrow(VoiceProfileError);
  });

  it('rejects empty string', () => {
    expect(() => validateMimeType('')).toThrow(VoiceProfileError);
  });
});

// ── CRUD ──

describe('saveVoiceProfile', () => {
  it('stores profile metadata and audio blob with correct keys', async () => {
    const profile = makeProfile();
    const blob = makeBlob();

    await saveVoiceProfile(profile, blob);

    expect(mockSet).toHaveBeenCalledTimes(2);
    expect(mockSet).toHaveBeenCalledWith('voice:voice-1', profile);
    expect(mockSet).toHaveBeenCalledWith('voice-audio:voice-1', blob);
  });

  it('rejects invalid name', async () => {
    const profile = makeProfile({ name: '' });
    const blob = makeBlob();

    await expect(saveVoiceProfile(profile, blob)).rejects.toThrow(
      VoiceProfileError,
    );
    expect(mockSet).not.toHaveBeenCalled();
  });

  it('rejects invalid duration', async () => {
    const profile = makeProfile({ duration: 3 });
    const blob = makeBlob();

    await expect(saveVoiceProfile(profile, blob)).rejects.toThrow(
      VoiceProfileError,
    );
  });

  it('rejects oversized blob', async () => {
    const profile = makeProfile();
    const blob = makeBlob(51 * 1024 * 1024);

    await expect(saveVoiceProfile(profile, blob)).rejects.toThrow(
      VoiceProfileError,
    );
  });

  it('rejects unsupported mime type', async () => {
    const profile = makeProfile({ mimeType: 'video/mp4' });
    const blob = makeBlob();

    await expect(saveVoiceProfile(profile, blob)).rejects.toThrow(
      VoiceProfileError,
    );
  });
});

describe('loadVoiceProfile', () => {
  it('returns profile when found', async () => {
    const profile = makeProfile();
    mockGet.mockResolvedValueOnce(profile);

    const result = await loadVoiceProfile('voice-1');
    expect(result).toEqual(profile);
    expect(mockGet).toHaveBeenCalledWith('voice:voice-1');
  });

  it('returns null when not found', async () => {
    mockGet.mockResolvedValueOnce(undefined);

    const result = await loadVoiceProfile('nonexistent');
    expect(result).toBeNull();
  });
});

describe('loadVoiceAudio', () => {
  it('returns audio blob when found', async () => {
    const blob = makeBlob();
    mockGet.mockResolvedValueOnce(blob);

    const result = await loadVoiceAudio('voice-1');
    expect(result).toBe(blob);
    expect(mockGet).toHaveBeenCalledWith('voice-audio:voice-1');
  });

  it('returns null when not found', async () => {
    mockGet.mockResolvedValueOnce(undefined);

    const result = await loadVoiceAudio('nonexistent');
    expect(result).toBeNull();
  });
});

describe('deleteVoiceProfile', () => {
  it('deletes both metadata and audio', async () => {
    await deleteVoiceProfile('voice-1');

    expect(mockDel).toHaveBeenCalledTimes(2);
    expect(mockDel).toHaveBeenCalledWith('voice:voice-1');
    expect(mockDel).toHaveBeenCalledWith('voice-audio:voice-1');
  });
});

describe('updateVoiceProfileName', () => {
  it('updates name and updatedAt timestamp', async () => {
    const profile = makeProfile();
    mockGet.mockResolvedValueOnce(profile);

    const updated = await updateVoiceProfileName('voice-1', 'New Name');

    expect(updated.name).toBe('New Name');
    expect(updated.updatedAt).toBeGreaterThan(profile.updatedAt);
    expect(mockSet).toHaveBeenCalledWith(
      'voice:voice-1',
      expect.objectContaining({ name: 'New Name' }),
    );
  });

  it('trims whitespace from name', async () => {
    const profile = makeProfile();
    mockGet.mockResolvedValueOnce(profile);

    const updated = await updateVoiceProfileName('voice-1', '  Trimmed  ');
    expect(updated.name).toBe('Trimmed');
  });

  it('throws NOT_FOUND for missing profile', async () => {
    mockGet.mockResolvedValueOnce(undefined);

    await expect(
      updateVoiceProfileName('missing', 'Name'),
    ).rejects.toThrow(VoiceProfileError);
  });

  it('rejects empty name', async () => {
    await expect(
      updateVoiceProfileName('voice-1', ''),
    ).rejects.toThrow(VoiceProfileError);
    // Should not even attempt to load — validation runs first
    expect(mockGet).not.toHaveBeenCalled();
  });
});

describe('listVoiceProfiles', () => {
  it('returns profiles sorted by updatedAt descending', async () => {
    const p1 = makeProfile({ id: 'v1', updatedAt: 1000 });
    const p2 = makeProfile({ id: 'v2', updatedAt: 3000 });
    const p3 = makeProfile({ id: 'v3', updatedAt: 2000 });

    mockKeys.mockResolvedValueOnce([
      'voice:v1',
      'voice:v2',
      'voice:v3',
      'voice-audio:v1', // should be filtered out
      'project:x',      // should be filtered out
    ]);
    mockGet
      .mockResolvedValueOnce(p1)
      .mockResolvedValueOnce(p2)
      .mockResolvedValueOnce(p3);

    const result = await listVoiceProfiles();

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe('v2');
    expect(result[1].id).toBe('v3');
    expect(result[2].id).toBe('v1');
  });

  it('returns empty array when no profiles exist', async () => {
    mockKeys.mockResolvedValueOnce([]);

    const result = await listVoiceProfiles();
    expect(result).toEqual([]);
  });
});
