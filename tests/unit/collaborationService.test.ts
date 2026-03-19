import { describe, expect, it } from 'vitest';
import {
  exportShareBundle,
  importShareBundle,
  generateShareToken,
  generateShareLink,
  parseShareParams,
} from '../../src/services/collaborationService';
import type { Project } from '../../src/types/project';

const makeProject = (overrides?: Partial<Project>): Project => ({
  id: 'test-project-1',
  name: 'Test Project',
  createdAt: 1000,
  updatedAt: 2000,
  bpm: 120,
  keyScale: 'C major',
  timeSignature: 4,
  totalDuration: 60,
  tracks: [],
  generationDefaults: {
    inferenceSteps: 50,
    guidanceScale: 7.0,
    shift: 3.0,
    thinking: false,
    model: '',
  },
  ...overrides,
});

describe('collaborationService', () => {
  describe('exportShareBundle', () => {
    it('produces valid JSON with ace-step-share format', () => {
      const project = makeProject();
      const json = exportShareBundle(project, 'Alice');
      const parsed = JSON.parse(json);

      expect(parsed.version).toBe(1);
      expect(parsed.format).toBe('ace-step-share');
      expect(parsed.project.id).toBe('test-project-1');
      expect(parsed.project.name).toBe('Test Project');
      expect(parsed.sharedBy).toBe('Alice');
      expect(typeof parsed.sharedAt).toBe('number');
    });

    it('preserves all tracks in the bundle', () => {
      const project = makeProject({
        tracks: [
          {
            id: 't1', trackName: 'drums', displayName: 'Drums', color: '#ff0000',
            order: 0, volume: 0.8, muted: false, soloed: false, clips: [],
          },
          {
            id: 't2', trackName: 'bass', displayName: 'Bass', color: '#00ff00',
            order: 1, volume: 0.7, muted: false, soloed: false, clips: [],
          },
        ],
      });

      const json = exportShareBundle(project);
      const parsed = JSON.parse(json);
      expect(parsed.project.tracks).toHaveLength(2);
      expect(parsed.project.tracks[0].trackName).toBe('drums');
      expect(parsed.project.tracks[1].trackName).toBe('bass');
    });
  });

  describe('importShareBundle', () => {
    it('parses a valid share bundle', () => {
      const project = makeProject();
      const json = exportShareBundle(project, 'Bob');
      const bundle = importShareBundle(json);

      expect(bundle.project.id).toBe('test-project-1');
      expect(bundle.sharedBy).toBe('Bob');
      expect(bundle.format).toBe('ace-step-share');
    });

    it('throws on invalid JSON', () => {
      expect(() => importShareBundle('not json')).toThrow('not valid JSON');
    });

    it('throws on wrong format', () => {
      expect(() => importShareBundle(JSON.stringify({ format: 'other' }))).toThrow(
        'missing or wrong format field',
      );
    });

    it('throws on missing project data', () => {
      expect(() =>
        importShareBundle(JSON.stringify({ format: 'ace-step-share', project: {} })),
      ).toThrow('missing project data');
    });

    it('round-trips export → import', () => {
      const project = makeProject({ name: 'Round Trip' });
      const json = exportShareBundle(project);
      const bundle = importShareBundle(json);

      expect(bundle.project.name).toBe('Round Trip');
      expect(bundle.project.bpm).toBe(120);
      expect(bundle.project.tracks).toEqual([]);
    });
  });

  describe('generateShareToken', () => {
    it('returns a non-empty string', () => {
      const token = generateShareToken('proj-1', 1000);
      expect(token.length).toBeGreaterThan(0);
    });

    it('is deterministic for the same input', () => {
      const a = generateShareToken('proj-1', 1000);
      const b = generateShareToken('proj-1', 1000);
      expect(a).toBe(b);
    });

    it('differs for different inputs', () => {
      const a = generateShareToken('proj-1', 1000);
      const b = generateShareToken('proj-2', 1000);
      expect(a).not.toBe(b);
    });
  });

  describe('generateShareLink', () => {
    it('generates a valid URL with share parameters', () => {
      const project = makeProject();
      const link = generateShareLink(project, 'https://daw.example.com');

      expect(link.url).toContain('https://daw.example.com');
      expect(link.url).toContain('share=');
      expect(link.url).toContain('project=test-project-1');
      expect(link.url).toContain('mode=viewer');
      expect(link.projectId).toBe('test-project-1');
      expect(link.readOnly).toBe(true);
      expect(link.expiresAt).toBeNull();
      expect(link.token.length).toBeGreaterThan(0);
    });

    it('omits viewer mode when readOnly is false', () => {
      const project = makeProject();
      const link = generateShareLink(project, 'https://daw.example.com', { readOnly: false });

      expect(link.url).not.toContain('mode=viewer');
      expect(link.readOnly).toBe(false);
    });

    it('includes expiration when provided', () => {
      const project = makeProject();
      const link = generateShareLink(project, 'https://daw.example.com', {
        expiresAt: 9999999,
      });

      expect(link.url).toContain('expires=9999999');
      expect(link.expiresAt).toBe(9999999);
    });
  });

  describe('parseShareParams', () => {
    it('parses share parameters from URL search string', () => {
      const params = parseShareParams('?share=abc123&project=proj-1&mode=viewer');
      expect(params).toEqual({
        token: 'abc123',
        projectId: 'proj-1',
        readOnly: true,
        expiresAt: null,
      });
    });

    it('returns null if share token is missing', () => {
      expect(parseShareParams('?project=proj-1')).toBeNull();
    });

    it('returns null if project ID is missing', () => {
      expect(parseShareParams('?share=abc123')).toBeNull();
    });

    it('parses non-viewer mode as readOnly=false', () => {
      const params = parseShareParams('?share=abc&project=p1');
      expect(params?.readOnly).toBe(false);
    });

    it('parses expiration timestamp', () => {
      const params = parseShareParams('?share=abc&project=p1&expires=12345');
      expect(params?.expiresAt).toBe(12345);
    });

    it('round-trips with generateShareLink', () => {
      const project = makeProject();
      const link = generateShareLink(project, 'https://example.com', { expiresAt: 99999 });
      const url = new URL(link.url);
      const params = parseShareParams(url.search);

      expect(params).not.toBeNull();
      expect(params!.token).toBe(link.token);
      expect(params!.projectId).toBe('test-project-1');
      expect(params!.readOnly).toBe(true);
      expect(params!.expiresAt).toBe(99999);
    });
  });
});
