import { describe, it, expect } from 'vitest';
import {
  SOUND_DESIGN_TEMPLATES,
  getTemplateById,
  getTemplatesByGenre,
  getAllTemplateGenres,
  toProjectTemplate,
  type SoundDesignTemplate,
  type TrackTemplate,
} from '../templates/soundDesignTemplates';

describe('SoundDesignTemplate type structure', () => {
  it('exports at least 10 genre templates', () => {
    expect(SOUND_DESIGN_TEMPLATES.length).toBeGreaterThanOrEqual(10);
  });

  it('each template has required fields', () => {
    for (const t of SOUND_DESIGN_TEMPLATES) {
      expect(t.id).toBeTruthy();
      expect(t.name).toBeTruthy();
      expect(t.genre).toBeTruthy();
      expect(t.description).toBeTruthy();
      expect(Array.isArray(t.tracks)).toBe(true);
      expect(t.tracks.length).toBeGreaterThanOrEqual(2);
      expect(t.generationDefaults).toBeDefined();
    }
  });

  it('each template has unique id', () => {
    const ids = SOUND_DESIGN_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('each template has unique name', () => {
    const names = SOUND_DESIGN_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('TrackTemplate structure', () => {
  it('each track template has required fields', () => {
    for (const template of SOUND_DESIGN_TEMPLATES) {
      for (const track of template.tracks) {
        expect(track.role).toBeTruthy();
        expect(track.trackName).toBeTruthy();
        expect(track.trackType).toBeTruthy();
        expect(track.displayName).toBeTruthy();
        expect(track.stemDescription).toBeTruthy();
      }
    }
  });

  it('track templates have valid trackType values', () => {
    const validTrackTypes = ['stems', 'mix', 'sample', 'sequencer', 'pianoRoll', 'drumMachine', 'strudel', 'video'];
    for (const template of SOUND_DESIGN_TEMPLATES) {
      for (const track of template.tracks) {
        expect(validTrackTypes).toContain(track.trackType);
      }
    }
  });

  it('each track has a color', () => {
    for (const template of SOUND_DESIGN_TEMPLATES) {
      for (const track of template.tracks) {
        expect(track.color).toMatch(/^#[0-9a-fA-F]{6}$/);
      }
    }
  });
});

describe('Template generation defaults', () => {
  it('each template has a globalCaption prompt suggestion', () => {
    for (const t of SOUND_DESIGN_TEMPLATES) {
      expect(t.generationDefaults.globalCaption).toBeTruthy();
      expect(t.generationDefaults.globalCaption.length).toBeGreaterThan(10);
    }
  });
});

describe('getTemplateById', () => {
  it('returns template by ID', () => {
    const first = SOUND_DESIGN_TEMPLATES[0];
    const result = getTemplateById(first.id);
    expect(result).toBe(first);
  });

  it('returns undefined for unknown ID', () => {
    expect(getTemplateById('nonexistent')).toBeUndefined();
  });
});

describe('getTemplatesByGenre', () => {
  it('filters templates by genre', () => {
    const genres = getAllTemplateGenres();
    expect(genres.length).toBeGreaterThanOrEqual(1);
    const first = genres[0];
    const results = getTemplatesByGenre(first);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.every((t) => t.genre === first)).toBe(true);
  });
});

describe('getAllTemplateGenres', () => {
  it('returns unique genres', () => {
    const genres = getAllTemplateGenres();
    expect(new Set(genres).size).toBe(genres.length);
    expect(genres.length).toBeGreaterThanOrEqual(5);
  });
});

describe('toProjectTemplate', () => {
  it('converts a SoundDesignTemplate to a valid ProjectTemplate', () => {
    const template = SOUND_DESIGN_TEMPLATES[0];
    const result = toProjectTemplate(template);
    expect(result.id).toBe(template.id);
    expect(result.name).toBe(template.name);
    expect(result.description).toBe(template.description);
    expect(result.tracks.length).toBe(template.tracks.length);
    expect(result.bpm).toBe(120);
    expect(result.keyScale).toBe('C major');
    expect(result.timeSignature).toBe(4);
    expect(result.generationDefaults).toBeDefined();
  });

  it('respects custom bpm and keyScale options', () => {
    const template = SOUND_DESIGN_TEMPLATES[0];
    const result = toProjectTemplate(template, { bpm: 90, keyScale: 'D minor' });
    expect(result.bpm).toBe(90);
    expect(result.keyScale).toBe('D minor');
  });

  it('carries localCaption from stemDescription', () => {
    const template = SOUND_DESIGN_TEMPLATES[0];
    const result = toProjectTemplate(template);
    for (let i = 0; i < template.tracks.length; i++) {
      expect(result.tracks[i].localCaption).toBe(template.tracks[i].stemDescription);
    }
  });

  it('resolves instrument from presetId when available', () => {
    const synthwave = SOUND_DESIGN_TEMPLATES.find((t) => t.id === 'template-synthwave')!;
    const result = toProjectTemplate(synthwave);
    const leadTrack = result.tracks.find((t) => t.displayName === 'Retro Lead');
    expect(leadTrack?.instrument).toBeDefined();
    expect(leadTrack?.instrument?.kind).toBe('subtractive');
  });
});

describe('genre-specific template content quality', () => {
  it('Lo-fi Hip Hop template has appropriate tracks', () => {
    const lofi = SOUND_DESIGN_TEMPLATES.find((t) => t.name.toLowerCase().includes('lo-fi'));
    expect(lofi).toBeDefined();
    const roles = lofi!.tracks.map((t) => t.role.toLowerCase());
    expect(roles.some((r) => r.includes('bass') || r.includes('keys') || r.includes('drum'))).toBe(true);
  });

  it('Synthwave template has appropriate tracks', () => {
    const synth = SOUND_DESIGN_TEMPLATES.find((t) => t.name.toLowerCase().includes('synthwave'));
    expect(synth).toBeDefined();
    const roles = synth!.tracks.map((t) => t.role.toLowerCase());
    expect(roles.some((r) => r.includes('synth') || r.includes('bass') || r.includes('drum'))).toBe(true);
  });

  it('Orchestral template has appropriate tracks', () => {
    const orch = SOUND_DESIGN_TEMPLATES.find((t) => t.name.toLowerCase().includes('orchestral'));
    expect(orch).toBeDefined();
    const roles = orch!.tracks.map((t) => t.role.toLowerCase());
    expect(roles.some((r) => r.includes('string') || r.includes('brass') || r.includes('woodwind'))).toBe(true);
  });
});
