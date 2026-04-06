/**
 * Arrangement Analysis Service
 *
 * Analyzes the current arrangement to detect sections, suggest next sections,
 * recommend instrumentation changes, chord progressions, and fill gaps.
 */
import { v4 as uuidv4 } from 'uuid';
import type { Project, Track } from '../types/project';
import type {
  ArrangementSection,
  ArrangementSuggestion,
  ArrangementAnalysis,
  SectionType,
} from '../types/arrangement';
import { computeSections as computeMarkerSections } from '../utils/arrangementSections';

/** Shared project metadata passed to suggestion functions. */
type ProjectMeta = {
  bpm: number;
  keyScale: string;
  timeSignature: number;
  timeSignatureDenominator: number;
  totalDuration: number;
};

// ─── Section Detection ────────────────────────────────────────────────────

interface TimeRegion {
  startTime: number;
  endTime: number;
  trackIds: Set<string>;
}

/**
 * Merge overlapping clip time ranges into contiguous regions across all tracks.
 */
function mergeClipRegions(project: Project): TimeRegion[] {
  // Collect all clip intervals
  const intervals: { start: number; end: number; trackId: string }[] = [];
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.duration > 0) {
        intervals.push({
          start: clip.startTime,
          end: clip.startTime + clip.duration,
          trackId: track.id,
        });
      }
    }
  }

  if (intervals.length === 0) return [];

  // Sort by start time
  intervals.sort((a, b) => a.start - b.start);

  // Merge overlapping intervals
  const regions: TimeRegion[] = [];
  let current: TimeRegion = {
    startTime: intervals[0].start,
    endTime: intervals[0].end,
    trackIds: new Set([intervals[0].trackId]),
  };

  for (let i = 1; i < intervals.length; i++) {
    const interval = intervals[i];
    if (interval.start <= current.endTime) {
      // Overlapping — extend
      current.endTime = Math.max(current.endTime, interval.end);
      current.trackIds.add(interval.trackId);
    } else {
      // Gap — save current and start new
      regions.push(current);
      current = {
        startTime: interval.start,
        endTime: interval.end,
        trackIds: new Set([interval.trackId]),
      };
    }
  }
  regions.push(current);

  return regions;
}

/**
 * Classify a section based on its position, duration, and context.
 */
/**
 * Classify sections for an array of regions.
 * Two-pass: first detect intro/outro, then alternate verse/chorus for the body.
 */
function classifySections(regions: TimeRegion[]): { type: SectionType; confidence: number }[] {
  if (regions.length === 0) return [];
  if (regions.length === 1) return [{ type: 'verse', confidence: 0.5 }];

  const avgDuration = regions.reduce((sum, r) => sum + (r.endTime - r.startTime), 0) / regions.length;
  const results: { type: SectionType; confidence: number }[] = new Array(regions.length);

  // Detect intro (first, short) and outro (last, short)
  const firstDur = regions[0].endTime - regions[0].startTime;
  const lastDur = regions[regions.length - 1].endTime - regions[regions.length - 1].startTime;
  const hasIntro = firstDur < avgDuration * 0.75;
  const hasOutro = regions.length > 1 && lastDur < avgDuration * 0.75;

  let bodyStart = 0;
  let bodyEnd = regions.length;

  if (hasIntro) {
    results[0] = { type: 'intro', confidence: 0.8 };
    bodyStart = 1;
  }
  if (hasOutro) {
    results[regions.length - 1] = { type: 'outro', confidence: 0.8 };
    bodyEnd = regions.length - 1;
  }

  // Alternate verse/chorus for body sections
  let bodyIdx = 0;
  for (let i = bodyStart; i < bodyEnd; i++) {
    if (!results[i]) {
      results[i] = bodyIdx % 2 === 0
        ? { type: 'verse', confidence: 0.6 }
        : { type: 'chorus', confidence: 0.6 };
      bodyIdx++;
    }
  }

  return results;
}

/**
 * Split a contiguous region into sub-sections when clips show clear structural
 * differences (e.g. a short intro followed by longer verses).
 * Only splits when clip durations vary significantly.
 */
function splitRegionByClipDurations(region: TimeRegion, project: Project): TimeRegion[] {
  // Collect all clips within this region, sorted by start time
  const clipsInRegion: { start: number; end: number; duration: number; trackId: string }[] = [];
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      const clipEnd = clip.startTime + clip.duration;
      if (clip.startTime >= region.startTime && clipEnd <= region.endTime && clip.duration > 0) {
        clipsInRegion.push({
          start: clip.startTime,
          end: clipEnd,
          duration: clip.duration,
          trackId: track.id,
        });
      }
    }
  }

  if (clipsInRegion.length <= 1) return [region];

  // Group clips by track, then find split points where consecutive clips
  // on the same track have significantly different durations (ratio > 2x)
  const clipsByTrack = new Map<string, typeof clipsInRegion>();
  for (const clip of clipsInRegion) {
    const arr = clipsByTrack.get(clip.trackId);
    if (arr) arr.push(clip);
    else clipsByTrack.set(clip.trackId, [clip]);
  }

  const splitPoints = new Set<number>([region.startTime, region.endTime]);
  for (const trackClips of clipsByTrack.values()) {
    trackClips.sort((a, b) => a.start - b.start);
    for (let i = 1; i < trackClips.length; i++) {
      const prev = trackClips[i - 1];
      const curr = trackClips[i];
      const ratio = Math.max(prev.duration, curr.duration) / Math.min(prev.duration, curr.duration);
      if (ratio >= 2) {
        splitPoints.add(curr.start);
      }
    }
  }

  const orderedSplitPoints = [...splitPoints].sort((a, b) => a - b);

  if (orderedSplitPoints.length <= 2) return [region];

  // Create sub-regions from split points
  const subRegions: TimeRegion[] = [];
  for (let i = 0; i < orderedSplitPoints.length - 1; i++) {
    const start = orderedSplitPoints[i];
    const end = orderedSplitPoints[i + 1];
    const trackIds = new Set<string>();
    for (const clip of clipsInRegion) {
      // Overlap check: clip spans into this sub-region
      if (clip.start < end && clip.end > start) {
        trackIds.add(clip.trackId);
      }
    }
    if (trackIds.size > 0) {
      subRegions.push({ startTime: start, endTime: end, trackIds });
    }
  }

  return subRegions.length > 0 ? subRegions : [region];
}

/**
 * Detect musical sections in the arrangement.
 *
 * When the project has arrangement markers, those are used as the primary
 * source of section boundaries (integrating with `computeSections` from
 * `utils/arrangementSections`). When no markers exist, falls back to
 * clip-position-based heuristic detection.
 */
export function detectSections(project: Project): ArrangementSection[] {
  // Keep empty-name markers so computeMarkerSections uses them as boundaries,
  // but skip emitting boundary-only sections in the returned analysis.
  const allMarkers = project.markers;
  if (allMarkers && allMarkers.length > 0) {
    const markerSections = computeMarkerSections(allMarkers, project.totalDuration);
    return markerSections
      .map((ms) => ({
        ...ms,
        startTime: Math.max(0, Math.min(ms.startTime, project.totalDuration)),
        endTime: Math.max(0, Math.min(ms.endTime, project.totalDuration)),
      }))
      .filter((ms) => ms.marker.name.trim().length > 0 && ms.endTime > ms.startTime)
      .map((ms) => {
      const trackIds = new Set<string>();
      for (const track of project.tracks) {
        for (const clip of track.clips) {
          const clipEnd = clip.startTime + clip.duration;
          if (clip.startTime < ms.endTime && clipEnd > ms.startTime) {
            trackIds.add(track.id);
          }
        }
      }
      const sectionName = ms.marker.name.toLowerCase().trim();
      const knownTypes: SectionType[] = [
        'intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro',
        'drop', 'breakdown', 'solo', 'interlude', 'hook', 'build', 'tag',
      ];
      const isKnownSectionType = (value: string): value is SectionType =>
        (knownTypes as string[]).includes(value);
      const type: SectionType = isKnownSectionType(sectionName) ? sectionName : 'unknown';
      return {
        id: uuidv4(),
        type,
        startTime: ms.startTime,
        endTime: ms.endTime,
        trackIds: [...trackIds],
        confidence: 0.95,
      };
    });
  }

  // Fallback: clip-based detection
  const regions = mergeClipRegions(project);
  if (regions.length === 0) return [];

  // If we have a single contiguous region, try to split by clip boundaries
  let finalRegions: TimeRegion[];
  if (regions.length === 1) {
    finalRegions = splitRegionByClipDurations(regions[0], project);
  } else {
    finalRegions = regions;
  }

  const classifications = classifySections(finalRegions);

  return finalRegions.map((region, index) => {
    const { type, confidence } = classifications[index];
    return {
      id: uuidv4(),
      type,
      startTime: region.startTime,
      endTime: region.endTime,
      trackIds: [...region.trackIds],
      confidence,
    };
  });
}

// ─── Next Section Suggestions ────────────────────────────────────────────

/** Standard pop/rock song structure progression rules. */
const SECTION_FLOW: Record<SectionType, SectionType[]> = {
  'intro': ['verse'],
  'verse': ['chorus', 'pre-chorus'],
  'pre-chorus': ['chorus'],
  'chorus': ['verse', 'bridge', 'outro'],
  'bridge': ['chorus', 'outro'],
  'outro': [],
  'drop': ['breakdown', 'verse'],
  'breakdown': ['drop', 'chorus'],
  'solo': ['chorus', 'verse'],
  'interlude': ['verse', 'chorus'],
  'hook': ['verse', 'bridge'],
  'build': ['drop', 'chorus'],
  'tag': ['outro'],
  'unknown': ['verse'],
};

/** Typical section durations in bars (at 4/4 time). */
const SECTION_BARS: Record<SectionType, number> = {
  'intro': 4,
  'verse': 8,
  'pre-chorus': 4,
  'chorus': 8,
  'bridge': 8,
  'outro': 4,
  'drop': 8,
  'breakdown': 4,
  'solo': 8,
  'interlude': 4,
  'hook': 4,
  'build': 4,
  'tag': 4,
  'unknown': 8,
};

function barsToSeconds(bars: number, bpm: number, timeSignature: number, timeSignatureDenominator: number = 4): number {
  // A bar contains `timeSignature` beats of duration `1/timeSignatureDenominator`.
  // BPM refers to quarter-note beats, so one denominator-beat = (4 / denominator) quarter beats.
  const quarterBeatsPerBar = timeSignature * (4 / timeSignatureDenominator);
  const secondsPerQuarterBeat = 60 / bpm;
  return bars * quarterBeatsPerBar * secondsPerQuarterBeat;
}

/**
 * Suggest the next section type based on existing arrangement sections.
 */
export function suggestNextSection(
  sections: ArrangementSection[],
  meta: ProjectMeta,
): ArrangementSuggestion | null {
  let nextType: SectionType;
  let startTime: number;

  if (sections.length === 0) {
    nextType = 'intro';
    startTime = 0;
  } else {
    const lastSection = sections[sections.length - 1];
    const candidates = SECTION_FLOW[lastSection.type] ?? ['verse'];

    // Terminal section — no next suggestion after outro/tag
    if (candidates.length === 0) {
      return null;
    }

    // Smart selection: check what we already have to avoid repetition
    const sectionTypeCounts = new Map<SectionType, number>();
    for (const s of sections) {
      sectionTypeCounts.set(s.type, (sectionTypeCounts.get(s.type) ?? 0) + 1);
    }

    // After second chorus, suggest bridge
    const chorusCount = sectionTypeCounts.get('chorus') ?? 0;
    const hasBridge = sectionTypeCounts.has('bridge');
    if (lastSection.type === 'chorus' && chorusCount >= 2 && !hasBridge) {
      nextType = 'bridge';
    } else if (lastSection.type === 'bridge') {
      nextType = 'chorus';
    } else {
      nextType = candidates[0];
    }

    startTime = lastSection.endTime;
  }

  const duration = barsToSeconds(SECTION_BARS[nextType], meta.bpm, meta.timeSignature, meta.timeSignatureDenominator);

  return {
    id: uuidv4(),
    kind: 'next-section',
    title: `Add ${nextType}`,
    description: `Suggest adding a ${nextType} section (${SECTION_BARS[nextType]} bars) in ${meta.keyScale} at ${meta.bpm} BPM`,
    time: startTime,
    duration,
    trackIds: [],
    sectionType: nextType,
    status: 'pending',
  };
}

// ─── Instrumentation Suggestions ────────────────────────────────────────

/** Common instrument suggestions for different section types. */
const SECTION_INSTRUMENTS: Record<SectionType, string[]> = {
  'intro': ['piano', 'strings', 'synth pad'],
  'verse': ['acoustic guitar', 'bass', 'drums', 'piano'],
  'pre-chorus': ['synth', 'drums', 'bass', 'strings'],
  'chorus': ['drums', 'bass', 'guitar', 'synth', 'strings', 'backing vocals'],
  'bridge': ['piano', 'strings', 'synth pad'],
  'outro': ['piano', 'strings'],
  'drop': ['synth', 'bass', 'drums'],
  'breakdown': ['synth pad', 'piano'],
  'solo': ['guitar', 'synth lead'],
  'interlude': ['piano', 'strings'],
  'hook': ['synth', 'guitar', 'vocals'],
  'build': ['synth', 'drums', 'bass'],
  'tag': ['vocals', 'piano'],
  'unknown': ['piano'],
};

/**
 * Suggest instrumentation changes between sections.
 */
export function suggestInstrumentation(
  sections: ArrangementSection[],
  tracks: Track[],
  meta: ProjectMeta,
): ArrangementSuggestion[] {
  if (sections.length === 0) return [];

  const suggestions: ArrangementSuggestion[] = [];
  const trackNameById = new Map(
    tracks.map((t) => [t.id, t.displayName.toLowerCase()] as const),
  );

  for (const section of sections) {
    const recommended = SECTION_INSTRUMENTS[section.type] ?? [];
    // Only check tracks actually present in this section, not all project tracks
    const sectionTrackNames = new Set(
      section.trackIds
        .map((trackId) => trackNameById.get(trackId))
        .filter((name): name is string => typeof name === 'string'),
    );
    const missing = recommended.filter((inst) => {
      return !sectionTrackNames.has(inst) &&
        ![...sectionTrackNames].some((name) => name.includes(inst) || inst.includes(name));
    });

    // Only suggest if the section has notably fewer instruments than recommended
    const sectionTrackCount = section.trackIds.length;
    if (missing.length > 0 && sectionTrackCount < recommended.length - 1) {
      const toSuggest = missing.slice(0, 2); // Limit to 2 suggestions per section
      for (const inst of toSuggest) {
        suggestions.push({
          id: uuidv4(),
          kind: 'instrumentation',
          title: `Add ${inst} to ${section.type}`,
          description: `Consider adding ${inst} to the ${section.type} section for fuller arrangement. This ${section.type === 'chorus' ? 'builds energy' : 'adds texture'}.`,
          time: section.startTime,
          duration: section.endTime - section.startTime,
          trackIds: [],
          prompt: `${inst} part for ${section.type} in ${meta.keyScale}`,
          status: 'pending',
        });
      }
    }
  }

  return suggestions;
}

// ─── Chord Progression Suggestions ──────────────────────────────────────

interface ChordProgression {
  name: string;
  numerals: string;
  chords: (root: string, isMinor: boolean, usesFlats: boolean) => string;
}

const MAJOR_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

/** Map flat note names to their sharp enharmonic equivalents. */
const FLAT_TO_SHARP: Record<string, string> = {
  Db: 'C#', Eb: 'D#', Fb: 'E', Gb: 'F#', Ab: 'G#', Bb: 'A#', Cb: 'B',
};

/** Map sharp notes to their flat enharmonic equivalents for flat-key display. */
const SHARP_TO_FLAT: Record<string, string> = {
  'C#': 'Db', 'D#': 'Eb', 'F#': 'Gb', 'G#': 'Ab', 'A#': 'Bb',
};

function normalizeNote(note: string): string {
  return FLAT_TO_SHARP[note] ?? note;
}

function parseKey(keyScale: string): { root: string; isMinor: boolean; usesFlats: boolean } {
  const parts = keyScale.trim().split(/\s+/);
  const rawRoot = parts[0] ?? 'C';
  const isMinor = (parts[1] ?? '').toLowerCase() === 'minor';
  const usesFlats = rawRoot.includes('b');
  const root = normalizeNote(rawRoot);
  return { root, isMinor, usesFlats };
}

function getNoteAt(root: string, semitones: number, usesFlats: boolean = false): string {
  const rootIdx = MAJOR_NOTES.indexOf(normalizeNote(root));
  if (rootIdx === -1) return root;
  const note = MAJOR_NOTES[(rootIdx + semitones) % 12];
  // Display using flats if the key uses flats
  if (usesFlats && SHARP_TO_FLAT[note]) return SHARP_TO_FLAT[note];
  return note;
}

const MAJOR_PROGRESSIONS: ChordProgression[] = [
  {
    name: 'Pop Standard',
    numerals: 'I – V – vi – IV',
    chords: (root, _isMinor, usesFlats) => {
      const V = getNoteAt(root, 7, usesFlats);
      const vi = getNoteAt(root, 9, usesFlats);
      const IV = getNoteAt(root, 5, usesFlats);
      const r = getNoteAt(root, 0, usesFlats);
      return `${r} – ${V} – ${vi}m – ${IV}`;
    },
  },
  {
    name: 'Classic',
    numerals: 'I – IV – V – I',
    chords: (root, _isMinor, usesFlats) => {
      const IV = getNoteAt(root, 5, usesFlats);
      const V = getNoteAt(root, 7, usesFlats);
      const r = getNoteAt(root, 0, usesFlats);
      return `${r} – ${IV} – ${V} – ${r}`;
    },
  },
  {
    name: 'Emotional',
    numerals: 'vi – IV – I – V',
    chords: (root, _isMinor, usesFlats) => {
      const vi = getNoteAt(root, 9, usesFlats);
      const IV = getNoteAt(root, 5, usesFlats);
      const V = getNoteAt(root, 7, usesFlats);
      const r = getNoteAt(root, 0, usesFlats);
      return `${vi}m – ${IV} – ${r} – ${V}`;
    },
  },
];

const MINOR_PROGRESSIONS: ChordProgression[] = [
  {
    name: 'Natural Minor',
    numerals: 'i – VI – III – VII',
    chords: (root, _isMinor, usesFlats) => {
      const r = getNoteAt(root, 0, usesFlats);
      const VI = getNoteAt(root, 8, usesFlats);
      const III = getNoteAt(root, 3, usesFlats);
      const VII = getNoteAt(root, 10, usesFlats);
      return `${r}m – ${VI} – ${III} – ${VII}`;
    },
  },
  {
    name: 'Minor Pop',
    numerals: 'i – iv – VII – III',
    chords: (root, _isMinor, usesFlats) => {
      const r = getNoteAt(root, 0, usesFlats);
      const iv = getNoteAt(root, 5, usesFlats);
      const VII = getNoteAt(root, 10, usesFlats);
      const III = getNoteAt(root, 3, usesFlats);
      return `${r}m – ${iv}m – ${VII} – ${III}`;
    },
  },
  {
    name: 'Dramatic Minor',
    numerals: 'i – VII – VI – V',
    chords: (root, _isMinor, usesFlats) => {
      const r = getNoteAt(root, 0, usesFlats);
      const VII = getNoteAt(root, 10, usesFlats);
      const VI = getNoteAt(root, 8, usesFlats);
      const V = getNoteAt(root, 7, usesFlats);
      return `${r}m – ${VII} – ${VI} – ${V}`;
    },
  },
];

/**
 * Suggest chord progressions for each section based on key and section type.
 */
export function suggestChordProgression(
  sections: ArrangementSection[],
  meta: ProjectMeta,
): ArrangementSuggestion[] {
  if (sections.length === 0) return [];

  const { root, isMinor, usesFlats } = parseKey(meta.keyScale);
  const progressions = isMinor ? MINOR_PROGRESSIONS : MAJOR_PROGRESSIONS;
  const displayRoot = getNoteAt(root, 0, usesFlats);

  const suggestions: ArrangementSuggestion[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    // Pick a progression based on section type (vary it)
    const progIdx = i % progressions.length;
    const prog = progressions[progIdx];
    const chordStr = prog.chords(root, isMinor, usesFlats);

    suggestions.push({
      id: uuidv4(),
      kind: 'chord-progression',
      title: `${prog.name} progression for ${section.type}`,
      description: `${prog.numerals}: ${chordStr} — works well for ${section.type} sections in ${displayRoot} ${isMinor ? 'minor' : 'major'}`,
      time: section.startTime,
      duration: section.endTime - section.startTime,
      trackIds: section.trackIds,
      tags: [chordStr],
      status: 'pending',
    });
  }

  return suggestions;
}

// ─── Gap Detection ──────────────────────────────────────────────────────

const MIN_GAP_SECONDS = 2;

/**
 * Detect gaps in the arrangement where content could be added.
 */
export function detectGaps(project: Project): ArrangementSuggestion[] {
  const suggestions: ArrangementSuggestion[] = [];

  for (const track of project.tracks) {
    if (track.clips.length === 0) continue;

    // Sort clips by start time
    const sortedClips = [...track.clips].sort((a, b) => a.startTime - b.startTime);

    const addGap = (gapStart: number, gapEnd: number, beforeClip?: typeof sortedClips[0], afterClip?: typeof sortedClips[0]) => {
      const gapDuration = gapEnd - gapStart;
      if (gapDuration < MIN_GAP_SECONDS) return;
      const prompts: string[] = [];
      if (beforeClip?.prompt?.trim()) prompts.push(beforeClip.prompt.trim());
      if (afterClip?.prompt?.trim()) prompts.push(afterClip.prompt.trim());
      const prompt = prompts.length > 0
        ? `Transition between: ${prompts.join(' → ')}`
        : `${track.displayName} fill`;
      suggestions.push({
        id: uuidv4(),
        kind: 'fill-gap',
        title: `Fill gap in ${track.displayName}`,
        description: `${gapDuration.toFixed(1)}s gap on "${track.displayName}" between ${formatTime(gapStart)} and ${formatTime(gapEnd)}`,
        time: gapStart,
        duration: gapDuration,
        trackIds: [track.id],
        prompt,
        status: 'pending',
      });
    };

    // Gap before first clip
    addGap(0, sortedClips[0].startTime, undefined, sortedClips[0]);

    // Gaps between clips
    for (let i = 0; i < sortedClips.length - 1; i++) {
      const current = sortedClips[i];
      const next = sortedClips[i + 1];
      addGap(current.startTime + current.duration, next.startTime, current, next);
    }

    // Gap after last clip
    const lastClip = sortedClips[sortedClips.length - 1];
    addGap(lastClip.startTime + lastClip.duration, project.totalDuration, lastClip, undefined);
  }

  return suggestions;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ─── Full Analysis ──────────────────────────────────────────────────────

/**
 * Perform a complete arrangement analysis: detect sections, suggest
 * next section, instrumentation, chords, and gap fills.
 */
export function analyzeArrangement(project: Project): ArrangementAnalysis {
  const meta: ProjectMeta = {
    bpm: project.bpm,
    keyScale: project.keyScale,
    timeSignature: project.timeSignature,
    timeSignatureDenominator: project.timeSignatureDenominator ?? 4,
    totalDuration: project.totalDuration,
  };

  const sections = detectSections(project);
  const suggestions: ArrangementSuggestion[] = [];

  // Next section suggestion (null when arrangement is terminal, e.g. ends with outro)
  const nextSection = suggestNextSection(sections, meta);
  if (nextSection) suggestions.push(nextSection);

  // Instrumentation suggestions
  suggestions.push(...suggestInstrumentation(sections, project.tracks, meta));

  // Chord progression suggestions
  suggestions.push(...suggestChordProgression(sections, meta));

  // Gap fill suggestions
  suggestions.push(...detectGaps(project));

  return {
    sections,
    suggestions,
    projectMeta: meta,
  };
}
