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

// Mock browserDownload
vi.mock('../browserDownload', () => ({
  downloadBlob: vi.fn(),
}));

// Mock clipLayout
vi.mock('../../utils/clipLayout', () => ({
  buildClipLayout: vi.fn(() => []),
}));

import {
  saveProject, loadProject, deleteProject, listProjects,
  saveTemplate, loadTemplate, deleteTemplate, listTemplates,
  exportProjectArchive,
} from '../projectStorage';
import type { Project, ProjectTemplate } from '../../types/project';

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

  describe('deleteProject', () => {
    it('deletes project by id', async () => {
      mockDel.mockResolvedValue(undefined);
      await deleteProject('test-id');
      expect(mockDel).toHaveBeenCalledWith('project:test-id');
    });
  });

  describe('listProjects', () => {
    it('returns empty array when no projects exist', async () => {
      mockKeys.mockResolvedValue([]);
      const projects = await listProjects();
      expect(projects).toEqual([]);
    });

    it('lists projects sorted by updatedAt descending', async () => {
      mockKeys.mockResolvedValue(['project:a', 'project:b', 'audio:x']);
      const projectA = makeMinimalProject({ id: 'a', name: 'Old', updatedAt: 1000 });
      const projectB = makeMinimalProject({ id: 'b', name: 'New', updatedAt: 2000 });

      mockGet.mockImplementation(async (key: string) => {
        if (key === 'project:a') return projectA;
        if (key === 'project:b') return projectB;
        return undefined;
      });

      const projects = await listProjects();

      expect(projects).toHaveLength(2);
      expect(projects[0].name).toBe('New');
      expect(projects[1].name).toBe('Old');
    });

    it('handles legacy JSON string format', async () => {
      mockKeys.mockResolvedValue(['project:c']);
      const project = makeMinimalProject({ id: 'c', name: 'Legacy' });
      mockGet.mockResolvedValue(JSON.stringify(project));

      const projects = await listProjects();

      expect(projects).toHaveLength(1);
      expect(projects[0].name).toBe('Legacy');
    });

    it('filters out non-project keys', async () => {
      mockKeys.mockResolvedValue(['project:a', 'template:t', 'audio:x', 123]);
      mockGet.mockResolvedValue(makeMinimalProject());

      const projects = await listProjects();

      expect(projects).toHaveLength(1);
    });
  });

  // ── Templates ──

  describe('saveTemplate', () => {
    it('stores template as JSON string', async () => {
      mockSet.mockResolvedValue(undefined);
      const template = {
        id: 'tpl-1',
        name: 'Pop Template',
        description: 'A pop template',
        createdAt: 1000,
        tracks: [],
      } as unknown as ProjectTemplate;

      await saveTemplate(template);

      expect(mockSet).toHaveBeenCalledWith(
        'template:tpl-1',
        expect.any(String),
      );
    });
  });

  describe('loadTemplate', () => {
    it('loads and parses template', async () => {
      const template = { id: 'tpl-1', name: 'Pop', description: 'Pop', createdAt: 1000, tracks: [] };
      mockGet.mockResolvedValue(JSON.stringify(template));

      const loaded = await loadTemplate('tpl-1');

      expect(loaded).toEqual(template);
    });

    it('returns null when template not found', async () => {
      mockGet.mockResolvedValue(undefined);
      const loaded = await loadTemplate('nonexistent');
      expect(loaded).toBeNull();
    });
  });

  describe('deleteTemplate', () => {
    it('deletes template by id', async () => {
      mockDel.mockResolvedValue(undefined);
      await deleteTemplate('tpl-1');
      expect(mockDel).toHaveBeenCalledWith('template:tpl-1');
    });
  });

  describe('listTemplates', () => {
    it('returns empty array when no templates exist', async () => {
      mockKeys.mockResolvedValue([]);
      const templates = await listTemplates();
      expect(templates).toEqual([]);
    });

    it('lists templates sorted by createdAt descending', async () => {
      mockKeys.mockResolvedValue(['template:a', 'template:b']);
      const tplA = { id: 'a', name: 'Old', description: 'old', createdAt: 1000, tracks: [] };
      const tplB = { id: 'b', name: 'New', description: 'new', createdAt: 2000, tracks: [{}] };

      mockGet.mockImplementation(async (key: string) => {
        if (key === 'template:a') return JSON.stringify(tplA);
        if (key === 'template:b') return JSON.stringify(tplB);
        return undefined;
      });

      const templates = await listTemplates();

      expect(templates).toHaveLength(2);
      expect(templates[0].name).toBe('New');
      expect(templates[0].trackCount).toBe(1);
      expect(templates[1].name).toBe('Old');
    });
  });

  // ── Archive ──

  describe('exportProjectArchive', () => {
    it('exports project with no audio files', async () => {
      mockKeys.mockResolvedValue([]);
      const project = makeMinimalProject();

      await exportProjectArchive(project);

      const { downloadBlob } = await import('../browserDownload');
      expect(downloadBlob).toHaveBeenCalledWith(
        expect.any(Blob),
        expect.stringContaining('.acedaw'),
      );
    });

    it('includes audio blobs in archive', async () => {
      const project = makeMinimalProject();
      mockKeys.mockResolvedValue([`audio:${project.id}:clip1`]);
      const audioBlob = new Blob(['test-audio'], { type: 'audio/wav' });
      mockGet.mockResolvedValue(audioBlob);

      await exportProjectArchive(project);

      const { downloadBlob } = await import('../browserDownload');
      expect(downloadBlob).toHaveBeenCalled();
      const [blob] = (downloadBlob as ReturnType<typeof vi.fn>).mock.calls[0];
      // Archive should be larger than just the manifest
      expect(blob.size).toBeGreaterThan(8);
    });
  });
});
