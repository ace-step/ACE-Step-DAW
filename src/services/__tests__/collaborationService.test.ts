import { describe, it, expect } from 'vitest';
import {
  exportShareBundle,
  importShareBundle,
  generateShareToken,
  generateShareLink,
  parseShareParams,
} from '../collaborationService';
import type { Project } from '../../types/project';

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'proj-1',
    name: 'Test Project',
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    duration: 30,
    measures: 128,
    tracks: [],
    createdAt: 1000,
    updatedAt: 2000,
    ...overrides,
  } as Project;
}

describe('exportShareBundle', () => {
  it('produces valid JSON', () => {
    const project = makeProject();
    const json = exportShareBundle(project);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('includes format field', () => {
    const json = exportShareBundle(makeProject());
    const bundle = JSON.parse(json);
    expect(bundle.format).toBe('ace-step-share');
  });

  it('includes version', () => {
    const json = exportShareBundle(makeProject());
    const bundle = JSON.parse(json);
    expect(bundle.version).toBe(1);
  });

  it('includes project data', () => {
    const project = makeProject({ name: 'My Song' });
    const json = exportShareBundle(project);
    const bundle = JSON.parse(json);
    expect(bundle.project.name).toBe('My Song');
    expect(bundle.project.id).toBe('proj-1');
  });

  it('includes sharedBy when provided', () => {
    const json = exportShareBundle(makeProject(), 'Alice');
    const bundle = JSON.parse(json);
    expect(bundle.sharedBy).toBe('Alice');
  });

  it('sets sharedAt timestamp', () => {
    const before = Date.now();
    const json = exportShareBundle(makeProject());
    const after = Date.now();
    const bundle = JSON.parse(json);
    expect(bundle.sharedAt).toBeGreaterThanOrEqual(before);
    expect(bundle.sharedAt).toBeLessThanOrEqual(after);
  });
});

describe('importShareBundle', () => {
  it('parses valid bundle JSON', () => {
    const project = makeProject();
    const json = exportShareBundle(project);
    const bundle = importShareBundle(json);
    expect(bundle.project.id).toBe('proj-1');
    expect(bundle.format).toBe('ace-step-share');
  });

  it('throws on invalid JSON', () => {
    expect(() => importShareBundle('not-json')).toThrow('not valid JSON');
  });

  it('throws on missing format field', () => {
    expect(() => importShareBundle(JSON.stringify({ project: {} }))).toThrow('missing or wrong format');
  });

  it('throws on wrong format field', () => {
    expect(() => importShareBundle(JSON.stringify({ format: 'other' }))).toThrow('missing or wrong format');
  });

  it('throws on missing project data', () => {
    expect(() => importShareBundle(JSON.stringify({
      format: 'ace-step-share',
      project: { id: null },
    }))).toThrow('missing project data');
  });

  it('roundtrips with exportShareBundle', () => {
    const project = makeProject({ name: 'Roundtrip Test' });
    const json = exportShareBundle(project, 'Bob');
    const bundle = importShareBundle(json);
    expect(bundle.project.name).toBe('Roundtrip Test');
    expect(bundle.sharedBy).toBe('Bob');
  });
});

describe('generateShareToken', () => {
  it('returns a non-empty string', () => {
    const token = generateShareToken('proj-1', 12345);
    expect(token.length).toBeGreaterThan(0);
  });

  it('is deterministic for same inputs', () => {
    const t1 = generateShareToken('proj-1', 12345);
    const t2 = generateShareToken('proj-1', 12345);
    expect(t1).toBe(t2);
  });

  it('produces different tokens for different projects', () => {
    const t1 = generateShareToken('proj-1', 12345);
    const t2 = generateShareToken('proj-2', 12345);
    expect(t1).not.toBe(t2);
  });

  it('produces different tokens for different timestamps', () => {
    const t1 = generateShareToken('proj-1', 1000);
    const t2 = generateShareToken('proj-1', 2000);
    expect(t1).not.toBe(t2);
  });
});

describe('generateShareLink', () => {
  it('generates a URL with share parameters', () => {
    const project = makeProject();
    const link = generateShareLink(project, 'https://example.com');
    expect(link.url).toContain('share=');
    expect(link.url).toContain('project=proj-1');
  });

  it('sets readOnly to true by default', () => {
    const link = generateShareLink(makeProject(), 'https://example.com');
    expect(link.readOnly).toBe(true);
    expect(link.url).toContain('mode=viewer');
  });

  it('excludes viewer mode when readOnly is false', () => {
    const link = generateShareLink(makeProject(), 'https://example.com', { readOnly: false });
    expect(link.readOnly).toBe(false);
    expect(link.url).not.toContain('mode=viewer');
  });

  it('includes expiry when specified', () => {
    const link = generateShareLink(makeProject(), 'https://example.com', { expiresAt: 99999 });
    expect(link.expiresAt).toBe(99999);
    expect(link.url).toContain('expires=99999');
  });

  it('sets expiresAt to null when not specified', () => {
    const link = generateShareLink(makeProject(), 'https://example.com');
    expect(link.expiresAt).toBeNull();
  });
});

describe('parseShareParams', () => {
  it('returns null for non-share URLs', () => {
    expect(parseShareParams('')).toBeNull();
    expect(parseShareParams('?page=1')).toBeNull();
  });

  it('returns null when share token is missing', () => {
    expect(parseShareParams('?project=proj-1')).toBeNull();
  });

  it('returns null when project is missing', () => {
    expect(parseShareParams('?share=abc123')).toBeNull();
  });

  it('parses a valid share URL', () => {
    const result = parseShareParams('?share=abc123&project=proj-1&mode=viewer');
    expect(result).not.toBeNull();
    expect(result!.token).toBe('abc123');
    expect(result!.projectId).toBe('proj-1');
    expect(result!.readOnly).toBe(true);
    expect(result!.mode).toBe('viewer');
  });

  it('parses expiry', () => {
    const result = parseShareParams('?share=abc&project=p1&expires=99999');
    expect(result!.expiresAt).toBe(99999);
  });

  it('sets readOnly false when mode is not viewer', () => {
    const result = parseShareParams('?share=abc&project=p1&mode=editor');
    expect(result!.readOnly).toBe(false);
  });

  it('roundtrips with generateShareLink', () => {
    const link = generateShareLink(makeProject(), 'https://example.com', {
      readOnly: true,
      expiresAt: 50000,
    });
    const url = new URL(link.url);
    const parsed = parseShareParams(url.search);
    expect(parsed!.token).toBe(link.token);
    expect(parsed!.projectId).toBe('proj-1');
    expect(parsed!.readOnly).toBe(true);
    expect(parsed!.expiresAt).toBe(50000);
  });
});
