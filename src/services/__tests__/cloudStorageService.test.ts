import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cloudStorage, resetCloudStorage } from '../cloudStorageService';
import type { Project } from '../../types/project';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: `proj-${Date.now()}`,
    name: 'Test Project',
    bpm: 120,
    tracks: [],
    updatedAt: Date.now(),
    ...overrides,
  } as Project;
}

describe('cloudStorageService', () => {
  beforeEach(() => {
    resetCloudStorage();
  });

  describe('save', () => {
    it('saves a project and returns a CloudProject record', async () => {
      const project = makeProject({ id: 'p1', name: 'My Song' });
      const result = await cloudStorage.save(project, 'TestUser');

      expect(result.projectId).toBe('p1');
      expect(result.owner).toBe('TestUser');
      expect(result.version).toBe(1);
      expect(result.project.name).toBe('My Song');
    });

    it('increments version on subsequent saves', async () => {
      const project = makeProject({ id: 'p1' });

      const v1 = await cloudStorage.save(project, 'TestUser');
      expect(v1.version).toBe(1);

      const v2 = await cloudStorage.save(project, 'TestUser');
      expect(v2.version).toBe(2);

      const v3 = await cloudStorage.save(project, 'TestUser');
      expect(v3.version).toBe(3);
    });

    it('deep clones the project on save', async () => {
      const project = makeProject({ id: 'p1', name: 'Original' });
      const result = await cloudStorage.save(project, 'user');

      // Modify the original after saving
      project.name = 'Modified';

      // The saved version should still have the original name
      expect(result.project.name).toBe('Original');
    });

    it('generates a unique cloudId', async () => {
      const project = makeProject({ id: 'p1' });

      const v1 = await cloudStorage.save(project, 'user');
      const v2 = await cloudStorage.save(project, 'user');

      expect(v1.cloudId).toBeTruthy();
      expect(v2.cloudId).toBeTruthy();
      expect(v1.cloudId).not.toBe(v2.cloudId);
    });
  });

  describe('load', () => {
    it('loads a previously saved project', async () => {
      const project = makeProject({ id: 'p1', name: 'Loaded' });
      await cloudStorage.save(project, 'user');

      const loaded = await cloudStorage.load('p1');

      expect(loaded).not.toBeNull();
      expect(loaded!.project.name).toBe('Loaded');
    });

    it('returns null for non-existent projects', async () => {
      const loaded = await cloudStorage.load('nonexistent');
      expect(loaded).toBeNull();
    });
  });

  describe('list', () => {
    it('lists all saved projects as summaries', async () => {
      await cloudStorage.save(makeProject({ id: 'p1', name: 'Song 1' }), 'user');
      await cloudStorage.save(makeProject({ id: 'p2', name: 'Song 2' }), 'user');

      const list = await cloudStorage.list();

      expect(list).toHaveLength(2);
      const names = list.map((s) => s.name);
      expect(names).toContain('Song 1');
      expect(names).toContain('Song 2');
    });

    it('includes track count in summary', async () => {
      const project = makeProject({
        id: 'p1',
        tracks: [{ id: 't1' }, { id: 't2' }] as Project['tracks'],
      });
      await cloudStorage.save(project, 'user');

      const list = await cloudStorage.list();
      expect(list[0].trackCount).toBe(2);
    });

    it('returns empty list when nothing saved', async () => {
      const list = await cloudStorage.list();
      expect(list).toHaveLength(0);
    });
  });

  describe('delete', () => {
    it('deletes a saved project and returns true', async () => {
      await cloudStorage.save(makeProject({ id: 'p1' }), 'user');

      const deleted = await cloudStorage.delete('p1');
      expect(deleted).toBe(true);

      const loaded = await cloudStorage.load('p1');
      expect(loaded).toBeNull();
    });

    it('returns false when project does not exist', async () => {
      const deleted = await cloudStorage.delete('nonexistent');
      expect(deleted).toBe(false);
    });
  });

  describe('getVersionHistory', () => {
    it('returns version history for a project', async () => {
      const project = makeProject({ id: 'p1' });

      await cloudStorage.save(project, 'user');
      await cloudStorage.save(project, 'user');

      const history = await cloudStorage.getVersionHistory('p1');

      expect(history).toHaveLength(2);
      expect(history[0].version).toBe(1);
      expect(history[1].version).toBe(2);
    });

    it('returns empty history for unknown project', async () => {
      const history = await cloudStorage.getVersionHistory('unknown');
      expect(history).toHaveLength(0);
    });
  });

  describe('shared projects', () => {
    it('saves a shared project and returns record with token', async () => {
      const project = makeProject({ id: 'p1', name: 'Shared Song' });
      const record = await cloudStorage.saveSharedProject({
        project,
        owner: 'TestUser',
        stems: [
          { trackId: 't1', trackName: 'Drums', color: '#ff0', volume: 0.8, lyrics: '', audioDataUrl: 'data:audio/wav;base64,a' },
        ],
      });

      expect(record.token).toBeTruthy();
      expect(record.token).toContain('share_');
      expect(record.projectId).toBe('p1');
      expect(record.owner).toBe('TestUser');
      expect(record.stems).toHaveLength(1);
    });

    it('loads a shared project by token', async () => {
      const project = makeProject({ id: 'p1', name: 'Shared' });
      const saved = await cloudStorage.saveSharedProject({
        project,
        owner: 'user',
        stems: [],
      });

      const loaded = await cloudStorage.loadSharedProject(saved.token);

      expect(loaded).not.toBeNull();
      expect(loaded!.project.name).toBe('Shared');
    });

    it('returns null for invalid share token', async () => {
      const loaded = await cloudStorage.loadSharedProject('invalid-token');
      expect(loaded).toBeNull();
    });

    it('lists shared projects sorted by newest first', async () => {
      vi.useFakeTimers();
      try {
        const p1 = makeProject({ id: 'p1', name: 'First' });
        const p2 = makeProject({ id: 'p2', name: 'Second' });

        vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
        await cloudStorage.saveSharedProject({ project: p1, owner: 'u', stems: [] });

        vi.setSystemTime(new Date('2026-01-01T00:01:00Z'));
        await cloudStorage.saveSharedProject({ project: p2, owner: 'u', stems: [] });

        const list = await cloudStorage.listSharedProjects();

        expect(list).toHaveLength(2);
        // Newest first
        expect(list[0].name).toBe('Second');
        expect(list[1].name).toBe('First');
      } finally {
        vi.useRealTimers();
      }
    });

    it('includes stem count in shared project summary', async () => {
      const project = makeProject({ id: 'p1' });
      await cloudStorage.saveSharedProject({
        project,
        owner: 'u',
        stems: [
          { trackId: 't1', trackName: 'A', color: '#f00', volume: 1, lyrics: '', audioDataUrl: '' },
          { trackId: 't2', trackName: 'B', color: '#0f0', volume: 1, lyrics: '', audioDataUrl: '' },
        ],
      });

      const list = await cloudStorage.listSharedProjects();
      expect(list[0].stemCount).toBe(2);
    });

    it('deep clones project and stems on save', async () => {
      const stems = [
        { trackId: 't1', trackName: 'Drums', color: '#f00', volume: 1, lyrics: '', audioDataUrl: '' },
      ];
      const project = makeProject({ id: 'p1', name: 'Original' });

      const record = await cloudStorage.saveSharedProject({ project, owner: 'u', stems });

      // Mutate the originals
      project.name = 'Mutated';
      stems[0].trackName = 'Mutated';

      expect(record.project.name).toBe('Original');
      expect(record.stems[0].trackName).toBe('Drums');
    });
  });

  describe('resetCloudStorage', () => {
    it('clears all stored data', async () => {
      await cloudStorage.save(makeProject({ id: 'p1' }), 'user');
      await cloudStorage.saveSharedProject({
        project: makeProject({ id: 'p2' }),
        owner: 'u',
        stems: [],
      });

      resetCloudStorage();

      const list = await cloudStorage.list();
      const shared = await cloudStorage.listSharedProjects();

      expect(list).toHaveLength(0);
      expect(shared).toHaveLength(0);
    });
  });
});
