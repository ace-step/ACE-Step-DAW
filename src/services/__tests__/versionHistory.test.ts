import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock idb-keyval
const mockGet = vi.fn();
const mockSet = vi.fn();
const mockDel = vi.fn();
const mockKeys = vi.fn();
vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => ({})),
  get: (...args: unknown[]) => mockGet(...args),
  set: (...args: unknown[]) => mockSet(...args),
  del: (...args: unknown[]) => mockDel(...args),
  keys: (...args: unknown[]) => mockKeys(...args),
}));

import {
  saveVersion,
  listVersions,
  listVersionMetadata,
  loadVersion,
  deleteVersion,
  deleteAllVersions,
  pruneVersions,
  type VersionSnapshot,
} from '../versionHistory';
import type { Project } from '../../types/project';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Test Song',
    createdAt: 1000,
    updatedAt: 2000,
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    totalDuration: 60,
    tracks: [],
    generationDefaults: {} as Project['generationDefaults'],
    ...overrides,
  };
}

describe('versionHistory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSet.mockResolvedValue(undefined);
    mockDel.mockResolvedValue(undefined);
  });

  describe('saveVersion', () => {
    it('stores a snapshot with auto-generated id and timestamp', async () => {
      const project = makeProject();
      const snapshot = await saveVersion(project, 'Auto-save');

      expect(snapshot.id).toBeTruthy();
      expect(snapshot.projectId).toBe('proj-1');
      expect(snapshot.label).toBe('Auto-save');
      expect(snapshot.kind).toBe('auto');
      expect(snapshot.savedAt).toBeGreaterThan(0);
      expect(snapshot.trackCount).toBe(0);
      expect(snapshot.bpm).toBe(120);
      expect(mockSet).toHaveBeenCalledWith(
        expect.stringContaining('version:proj-1:'),
        expect.objectContaining({ projectId: 'proj-1' }),
        expect.anything(),
      );
    });

    it('stores the full project data in the snapshot', async () => {
      const project = makeProject({ name: 'My Song', bpm: 140 });
      const snapshot = await saveVersion(project, 'Named save');

      const storedArg = mockSet.mock.calls[0][1] as VersionSnapshot;
      expect(storedArg.project.name).toBe('My Song');
      expect(storedArg.project.bpm).toBe(140);
      expect(storedArg.label).toBe('Named save');
      expect(storedArg.kind).toBe('manual');
    });

    it('uses "Auto-save" as default label', async () => {
      const snapshot = await saveVersion(makeProject());
      expect(snapshot.label).toBe('Auto-save');
    });

    it('falls back when structuredClone is unavailable', async () => {
      const originalStructuredClone = globalThis.structuredClone;
      vi.stubGlobal('structuredClone', undefined);

      try {
        const snapshot = await saveVersion(makeProject({ name: 'Fallback Clone' }));
        expect(snapshot.project.name).toBe('Fallback Clone');
      } finally {
        vi.stubGlobal('structuredClone', originalStructuredClone);
      }
    });
  });

  describe('listVersions', () => {
    it('returns versions for a specific project sorted by newest first', async () => {
      mockKeys.mockResolvedValue([
        'version:proj-1:v1',
        'version:proj-1:v2',
        'version:proj-2:v1',
        'other-key',
      ]);
      mockGet
        .mockResolvedValueOnce({
          id: 'v1', projectId: 'proj-1', savedAt: 1000,
          label: 'First', kind: 'auto', trackCount: 2, bpm: 120, project: makeProject(),
        })
        .mockResolvedValueOnce({
          id: 'v2', projectId: 'proj-1', savedAt: 2000,
          label: 'Second', kind: 'auto', trackCount: 3, bpm: 130, project: makeProject(),
        });

      const versions = await listVersions('proj-1');

      expect(versions).toHaveLength(2);
      expect(versions[0].savedAt).toBe(2000);
      expect(versions[1].savedAt).toBe(1000);
    });

    it('returns empty array when no versions exist', async () => {
      mockKeys.mockResolvedValue([]);
      const versions = await listVersions('proj-1');
      expect(versions).toEqual([]);
    });

    it('can list metadata without retaining full project snapshots', async () => {
      mockKeys.mockResolvedValue(['version:proj-1:v1']);
      mockGet.mockResolvedValueOnce({
        id: 'v1', projectId: 'proj-1', savedAt: 1000,
        label: 'First', kind: 'manual', trackCount: 2, bpm: 120, project: makeProject(),
      });

      const versions = await listVersionMetadata('proj-1');

      expect(versions).toEqual([
        {
          id: 'v1',
          projectId: 'proj-1',
          savedAt: 1000,
          label: 'First',
          kind: 'manual',
          trackCount: 2,
          bpm: 120,
        },
      ]);
    });
  });

  describe('loadVersion', () => {
    it('retrieves a full version snapshot', async () => {
      const project = makeProject();
      const stored: VersionSnapshot = {
        id: 'v1',
        projectId: 'proj-1',
        savedAt: 1000,
        label: 'Test',
        kind: 'manual',
        trackCount: 0,
        bpm: 120,
        project,
      };
      mockGet.mockResolvedValue(stored);

      const result = await loadVersion('proj-1', 'v1');

      expect(result).not.toBeNull();
      expect(result!.project.name).toBe('Test Song');
      expect(mockGet).toHaveBeenCalledWith('version:proj-1:v1', expect.anything());
    });

    it('returns null for non-existent version', async () => {
      mockGet.mockResolvedValue(undefined);
      const result = await loadVersion('proj-1', 'nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('deleteVersion', () => {
    it('removes a version from storage', async () => {
      await deleteVersion('proj-1', 'v1');
      expect(mockDel).toHaveBeenCalledWith('version:proj-1:v1', expect.anything());
    });

    it('removes all versions for a project', async () => {
      mockKeys.mockResolvedValue(['version:proj-1:v1', 'version:proj-1:v2']);
      mockGet
        .mockResolvedValueOnce({ id: 'v1', projectId: 'proj-1', savedAt: 1000, label: 'A', kind: 'auto', trackCount: 0, bpm: 120, project: makeProject() })
        .mockResolvedValueOnce({ id: 'v2', projectId: 'proj-1', savedAt: 2000, label: 'B', kind: 'manual', trackCount: 0, bpm: 120, project: makeProject() });

      const deleted = await deleteAllVersions('proj-1');

      expect(deleted).toBe(2);
      expect(mockDel).toHaveBeenCalledWith('version:proj-1:v1', expect.anything());
      expect(mockDel).toHaveBeenCalledWith('version:proj-1:v2', expect.anything());
    });
  });

  describe('pruneVersions', () => {
    it('keeps only the most recent N versions', async () => {
      mockKeys.mockResolvedValue([
        'version:proj-1:v1',
        'version:proj-1:v2',
        'version:proj-1:v3',
        'version:proj-1:v4',
      ]);
      mockGet
        .mockResolvedValueOnce({ id: 'v1', projectId: 'proj-1', savedAt: 1000, label: 'A', kind: 'auto', trackCount: 0, bpm: 120, project: makeProject() })
        .mockResolvedValueOnce({ id: 'v2', projectId: 'proj-1', savedAt: 2000, label: 'B', kind: 'auto', trackCount: 0, bpm: 120, project: makeProject() })
        .mockResolvedValueOnce({ id: 'v3', projectId: 'proj-1', savedAt: 3000, label: 'C', kind: 'auto', trackCount: 0, bpm: 120, project: makeProject() })
        .mockResolvedValueOnce({ id: 'v4', projectId: 'proj-1', savedAt: 4000, label: 'D', kind: 'auto', trackCount: 0, bpm: 120, project: makeProject() });

      const deleted = await pruneVersions('proj-1', 2);

      expect(deleted).toBe(2);
      // Should delete the two oldest (v1, v2)
      expect(mockDel).toHaveBeenCalledWith('version:proj-1:v1', expect.anything());
      expect(mockDel).toHaveBeenCalledWith('version:proj-1:v2', expect.anything());
      expect(mockDel).not.toHaveBeenCalledWith('version:proj-1:v3', expect.anything());
      expect(mockDel).not.toHaveBeenCalledWith('version:proj-1:v4', expect.anything());
    });

    it('does not prune manual save points', async () => {
      mockKeys.mockResolvedValue([
        'version:proj-1:auto-1',
        'version:proj-1:auto-2',
        'version:proj-1:manual-1',
      ]);
      mockGet
        .mockResolvedValueOnce({ id: 'auto-1', projectId: 'proj-1', savedAt: 1000, label: 'Auto', kind: 'auto', trackCount: 0, bpm: 120, project: makeProject() })
        .mockResolvedValueOnce({ id: 'auto-2', projectId: 'proj-1', savedAt: 2000, label: 'Auto', kind: 'auto', trackCount: 0, bpm: 120, project: makeProject() })
        .mockResolvedValueOnce({ id: 'manual-1', projectId: 'proj-1', savedAt: 500, label: 'Manual', kind: 'manual', trackCount: 0, bpm: 120, project: makeProject() });

      const deleted = await pruneVersions('proj-1', 1);

      expect(deleted).toBe(1);
      expect(mockDel).toHaveBeenCalledWith('version:proj-1:auto-1', expect.anything());
      expect(mockDel).not.toHaveBeenCalledWith('version:proj-1:manual-1', expect.anything());
    });

    it('does nothing when under the limit', async () => {
      mockKeys.mockResolvedValue(['version:proj-1:v1']);
      mockGet.mockResolvedValueOnce({ id: 'v1', projectId: 'proj-1', savedAt: 1000, label: 'A', kind: 'auto', trackCount: 0, bpm: 120, project: makeProject() });

      const deleted = await pruneVersions('proj-1', 5);
      expect(deleted).toBe(0);
      expect(mockDel).not.toHaveBeenCalled();
    });
  });
});
