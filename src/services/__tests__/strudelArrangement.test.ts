import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GENRE_TEMPLATES, getArrangementTemplate } from '../strudelArrangement';

vi.mock('../../services/projectStorage', () => ({
  saveProject: vi.fn(),
}));
vi.mock('../../hooks/useRecording', () => ({
  useRecording: () => ({ armedTrackIds: [], toggleArmTrack: vi.fn() }),
}));
vi.mock('../../hooks/useAudioEngine', () => ({
  getAudioEngine: () => ({ getTrackLevel: () => 0 }),
}));

import { useProjectStore } from '../../store/projectStore';

describe('GENRE_TEMPLATES', () => {
  it('has templates for common genres', () => {
    const genres = GENRE_TEMPLATES.map((t) => t.genre);
    expect(genres).toContain('house');
    expect(genres).toContain('techno');
    expect(genres).toContain('hiphop');
  });

  it('each template has 4 roles', () => {
    for (const template of GENRE_TEMPLATES) {
      expect(template.drums).not.toBeUndefined();
      expect(template.bass).not.toBeUndefined();
      expect(template.chords).not.toBeUndefined();
      expect(template.melody).not.toBeUndefined();
    }
  });
});

describe('getArrangementTemplate', () => {
  it('returns the correct template for a known genre', () => {
    const template = getArrangementTemplate('house');
    expect(template.genre).toBe('house');
  });

  it('is case-insensitive', () => {
    const template = getArrangementTemplate('House');
    expect(template.genre).toBe('house');
  });

  it('falls back to house for unknown genres', () => {
    const template = getArrangementTemplate('unknown_genre');
    expect(template.genre).toBe('house');
  });
});

describe('scaffoldStrudelArrangement store action', () => {
  beforeEach(() => {
    useProjectStore.getState().createProject('Test Project');
  });

  it('creates 4 strudel tracks for a given genre', async () => {
    const store = useProjectStore.getState();
    const trackIds = await store.scaffoldStrudelArrangement('house');

    expect(trackIds).toHaveLength(4);

    const project = useProjectStore.getState().project!;
    const newTracks = project.tracks.filter((t) => trackIds.includes(t.id));

    expect(newTracks).toHaveLength(4);
    for (const track of newTracks) {
      expect(track.trackType).toBe('strudel');
      expect(track.strudelCode.length).toBeGreaterThan(0);
    }
  });

  it('names tracks with genre and role', async () => {
    const store = useProjectStore.getState();
    await store.scaffoldStrudelArrangement('techno');

    const project = useProjectStore.getState().project!;
    const strudelTracks = project.tracks.filter((t) => t.trackType === 'strudel');
    const names = strudelTracks.map((t) => t.displayName);

    expect(names).toContain('Techno Drums');
    expect(names).toContain('Techno Bass');
    expect(names).toContain('Techno Chords');
    expect(names).toContain('Techno Melody');
  });

  it('returns empty array when no project exists', async () => {
    // Clear project
    useProjectStore.setState({ project: null });
    const store = useProjectStore.getState();
    const trackIds = await store.scaffoldStrudelArrangement('house');
    expect(trackIds).toEqual([]);
  });
});
