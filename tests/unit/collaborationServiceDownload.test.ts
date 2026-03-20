import { describe, expect, it, vi } from 'vitest';
import { downloadShareBundle } from '../../src/services/collaborationService';
import type { Project } from '../../src/types/project';

const mockDownloadBlob = vi.fn();

vi.mock('../../src/services/browserDownload', () => ({
  downloadBlob: (...args: unknown[]) => mockDownloadBlob(...args),
}));

function makeProject(): Project {
  return {
    id: 'project-1',
    name: 'My Song',
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

describe('collaborationService download flow', () => {
  it('routes share bundle downloads through the shared browser download helper', () => {
    mockDownloadBlob.mockReset();

    downloadShareBundle(makeProject(), 'Alice');

    expect(mockDownloadBlob).toHaveBeenCalledTimes(1);
    const [blob, fileName] = mockDownloadBlob.mock.calls[0];
    expect(blob).toBeInstanceOf(Blob);
    expect((blob as Blob).type).toBe('application/json');
    expect(fileName).toBe('My Song-share.json');
  });
});
