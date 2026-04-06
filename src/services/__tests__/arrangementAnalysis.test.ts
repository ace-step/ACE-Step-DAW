import { describe, it, expect } from 'vitest';
import {
  detectSections,
  suggestNextSection,
  suggestInstrumentation,
  suggestChordProgression,
  detectGaps,
  analyzeArrangement,
} from '../arrangementAnalysis';
import type { Track, Clip, Project } from '../../types/project';
import type { ArrangementSection } from '../../types/arrangement';

// ─── Test Helpers ──────────────────────────────────────────────────────────

function makeClip(overrides: Partial<Clip> = {}): Clip {
  return {
    id: overrides.id ?? 'clip-1',
    trackId: overrides.trackId ?? 'track-1',
    startTime: overrides.startTime ?? 0,
    duration: overrides.duration ?? 10,
    prompt: overrides.prompt ?? 'pop vocal',
    lyrics: overrides.lyrics ?? '',
    generationStatus: 'completed',
    generationJobId: null,
    cumulativeMixKey: null,
    isolatedAudioKey: null,
    waveformPeaks: null,
    ...overrides,
  };
}

function makeTrack(overrides: Partial<Track> = {}): Track {
  return {
    id: overrides.id ?? 'track-1',
    trackName: overrides.trackName ?? 'vocals',
    displayName: overrides.displayName ?? 'Vocals',
    color: '#ff0000',
    order: 0,
    volume: 0.8,
    muted: false,
    soloed: false,
    clips: overrides.clips ?? [],
    ...overrides,
  };
}

function makeProject(overrides: Partial<Project> = {}): Project {
  return {
    id: 'project-1',
    name: 'Test Project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    bpm: overrides.bpm ?? 120,
    keyScale: overrides.keyScale ?? 'C major',
    timeSignature: overrides.timeSignature ?? 4,
    totalDuration: overrides.totalDuration ?? 120,
    tracks: overrides.tracks ?? [],
    generationDefaults: {
      duration: 30,
    } as Project['generationDefaults'],
    ...overrides,
  };
}

// ─── Section Detection ────────────────────────────────────────────────────

describe('detectSections', () => {
  it('returns empty array for empty arrangement', () => {
    const project = makeProject({ tracks: [] });
    const sections = detectSections(project);
    expect(sections).toEqual([]);
  });

  it('detects a single section from contiguous clips', () => {
    const track = makeTrack({
      clips: [
        makeClip({ startTime: 0, duration: 10 }),
        makeClip({ id: 'clip-2', startTime: 10, duration: 10 }),
      ],
    });
    const project = makeProject({ tracks: [track] });
    const sections = detectSections(project);
    expect(sections.length).toBeGreaterThanOrEqual(1);
    expect(sections[0].startTime).toBe(0);
    expect(sections[0].endTime).toBe(20);
    expect(sections[0].trackIds).toContain('track-1');
  });

  it('detects multiple sections separated by gaps', () => {
    const track = makeTrack({
      clips: [
        makeClip({ startTime: 0, duration: 10 }),
        makeClip({ id: 'clip-2', startTime: 30, duration: 10 }),
      ],
    });
    const project = makeProject({ tracks: [track] });
    const sections = detectSections(project);
    expect(sections.length).toBe(2);
    expect(sections[0].startTime).toBe(0);
    expect(sections[0].endTime).toBe(10);
    expect(sections[1].startTime).toBe(30);
    expect(sections[1].endTime).toBe(40);
  });

  it('classifies first section as intro when short relative to others', () => {
    const track = makeTrack({
      clips: [
        makeClip({ startTime: 0, duration: 8 }),
        makeClip({ id: 'clip-2', startTime: 8, duration: 30 }),
        makeClip({ id: 'clip-3', startTime: 38, duration: 30 }),
      ],
    });
    const project = makeProject({ tracks: [track] });
    const sections = detectSections(project);
    expect(sections[0].type).toBe('intro');
  });

  it('classifies last section as outro when short relative to others', () => {
    const track = makeTrack({
      clips: [
        makeClip({ startTime: 0, duration: 30 }),
        makeClip({ id: 'clip-2', startTime: 30, duration: 30 }),
        makeClip({ id: 'clip-3', startTime: 60, duration: 8 }),
      ],
    });
    const project = makeProject({ tracks: [track] });
    const sections = detectSections(project);
    const lastSection = sections[sections.length - 1];
    expect(lastSection.type).toBe('outro');
  });

  it('merges overlapping clips from multiple tracks into sections', () => {
    const track1 = makeTrack({
      id: 'track-1',
      clips: [makeClip({ trackId: 'track-1', startTime: 0, duration: 20 })],
    });
    const track2 = makeTrack({
      id: 'track-2',
      displayName: 'Bass',
      trackName: 'bass',
      clips: [makeClip({ id: 'clip-bass', trackId: 'track-2', startTime: 5, duration: 20 })],
    });
    const project = makeProject({ tracks: [track1, track2] });
    const sections = detectSections(project);
    expect(sections.length).toBe(1);
    expect(sections[0].trackIds).toContain('track-1');
    expect(sections[0].trackIds).toContain('track-2');
    expect(sections[0].startTime).toBe(0);
    expect(sections[0].endTime).toBe(25);
  });

  it('assigns IDs to all detected sections', () => {
    const track = makeTrack({
      clips: [
        makeClip({ startTime: 0, duration: 10 }),
        makeClip({ id: 'clip-2', startTime: 30, duration: 10 }),
      ],
    });
    const project = makeProject({ tracks: [track] });
    const sections = detectSections(project);
    for (const section of sections) {
      expect(section.id).toBeTruthy();
    }
  });

  it('uses markers when available instead of clip-based detection', () => {
    const track = makeTrack({
      clips: [
        makeClip({ startTime: 0, duration: 60 }),
      ],
    });
    const project = makeProject({
      tracks: [track],
      totalDuration: 60,
    });
    // Add markers
    (project as any).markers = [
      { id: 'm1', time: 0, name: 'Intro', color: '#6366f1' },
      { id: 'm2', time: 8, name: 'Verse', color: '#22c55e' },
      { id: 'm3', time: 40, name: 'Chorus', color: '#f59e0b' },
    ];
    const sections = detectSections(project);
    expect(sections.length).toBe(3);
    expect(sections[0].type).toBe('intro');
    expect(sections[1].type).toBe('verse');
    expect(sections[2].type).toBe('chorus');
    expect(sections[0].confidence).toBe(0.95);
  });
});

// ─── Next Section Suggestions ────────────────────────────────────────────

describe('suggestNextSection', () => {
  it('suggests intro when arrangement is empty', () => {
    const suggestion = suggestNextSection([], {
      bpm: 120,
      keyScale: 'C major',
      timeSignature: 4,
      timeSignatureDenominator: 4,
      totalDuration: 0,
    });
    expect(suggestion).not.toBeNull();
    expect(suggestion!.sectionType).toBe('intro');
    expect(suggestion!.time).toBe(0);
  });

  it('suggests verse after intro', () => {
    const sections: ArrangementSection[] = [
      { id: '1', type: 'intro', startTime: 0, endTime: 8, trackIds: ['t1'], confidence: 0.9 },
    ];
    const suggestion = suggestNextSection(sections, {
      bpm: 120,
      keyScale: 'C major',
      timeSignature: 4,
      timeSignatureDenominator: 4,
      totalDuration: 8,
    });
    expect(suggestion).not.toBeNull();
    expect(suggestion!.sectionType).toBe('verse');
    expect(suggestion!.time).toBe(8);
  });

  it('suggests chorus after verse', () => {
    const sections: ArrangementSection[] = [
      { id: '1', type: 'intro', startTime: 0, endTime: 8, trackIds: ['t1'], confidence: 0.9 },
      { id: '2', type: 'verse', startTime: 8, endTime: 40, trackIds: ['t1'], confidence: 0.9 },
    ];
    const suggestion = suggestNextSection(sections, {
      bpm: 120,
      keyScale: 'C major',
      timeSignature: 4,
      timeSignatureDenominator: 4,
      totalDuration: 40,
    });
    expect(suggestion).not.toBeNull();
    expect(suggestion!.sectionType).toBe('chorus');
    expect(suggestion!.time).toBe(40);
  });

  it('suggests bridge after second chorus', () => {
    const sections: ArrangementSection[] = [
      { id: '1', type: 'intro', startTime: 0, endTime: 8, trackIds: ['t1'], confidence: 0.9 },
      { id: '2', type: 'verse', startTime: 8, endTime: 40, trackIds: ['t1'], confidence: 0.9 },
      { id: '3', type: 'chorus', startTime: 40, endTime: 72, trackIds: ['t1'], confidence: 0.9 },
      { id: '4', type: 'verse', startTime: 72, endTime: 104, trackIds: ['t1'], confidence: 0.9 },
      { id: '5', type: 'chorus', startTime: 104, endTime: 136, trackIds: ['t1'], confidence: 0.9 },
    ];
    const suggestion = suggestNextSection(sections, {
      bpm: 120,
      keyScale: 'C major',
      timeSignature: 4,
      timeSignatureDenominator: 4,
      totalDuration: 136,
    });
    expect(suggestion).not.toBeNull();
    expect(suggestion!.sectionType).toBe('bridge');
  });

  it('includes duration in the suggestion', () => {
    const suggestion = suggestNextSection([], {
      bpm: 120,
      keyScale: 'C major',
      timeSignature: 4,
      timeSignatureDenominator: 4,
      totalDuration: 0,
    });
    expect(suggestion).not.toBeNull();
    expect(suggestion!.duration).toBeGreaterThan(0);
  });

  it('respects project key and tempo in suggestion metadata', () => {
    const suggestion = suggestNextSection([], {
      bpm: 140,
      keyScale: 'A minor',
      timeSignature: 4,
      timeSignatureDenominator: 4,
      totalDuration: 0,
    });
    expect(suggestion).not.toBeNull();
    expect(suggestion!.description).toContain('A minor');
  });

  it('returns null after outro (terminal section)', () => {
    const sections: ArrangementSection[] = [
      { id: '1', type: 'intro', startTime: 0, endTime: 8, trackIds: ['t1'], confidence: 0.9 },
      { id: '2', type: 'verse', startTime: 8, endTime: 40, trackIds: ['t1'], confidence: 0.9 },
      { id: '3', type: 'outro', startTime: 40, endTime: 48, trackIds: ['t1'], confidence: 0.9 },
    ];
    const suggestion = suggestNextSection(sections, {
      bpm: 120,
      keyScale: 'C major',
      timeSignature: 4,
      timeSignatureDenominator: 4,
      totalDuration: 48,
    });
    expect(suggestion).toBeNull();
  });
});

// ─── Instrumentation Suggestions ────────────────────────────────────────

describe('suggestInstrumentation', () => {
  it('returns empty array when no sections exist', () => {
    const suggestions = suggestInstrumentation([], [], {
      bpm: 120,
      keyScale: 'C major',
      timeSignature: 4,
      timeSignatureDenominator: 4,
      totalDuration: 0,
    });
    expect(suggestions).toEqual([]);
  });

  it('suggests adding instruments when section has few tracks', () => {
    const sections: ArrangementSection[] = [
      { id: '1', type: 'verse', startTime: 0, endTime: 30, trackIds: ['vocals'], confidence: 0.9 },
    ];
    const tracks = [makeTrack({ id: 'vocals', trackName: 'vocals', displayName: 'Vocals' })];
    const suggestions = suggestInstrumentation(sections, tracks, {
      bpm: 120,
      keyScale: 'C major',
      timeSignature: 4,
      timeSignatureDenominator: 4,
      totalDuration: 30,
    });
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].kind).toBe('instrumentation');
  });

  it('suggests building up instrumentation from verse to chorus', () => {
    const sections: ArrangementSection[] = [
      { id: '1', type: 'verse', startTime: 0, endTime: 30, trackIds: ['vocals', 'guitar'], confidence: 0.9 },
      { id: '2', type: 'chorus', startTime: 30, endTime: 60, trackIds: ['vocals', 'guitar'], confidence: 0.9 },
    ];
    const tracks = [
      makeTrack({ id: 'vocals', trackName: 'vocals', displayName: 'Vocals' }),
      makeTrack({ id: 'guitar', trackName: 'guitar', displayName: 'Guitar' }),
    ];
    const suggestions = suggestInstrumentation(sections, tracks, {
      bpm: 120,
      keyScale: 'C major',
      timeSignature: 4,
      timeSignatureDenominator: 4,
      totalDuration: 60,
    });
    // Should suggest adding more instruments to the chorus for energy buildup
    const chorusSuggestions = suggestions.filter((s) => s.time >= 30);
    expect(chorusSuggestions.length).toBeGreaterThan(0);
  });
});

// ─── Chord Progression Suggestions ──────────────────────────────────────

describe('suggestChordProgression', () => {
  it('suggests I-V-vi-IV for pop in C major', () => {
    const suggestions = suggestChordProgression(
      [{ id: '1', type: 'verse', startTime: 0, endTime: 30, trackIds: ['t1'], confidence: 0.9 }],
      { bpm: 120, keyScale: 'C major', timeSignature: 4, timeSignatureDenominator: 4, totalDuration: 30 },
    );
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].kind).toBe('chord-progression');
    expect(suggestions[0].description).toBeTruthy();
  });

  it('returns key-appropriate chords', () => {
    const suggestions = suggestChordProgression(
      [{ id: '1', type: 'chorus', startTime: 0, endTime: 30, trackIds: ['t1'], confidence: 0.9 }],
      { bpm: 120, keyScale: 'G major', timeSignature: 4, timeSignatureDenominator: 4, totalDuration: 30 },
    );
    expect(suggestions.length).toBeGreaterThan(0);
    // Chords should reference the key
    expect(suggestions[0].description.toLowerCase()).toContain('g');
  });

  it('suggests minor key progressions for minor keys', () => {
    const suggestions = suggestChordProgression(
      [{ id: '1', type: 'verse', startTime: 0, endTime: 30, trackIds: ['t1'], confidence: 0.9 }],
      { bpm: 120, keyScale: 'A minor', timeSignature: 4, timeSignatureDenominator: 4, totalDuration: 30 },
    );
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0].description.toLowerCase()).toContain('a');
  });
});

// ─── Gap Detection ──────────────────────────────────────────────────────

describe('detectGaps', () => {
  it('detects gap between two clips', () => {
    const track = makeTrack({
      clips: [
        makeClip({ startTime: 0, duration: 10 }),
        makeClip({ id: 'clip-2', startTime: 30, duration: 10 }),
      ],
    });
    const project = makeProject({ tracks: [track], totalDuration: 40 });
    const gaps = detectGaps(project);
    expect(gaps.length).toBe(1);
    expect(gaps[0].time).toBe(10);
    expect(gaps[0].duration).toBe(20);
    expect(gaps[0].kind).toBe('fill-gap');
  });

  it('returns empty when no gaps exist', () => {
    const track = makeTrack({
      clips: [
        makeClip({ startTime: 0, duration: 10 }),
        makeClip({ id: 'clip-2', startTime: 10, duration: 10 }),
      ],
    });
    const project = makeProject({ tracks: [track], totalDuration: 20 });
    const gaps = detectGaps(project);
    expect(gaps).toEqual([]);
  });

  it('ignores small gaps (< 2 seconds)', () => {
    const track = makeTrack({
      clips: [
        makeClip({ startTime: 0, duration: 10 }),
        makeClip({ id: 'clip-2', startTime: 11, duration: 10 }),
      ],
    });
    const project = makeProject({ tracks: [track], totalDuration: 21 });
    const gaps = detectGaps(project);
    expect(gaps).toEqual([]);
  });

  it('uses adjacent clip context for gap fill prompt', () => {
    const track = makeTrack({
      clips: [
        makeClip({ startTime: 0, duration: 10, prompt: 'energetic pop verse' }),
        makeClip({ id: 'clip-2', startTime: 30, duration: 10, prompt: 'upbeat chorus' }),
      ],
    });
    const project = makeProject({ tracks: [track], totalDuration: 40 });
    const gaps = detectGaps(project);
    expect(gaps.length).toBe(1);
    expect(gaps[0].prompt).toBeTruthy();
  });
});

// ─── Full Analysis ──────────────────────────────────────────────────────

describe('analyzeArrangement', () => {
  it('produces a complete analysis with sections and suggestions', () => {
    const track = makeTrack({
      trackName: 'vocals',
      clips: [
        makeClip({ startTime: 0, duration: 8, prompt: 'gentle intro' }),
        makeClip({ id: 'clip-2', startTime: 8, duration: 30, prompt: 'verse vocals' }),
      ],
    });
    const project = makeProject({
      tracks: [track],
      bpm: 120,
      keyScale: 'C major',
      totalDuration: 60,
    });
    const analysis = analyzeArrangement(project);
    expect(analysis.sections.length).toBeGreaterThan(0);
    expect(analysis.suggestions.length).toBeGreaterThan(0);
    expect(analysis.projectMeta.bpm).toBe(120);
    expect(analysis.projectMeta.keyScale).toBe('C major');
  });

  it('returns suggestions that respect project tempo and key', () => {
    const track = makeTrack({
      clips: [makeClip({ startTime: 0, duration: 30 })],
    });
    const project = makeProject({
      tracks: [track],
      bpm: 140,
      keyScale: 'E minor',
      totalDuration: 30,
    });
    const analysis = analyzeArrangement(project);
    expect(analysis.projectMeta.bpm).toBe(140);
    expect(analysis.projectMeta.keyScale).toBe('E minor');
    // All suggestions should have valid time positions
    for (const s of analysis.suggestions) {
      expect(s.time).toBeGreaterThanOrEqual(0);
      expect(s.duration).toBeGreaterThan(0);
    }
  });
});
