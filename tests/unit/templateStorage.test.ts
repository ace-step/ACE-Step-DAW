import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectTemplate } from '../../src/types/project';

// Mock idb-keyval
const mockStore = new Map<string, string>();
vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => ({})),
  get: vi.fn((key: string) => Promise.resolve(mockStore.get(key) ?? undefined)),
  set: vi.fn((key: string, value: string) => { mockStore.set(key, value); return Promise.resolve(); }),
  del: vi.fn((key: string) => { mockStore.delete(key); return Promise.resolve(); }),
  keys: vi.fn(() => Promise.resolve([...mockStore.keys()])),
}));

import {
  saveTemplate,
  loadTemplate,
  deleteTemplate,
  listTemplates,
} from '../../src/services/projectStorage';

function makeTemplate(overrides?: Partial<ProjectTemplate>): ProjectTemplate {
  return {
    id: 'tmpl-1',
    name: 'Test Template',
    description: 'A test template',
    createdAt: 1000,
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    measures: 64,
    tracks: [
      {
        trackName: 'drums',
        trackType: 'sequencer',
        displayName: 'Drums',
        color: '#ef4444',
        volume: 0.8,
      },
    ],
    generationDefaults: {
      inferenceSteps: 50,
      guidanceScale: 7.0,
      shift: 3.0,
      thinking: false,
      model: '',
    },
    ...overrides,
  };
}

describe('template storage', () => {
  beforeEach(() => {
    mockStore.clear();
  });

  it('saves and loads a template', async () => {
    const template = makeTemplate();
    await saveTemplate(template);

    const loaded = await loadTemplate('tmpl-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe('Test Template');
    expect(loaded!.bpm).toBe(120);
    expect(loaded!.tracks).toHaveLength(1);
    expect(loaded!.tracks[0].trackName).toBe('drums');
  });

  it('returns null for non-existent template', async () => {
    const loaded = await loadTemplate('nonexistent');
    expect(loaded).toBeNull();
  });

  it('deletes a template', async () => {
    const template = makeTemplate();
    await saveTemplate(template);
    await deleteTemplate('tmpl-1');

    const loaded = await loadTemplate('tmpl-1');
    expect(loaded).toBeNull();
  });

  it('lists templates sorted by createdAt descending', async () => {
    await saveTemplate(makeTemplate({ id: 'tmpl-a', name: 'Older', createdAt: 100 }));
    await saveTemplate(makeTemplate({ id: 'tmpl-b', name: 'Newer', createdAt: 200 }));

    const list = await listTemplates();
    expect(list).toHaveLength(2);
    expect(list[0].name).toBe('Newer');
    expect(list[1].name).toBe('Older');
  });

  it('listTemplates returns correct summary fields', async () => {
    await saveTemplate(makeTemplate({
      id: 'tmpl-x',
      name: 'Full',
      description: 'Detailed desc',
      createdAt: 500,
      tracks: [
        { trackName: 'drums', trackType: 'sequencer', displayName: 'Drums', color: '#f00', volume: 1 },
        { trackName: 'bass', trackType: 'pianoRoll', displayName: 'Bass', color: '#0f0', volume: 1 },
      ],
    }));

    const list = await listTemplates();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('tmpl-x');
    expect(list[0].name).toBe('Full');
    expect(list[0].description).toBe('Detailed desc');
    expect(list[0].trackCount).toBe(2);
    expect(list[0].createdAt).toBe(500);
  });

  it('does not interfere with project storage keys', async () => {
    // Store a project key alongside templates
    mockStore.set('project:proj-1', JSON.stringify({ id: 'proj-1' }));
    await saveTemplate(makeTemplate());

    const list = await listTemplates();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('tmpl-1');
  });
});
