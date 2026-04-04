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

const mockDownloadBlob = vi.fn();
vi.mock('../browserDownload', () => ({
  downloadBlob: (...args: unknown[]) => mockDownloadBlob(...args),
}));

vi.mock('../../utils/clipLayout', () => ({
  buildClipLayout: vi.fn(() => [{ trackIndex: 0, startNorm: 0, widthNorm: 0.5, color: '#ff0000' }]),
}));

import {
  saveProject,
  loadProject,
  deleteProject,
  listProjects,
  saveTemplate,
  loadTemplate,
  deleteTemplate,
  listTemplates,
  exportProjectArchive,
  importProjectArchive,
} from '../projectStorage';
import type { Project, ProjectTemplate } from '../../types/project';
import { buildClipLayout } from '../../utils/clipLayout';

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

function makeMinimalTemplate(overrides: Partial<ProjectTemplate> = {}): ProjectTemplate {
  return {
    id: 'tmpl-1',
    name: 'Template One',
    description: 'A test template',
    createdAt: 3000,
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    measures: 16,
    tracks: [],
    generationDefaults: {} as ProjectTemplate['generationDefaults'],
    ...overrides,
  } as ProjectTemplate;
}

describe('projectStorage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSet.mockResolvedValue(undefined);
    mockDel.mockResolvedValue(undefined);
  });

  // ── Projects CRUD ──

  describe('saveProject', () => {
    it('stores the project object directly without JSON.stringify', async () => {
      const project = makeMinimalProject();
      await saveProject(project);

      expect(mockSet).toHaveBeenCalledTimes(1);
      const [key, value] = mockSet.mock.calls[0];
      expect(key).toBe('project:test-id');
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
      expect(mockGet).toHaveBeenCalledWith('project:test-id');
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
    it('deletes by project key', async () => {
      await deleteProject('proj-123');
      expect(mockDel).toHaveBeenCalledWith('project:proj-123');
    });
  });

  describe('listProjects', () => {
    it('returns summaries sorted by updatedAt descending', async () => {
      const p1 = makeMinimalProject({ id: 'p1', name: 'Old', updatedAt: 1000 });
      const p2 = makeMinimalProject({ id: 'p2', name: 'New', updatedAt: 5000 });
      mockKeys.mockResolvedValue(['project:p1', 'project:p2', 'template:t1']);
      mockGet.mockImplementation(async (key: string) => {
        if (key === 'project:p1') return p1;
        if (key === 'project:p2') return p2;
        return undefined;
      });

      const summaries = await listProjects();
      expect(summaries).toHaveLength(2);
      expect(summaries[0].id).toBe('p2');
      expect(summaries[1].id).toBe('p1');
      expect(summaries[0].bpm).toBe(120);
      expect(summaries[0].trackCount).toBe(0);
    });

    it('handles mixed string and object formats', async () => {
      const p1 = makeMinimalProject({ id: 'p1', updatedAt: 1000 });
      mockKeys.mockResolvedValue(['project:p1', 'project:p2']);
      mockGet.mockImplementation(async (key: string) => {
        if (key === 'project:p1') return p1;
        if (key === 'project:p2') return JSON.stringify(makeMinimalProject({ id: 'p2', updatedAt: 2000 }));
        return undefined;
      });

      const summaries = await listProjects();
      expect(summaries).toHaveLength(2);
      expect(summaries[0].id).toBe('p2');
    });

    it('returns empty array when no projects exist', async () => {
      mockKeys.mockResolvedValue([]);
      const summaries = await listProjects();
      expect(summaries).toEqual([]);
    });

    it('calls buildClipLayout for each project', async () => {
      const p = makeMinimalProject({ id: 'p1' });
      mockKeys.mockResolvedValue(['project:p1']);
      mockGet.mockResolvedValue(p);

      const summaries = await listProjects();
      expect(buildClipLayout).toHaveBeenCalledWith(p.tracks, p.totalDuration);
      expect(summaries[0].clipLayout).toEqual([
        { trackIndex: 0, startNorm: 0, widthNorm: 0.5, color: '#ff0000' },
      ]);
    });

    it('skips null entries from IDB', async () => {
      mockKeys.mockResolvedValue(['project:p1', 'project:p2']);
      mockGet.mockImplementation(async (key: string) => {
        if (key === 'project:p1') return makeMinimalProject({ id: 'p1' });
        return undefined;
      });

      const summaries = await listProjects();
      expect(summaries).toHaveLength(1);
    });

    it('filters out non-project keys', async () => {
      mockKeys.mockResolvedValue(['template:t1', 'audio:a1', 42, 'project:p1']);
      mockGet.mockResolvedValue(makeMinimalProject({ id: 'p1' }));

      const summaries = await listProjects();
      expect(summaries).toHaveLength(1);
      expect(mockGet).toHaveBeenCalledTimes(1);
    });
  });

  // ── Templates CRUD ──

  describe('saveTemplate', () => {
    it('stores template as JSON string', async () => {
      const template = makeMinimalTemplate();
      await saveTemplate(template);

      expect(mockSet).toHaveBeenCalledWith(
        'template:tmpl-1',
        JSON.stringify(template),
      );
    });
  });

  describe('loadTemplate', () => {
    it('loads and parses template from JSON', async () => {
      const template = makeMinimalTemplate();
      mockGet.mockResolvedValue(JSON.stringify(template));

      const loaded = await loadTemplate('tmpl-1');
      expect(loaded).toEqual(template);
      expect(mockGet).toHaveBeenCalledWith('template:tmpl-1');
    });

    it('returns null when template not found', async () => {
      mockGet.mockResolvedValue(undefined);
      const loaded = await loadTemplate('nonexistent');
      expect(loaded).toBeNull();
    });
  });

  describe('deleteTemplate', () => {
    it('deletes by template key', async () => {
      await deleteTemplate('tmpl-42');
      expect(mockDel).toHaveBeenCalledWith('template:tmpl-42');
    });
  });

  describe('listTemplates', () => {
    it('returns summaries sorted by createdAt descending', async () => {
      const t1 = makeMinimalTemplate({ id: 't1', name: 'Old', createdAt: 1000 });
      const t2 = makeMinimalTemplate({ id: 't2', name: 'New', createdAt: 5000 });
      mockKeys.mockResolvedValue(['template:t1', 'template:t2']);
      mockGet.mockImplementation(async (key: string) => {
        if (key === 'template:t1') return JSON.stringify(t1);
        if (key === 'template:t2') return JSON.stringify(t2);
        return undefined;
      });

      const summaries = await listTemplates();
      expect(summaries).toHaveLength(2);
      expect(summaries[0].id).toBe('t2');
      expect(summaries[0].name).toBe('New');
      expect(summaries[0].description).toBe('A test template');
      expect(summaries[0].trackCount).toBe(0);
    });

    it('returns empty array when no templates exist', async () => {
      mockKeys.mockResolvedValue([]);
      const summaries = await listTemplates();
      expect(summaries).toEqual([]);
    });

    it('skips null entries', async () => {
      mockKeys.mockResolvedValue(['template:t1', 'template:t2']);
      mockGet.mockImplementation(async (key: string) => {
        if (key === 'template:t1') return JSON.stringify(makeMinimalTemplate({ id: 't1' }));
        return undefined;
      });

      const summaries = await listTemplates();
      expect(summaries).toHaveLength(1);
    });
  });

  // ── Archive Export ──

  describe('exportProjectArchive', () => {
    it('creates archive with correct magic bytes and manifest', async () => {
      const project = makeMinimalProject({ name: 'My Song' });
      mockKeys.mockResolvedValue([]);

      await exportProjectArchive(project);

      expect(mockDownloadBlob).toHaveBeenCalledTimes(1);
      const [blob, filename] = mockDownloadBlob.mock.calls[0];
      expect(filename).toBe('My Song.acedaw');
      expect(blob).toBeInstanceOf(Blob);

      // Verify magic bytes
      const buffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      const magic = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
      expect(magic).toBe('ACED');

      // Verify manifest
      const view = new DataView(buffer);
      const manifestLen = view.getUint32(4, true);
      const manifestBytes = bytes.slice(8, 8 + manifestLen);
      const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
      expect(manifest.version).toBe(1);
      expect(manifest.project.id).toBe('test-id');
      expect(manifest.files).toEqual([]);
    });

    it('includes audio blobs in archive with correct offsets', async () => {
      const project = makeMinimalProject();
      const audioBlob1 = new Blob(['audio1'], { type: 'audio/wav' });
      const audioBlob2 = new Blob(['audio2data'], { type: 'audio/wav' });

      mockKeys.mockResolvedValue([
        `audio:${project.id}:clip1`,
        `audio:${project.id}:clip2`,
        'audio:other-project:clip3', // should be excluded
      ]);
      mockGet.mockImplementation(async (key: string) => {
        if (key === `audio:${project.id}:clip1`) return audioBlob1;
        if (key === `audio:${project.id}:clip2`) return audioBlob2;
        return undefined;
      });

      await exportProjectArchive(project);

      const [blob] = mockDownloadBlob.mock.calls[0];
      const buffer = await blob.arrayBuffer();
      const view = new DataView(buffer);
      const manifestLen = view.getUint32(4, true);
      const manifestBytes = new Uint8Array(buffer).slice(8, 8 + manifestLen);
      const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));

      expect(manifest.files).toHaveLength(2);
      expect(manifest.files[0].offset).toBe(0);
      expect(manifest.files[0].size).toBe(audioBlob1.size);
      expect(manifest.files[1].offset).toBe(audioBlob1.size);
      expect(manifest.files[1].size).toBe(audioBlob2.size);
    });

    it('sanitizes special characters in filename', async () => {
      const project = makeMinimalProject({ name: 'My Song! @#$%' });
      mockKeys.mockResolvedValue([]);

      await exportProjectArchive(project);

      const [, filename] = mockDownloadBlob.mock.calls[0];
      expect(filename).toBe('My Song .acedaw');
    });
  });

  // ── Archive Import ──

  describe('importProjectArchive', () => {
    const realCreateElement = document.createElement.bind(document);

    afterEach(() => {
      vi.restoreAllMocks();
      // Re-apply idb-keyval mocks that restoreAllMocks cleared
      mockSet.mockResolvedValue(undefined);
      mockDel.mockResolvedValue(undefined);
    });

    function createArchiveBlob(project: Project, audioEntries: { key: string; data: Uint8Array }[] = []): Blob {
      const files: { key: string; offset: number; size: number }[] = [];
      let offset = 0;
      for (const entry of audioEntries) {
        files.push({ key: entry.key, offset, size: entry.data.length });
        offset += entry.data.length;
      }

      const manifest = { version: 1, project, files };
      const manifestJson = JSON.stringify(manifest);
      const manifestBytes = new TextEncoder().encode(manifestJson);

      const headerSize = 8;
      const totalSize = headerSize + manifestBytes.length + offset;
      const buffer = new ArrayBuffer(totalSize);
      const view = new DataView(buffer);
      const bytes = new Uint8Array(buffer);

      // Magic
      bytes[0] = 65; // A
      bytes[1] = 67; // C
      bytes[2] = 69; // E
      bytes[3] = 68; // D

      // Manifest length
      view.setUint32(4, manifestBytes.length, true);

      // Manifest
      bytes.set(manifestBytes, headerSize);

      // Audio data
      let writeOffset = headerSize + manifestBytes.length;
      for (const entry of audioEntries) {
        bytes.set(entry.data, writeOffset);
        writeOffset += entry.data.length;
      }

      return new Blob([buffer], { type: 'application/octet-stream' });
    }

    function mockFileInput(file: Blob) {
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'input') {
          const input = realCreateElement('input');
          vi.spyOn(input, 'click').mockImplementation(() => {
            Object.defineProperty(input, 'files', { value: [file] });
            input.onchange?.(new Event('change'));
          });
          return input;
        }
        return realCreateElement(tag);
      });
    }

    it('imports a valid archive and restores project + audio', async () => {
      const project = makeMinimalProject({ id: 'imported-1', name: 'Imported' });
      const audioData = new TextEncoder().encode('wave-data');
      const archive = createArchiveBlob(project, [
        { key: 'audio:imported-1:clip1', data: audioData },
      ]);

      mockFileInput(archive);

      const result = await importProjectArchive();

      expect(result).not.toBeNull();
      expect(result!.id).toBe('imported-1');
      expect(result!.name).toBe('Imported');

      // Audio blob restored to IDB
      expect(mockSet).toHaveBeenCalledWith(
        'audio:imported-1:clip1',
        expect.any(Blob),
      );

      // Project saved to IDB
      expect(mockSet).toHaveBeenCalledWith(
        'project:imported-1',
        expect.objectContaining({ id: 'imported-1' }),
      );
    });

    it('returns null when file input is cancelled', async () => {
      vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
        if (tag === 'input') {
          const input = realCreateElement('input');
          vi.spyOn(input, 'click').mockImplementation(() => {
            Object.defineProperty(input, 'files', { value: [] });
            input.onchange?.(new Event('change'));
          });
          return input;
        }
        return realCreateElement(tag);
      });

      const result = await importProjectArchive();
      expect(result).toBeNull();
    });

    it('returns null for invalid magic bytes', async () => {
      const badBlob = new Blob([new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0])]);
      mockFileInput(badBlob);

      const result = await importProjectArchive();
      expect(result).toBeNull();
    });

    it('returns null for invalid manifest (missing id)', async () => {
      const badProject = { tracks: [] } as unknown as Project;
      const archive = createArchiveBlob(badProject);
      mockFileInput(archive);

      const result = await importProjectArchive();
      expect(result).toBeNull();
    });

    it('returns null for invalid manifest (missing tracks)', async () => {
      const badProject = { id: 'x' } as unknown as Project;
      const archive = createArchiveBlob(badProject);
      mockFileInput(archive);

      const result = await importProjectArchive();
      expect(result).toBeNull();
    });

    it('round-trips export → import for a project with audio', async () => {
      const project = makeMinimalProject({ id: 'rt-1', name: 'Roundtrip' });
      const audioContent = new TextEncoder().encode('roundtrip-audio');

      // Set up keys/get for export
      mockKeys.mockResolvedValue([`audio:rt-1:clip-a`]);
      mockGet.mockResolvedValue(new Blob([audioContent], { type: 'audio/wav' }));

      await exportProjectArchive(project);

      // Capture the exported blob
      const exportedBlob: Blob = mockDownloadBlob.mock.calls[0][0];

      // Set up for import
      mockFileInput(exportedBlob);
      mockSet.mockClear();

      const imported = await importProjectArchive();
      expect(imported).not.toBeNull();
      expect(imported!.id).toBe('rt-1');
      expect(imported!.name).toBe('Roundtrip');

      // Audio was restored
      const audioSetCall = mockSet.mock.calls.find(
        ([key]) => key === 'audio:rt-1:clip-a',
      );
      expect(audioSetCall).toBeDefined();
      expect(audioSetCall![1]).toBeInstanceOf(Blob);
    });
  });
});
