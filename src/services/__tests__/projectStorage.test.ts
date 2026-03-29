import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock idb-keyval before importing the module under test
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

import { saveProject, loadProject } from '../projectStorage';
import type { Project } from '../../types/project';

function makeMinimalProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'test-id',
    name: 'Test',
    createdAt: 1000,
    updatedAt: 2000,
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    totalDuration: 60,
    tracks: [],
    generationDefaults: {} as Project['generationDefaults'],
    ...overrides,
  } as Project;
}

describe('projectStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSet.mockResolvedValue(undefined);
  });

  describe('saveProject', () => {
    it('stores the project object directly without JSON.stringify', async () => {
      const project = makeMinimalProject();
      await saveProject(project);

      expect(mockSet).toHaveBeenCalledTimes(1);
      const [key, value] = mockSet.mock.calls[0];
      expect(key).toBe('project:test-id');
      // Value should be the object itself, not a JSON string
      expect(typeof value).toBe('object');
      expect(value).toEqual(project);
    });
  });

  describe('loadProject', () => {
    it('loads a project stored as an object (new format)', async () => {
      const project = makeMinimalProject();
      mockGet.mockResolvedValue(project);

      const loaded = await loadProject('test-id');
      expect(loaded).toEqual(project);
    });

    it('loads a project stored as a JSON string (legacy format)', async () => {
      const project = makeMinimalProject();
      mockGet.mockResolvedValue(JSON.stringify(project));

      const loaded = await loadProject('test-id');
      expect(loaded).toEqual(project);
    });

    it('returns null when project not found', async () => {
      mockGet.mockResolvedValue(undefined);

      const loaded = await loadProject('nonexistent');
      expect(loaded).toBeNull();
    });
  });
});
