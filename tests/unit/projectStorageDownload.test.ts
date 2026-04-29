import { describe, expect, it, vi } from 'vitest';
import { exportProjectArchive } from '../../src/services/projectStorage';
import type { Project } from '../../src/types/project';

const mockDownloadBlob = vi.fn();

vi.mock('../../src/services/browserDownload', () => ({
  downloadBlob: (...args: unknown[]) => mockDownloadBlob(...args),
}));

vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => ({})),
  keys: vi.fn(async () => ['audio:project-1:clip-1']),
  get: vi.fn(async (key: string) => {
    if (key === 'audio:project-1:clip-1') {
      return new Blob(['audio-bytes'], { type: 'audio/wav' });
    }
    return null;
  }),
  set: vi.fn(),
  del: vi.fn(),
}));

function makeProject(): Project {
  return {
    id: 'project-1',
    name: 'Project Export',
    createdAt: 1,
    updatedAt: 1,
    bpm: 120,
    keyScale: 'C major',
    timeSignature: 4,
    totalDuration: 32,
    measures: 8,
    tracks: [],
    trackPresets: [],
    generationDefaults: {
      inferenceSteps: 20,
      guidanceScale: 7.5,
      shift: 0,
      thinking: false,
      model: 'test-model',
    },
    globalCaption: '',
    automationLanes: [],
    assets: [],
  };
}

describe('projectStorage download flow', () => {
  it('routes archive exports through the shared browser download helper', async () => {
    mockDownloadBlob.mockReset();

    await exportProjectArchive(makeProject());

    expect(mockDownloadBlob).toHaveBeenCalledTimes(1);
    const [blob, fileName] = mockDownloadBlob.mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect((blob as Blob).type).toBe('application/octet-stream');
    expect(fileName).toBe('Project Export.acedaw');
  });
});
