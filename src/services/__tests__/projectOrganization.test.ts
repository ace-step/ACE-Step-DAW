import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  getProjectMeta,
  setProjectMeta,
  deleteProjectMeta,
  listProjectMetas,
  toggleFavorite,
  setProjectFolder,
  addProjectTag,
  removeProjectTag,
  searchProjects,
  type ProjectMeta,
} from '../projectOrganization';

function makeMeta(overrides: Partial<ProjectMeta> = {}): ProjectMeta {
  return {
    projectId: 'proj-1',
    folder: null,
    tags: [],
    isFavorite: false,
    color: null,
    notes: '',
    ...overrides,
  };
}

describe('projectOrganization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSet.mockResolvedValue(undefined);
    mockDel.mockResolvedValue(undefined);
  });

  describe('getProjectMeta / setProjectMeta', () => {
    it('returns default meta when none exists', async () => {
      mockGet.mockResolvedValue(undefined);
      const meta = await getProjectMeta('proj-1');
      expect(meta.projectId).toBe('proj-1');
      expect(meta.folder).toBeNull();
      expect(meta.tags).toEqual([]);
      expect(meta.isFavorite).toBe(false);
    });

    it('stores and retrieves project meta', async () => {
      const meta = makeMeta({ folder: 'demos', tags: ['rock', 'draft'] });
      await setProjectMeta(meta);
      expect(mockSet).toHaveBeenCalledWith('meta:proj-1', meta, expect.anything());
    });

    it('deletes project meta', async () => {
      await deleteProjectMeta('proj-1');
      expect(mockDel).toHaveBeenCalledWith('meta:proj-1', expect.anything());
    });
  });

  describe('toggleFavorite', () => {
    it('toggles favorite status on', async () => {
      mockGet.mockResolvedValue(makeMeta({ isFavorite: false }));
      const result = await toggleFavorite('proj-1');
      expect(result.isFavorite).toBe(true);
      expect(mockSet).toHaveBeenCalledWith('meta:proj-1', expect.objectContaining({ isFavorite: true }), expect.anything());
    });

    it('toggles favorite status off', async () => {
      mockGet.mockResolvedValue(makeMeta({ isFavorite: true }));
      const result = await toggleFavorite('proj-1');
      expect(result.isFavorite).toBe(false);
    });
  });

  describe('setProjectFolder', () => {
    it('assigns a folder to a project', async () => {
      mockGet.mockResolvedValue(makeMeta());
      await setProjectFolder('proj-1', 'demos');
      expect(mockSet).toHaveBeenCalledWith('meta:proj-1', expect.objectContaining({ folder: 'demos' }), expect.anything());
    });

    it('clears folder with null', async () => {
      mockGet.mockResolvedValue(makeMeta({ folder: 'demos' }));
      await setProjectFolder('proj-1', null);
      expect(mockSet).toHaveBeenCalledWith('meta:proj-1', expect.objectContaining({ folder: null }), expect.anything());
    });
  });

  describe('addProjectTag / removeProjectTag', () => {
    it('adds a tag', async () => {
      mockGet.mockResolvedValue(makeMeta({ tags: ['rock'] }));
      const result = await addProjectTag('proj-1', 'draft');
      expect(result.tags).toEqual(['rock', 'draft']);
    });

    it('does not duplicate tags', async () => {
      mockGet.mockResolvedValue(makeMeta({ tags: ['rock'] }));
      const result = await addProjectTag('proj-1', 'rock');
      expect(result.tags).toEqual(['rock']);
    });

    it('removes a tag', async () => {
      mockGet.mockResolvedValue(makeMeta({ tags: ['rock', 'draft'] }));
      const result = await removeProjectTag('proj-1', 'draft');
      expect(result.tags).toEqual(['rock']);
    });
  });

  describe('listProjectMetas', () => {
    it('returns all project metas', async () => {
      mockKeys.mockResolvedValue(['meta:proj-1', 'meta:proj-2', 'other-key']);
      mockGet
        .mockResolvedValueOnce(makeMeta({ projectId: 'proj-1', folder: 'demos' }))
        .mockResolvedValueOnce(makeMeta({ projectId: 'proj-2', isFavorite: true }));

      const metas = await listProjectMetas();
      expect(metas).toHaveLength(2);
      expect(metas[0].projectId).toBe('proj-1');
      expect(metas[1].projectId).toBe('proj-2');
    });
  });

  describe('searchProjects', () => {
    it('filters by folder', () => {
      const metas = [
        makeMeta({ projectId: 'p1', folder: 'demos' }),
        makeMeta({ projectId: 'p2', folder: 'releases' }),
        makeMeta({ projectId: 'p3', folder: null }),
      ];
      const result = searchProjects(metas, { folder: 'demos' });
      expect(result).toHaveLength(1);
      expect(result[0].projectId).toBe('p1');
    });

    it('filters by tag', () => {
      const metas = [
        makeMeta({ projectId: 'p1', tags: ['rock', 'draft'] }),
        makeMeta({ projectId: 'p2', tags: ['jazz'] }),
      ];
      const result = searchProjects(metas, { tag: 'rock' });
      expect(result).toHaveLength(1);
      expect(result[0].projectId).toBe('p1');
    });

    it('filters favorites only', () => {
      const metas = [
        makeMeta({ projectId: 'p1', isFavorite: true }),
        makeMeta({ projectId: 'p2', isFavorite: false }),
      ];
      const result = searchProjects(metas, { favoritesOnly: true });
      expect(result).toHaveLength(1);
      expect(result[0].projectId).toBe('p1');
    });

    it('combines multiple filters', () => {
      const metas = [
        makeMeta({ projectId: 'p1', folder: 'demos', tags: ['rock'], isFavorite: true }),
        makeMeta({ projectId: 'p2', folder: 'demos', tags: ['jazz'], isFavorite: false }),
        makeMeta({ projectId: 'p3', folder: 'releases', tags: ['rock'], isFavorite: true }),
      ];
      const result = searchProjects(metas, { folder: 'demos', favoritesOnly: true });
      expect(result).toHaveLength(1);
      expect(result[0].projectId).toBe('p1');
    });
  });
});
