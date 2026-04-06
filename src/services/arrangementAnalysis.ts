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
function classifySection(
  region: TimeRegion,
  index: number,
  totalRegions: number,
  avgDuration: number,
): { type: SectionType; confidence: number } {
  const duration = region.endTime - region.startTime;
  const isFirst = index === 0;
  const isLast = index === totalRegions - 1;
  const isShort = duration < avgDuration * 0.75;

  // Intro: first section and notably shorter than average
  if (isFirst && isShort && totalRegions > 1) {
    return { type: 'intro', confidence: 0.8 };
  }

  // Outro: last section and notably shorter than average
  if (isLast && isShort && totalRegions > 1) {
    return { type: 'outro', confidence: 0.8 };
  }

  // For a single section, default to verse
  if (totalRegions <= 1) {
    return { type: 'verse', confidence: 0.5 };
  }

  // For remaining sections, alternate verse/chorus starting from the first full-length section
  const bodyIndex = isFirst ? 0 : (index - (totalRegions > 2 ? 1 : 0));
  if (bodyIndex % 2 === 0) {
    return { type: 'verse', confidence: 0.6 };
  }
  return { type: 'chorus', confidence: 0.6 };
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

  // Group clips into segments where consecutive clips on the same track
  // have significantly different durations (ratio > 2x)
  const sortedClips = clipsInRegion.sort((a, b) => a.start - b.start);

  // Find split points: boundaries where the clip duration changes significantly
  const splitPoints: number[] = [region.startTime];
  for (let i = 1; i < sortedClips.length; i++) {
    const prev = sortedClips[i - 1];
    const curr = sortedClips[i];
    // Only split if same track and duration ratio > 2x
    if (prev.trackId === curr.trackId) {
      const ratio = Math.max(prev.duration, curr.duration) / Math.min(prev.duration, curr.duration);
      if (ratio >= 2) {
        splitPoints.push(curr.start);
      }
    }
  }
  splitPoints.push(region.endTime);

  if (splitPoints.length <= 2) return [region];

  // Create sub-regions from split points
  const subRegions: TimeRegion[] = [];
  for (let i = 0; i < splitPoints.length - 1; i++) {
    const start = splitPoints[i];
    const end = splitPoints[i + 1];
    const trackIds = new Set<string>();
    for (const clip of clipsInRegion) {
      if (clip.start >= start && clip.start < end) {
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
  // Prefer marker-based sections when available
  if (project.markers && project.markers.length > 0) {
    const markerSections = computeMarkerSections(project.markers, project.totalDuration);
    return markerSections.map((ms) => {
      const trackIds = new Set<string>();
      for (const track of project.tracks) {
        for (const clip of track.clips) {
          const clipEnd = clip.startTime + clip.duration;
          if (clip.startTime < ms.endTime && clipEnd > ms.startTime) {
            trackIds.add(track.id);
          }
        }
      }
      const sectionName = ms.marker.name.toLowerCase().trim() as SectionType;
      const knownTypes: SectionType[] = [
        'intro', 'verse', 'pre-chorus', 'chorus', 'bridge', 'outro',
        'drop', 'breakdown', 'solo', 'interlude',
      ];
      const type = knownTypes.includes(sectionName) ? sectionName : 'unknown';
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

  const avgDuration =
    finalRegions.reduce((sum, r) => sum + (r.endTime - r.startTime), 0) / finalRegions.length;

  return finalRegions.map((region, index) => {
    const { type, confidence } = classifySection(region, index, finalRegions.length, avgDuration);
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
  'unknown': 8,
};

function barsToSeconds(bars: number, bpm: number, timeSignature: number): number {
  const beatsPerBar = timeSignature;
  const secondsPerBeat = 60 / bpm;
  return bars * beatsPerBar * secondsPerBeat;
}

/**
 * Suggest the next section type based on existing arrangement sections.
 */
export function suggestNextSection(
  sections: ArrangementSection[],
  meta: { bpm: number; keyScale: string; timeSignature: number; totalDuration: number },
): ArrangementSuggestion {
  let nextType: SectionType;
  let startTime: number;

  if (sections.length === 0) {
    nextType = 'intro';
    startTime = 0;
  } else {
    const lastSection = sections[sections.length - 1];
    const candidates = SECTION_FLOW[lastSection.type] ?? ['verse'];

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
      nextType = candidates[0] ?? 'verse';
    }

    startTime = lastSection.endTime;
  }

  const duration = barsToSeconds(SECTION_BARS[nextType], meta.bpm, meta.timeSignature);

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
  'unknown': ['piano'],
};

/**
 * Suggest instrumentation changes between sections.
 */
export function suggestInstrumentation(
  sections: ArrangementSection[],
  tracks: Track[],
  meta: { bpm: number; keyScale: string; timeSignature: number; totalDuration: number },
): ArrangementSuggestion[] {
  if (sections.length === 0) return [];

  const suggestions: ArrangementSuggestion[] = [];
  const existingTrackNames = new Set(tracks.map((t) => t.displayName.toLowerCase()));

  for (const section of sections) {
    const recommended = SECTION_INSTRUMENTS[section.type] ?? [];
    const missing = recommended.filter((inst) => {
      // Check if any existing track has a similar name
      return !existingTrackNames.has(inst) &&
        ![...existingTrackNames].some((name) => name.includes(inst) || inst.includes(name));
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
  chords: (root: string, isMinor: boolean) => string;
}

const MAJOR_NOTES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function parseKey(keyScale: string): { root: string; isMinor: boolean } {
  const parts = keyScale.trim().split(/\s+/);
  const root = parts[0] ?? 'C';
  const isMinor = (parts[1] ?? '').toLowerCase() === 'minor';
  return { root, isMinor };
}

function getNoteAt(root: string, semitones: number): string {
  const rootIdx = MAJOR_NOTES.indexOf(root);
  if (rootIdx === -1) return root;
  return MAJOR_NOTES[(rootIdx + semitones) % 12];
}

const MAJOR_PROGRESSIONS: ChordProgression[] = [
  {
    name: 'Pop Standard',
    numerals: 'I – V – vi – IV',
    chords: (root) => {
      const V = getNoteAt(root, 7);
      const vi = getNoteAt(root, 9);
      const IV = getNoteAt(root, 5);
      return `${root} – ${V} – ${vi}m – ${IV}`;
    },
  },
  {
    name: 'Classic',
    numerals: 'I – IV – V – I',
    chords: (root) => {
      const IV = getNoteAt(root, 5);
      const V = getNoteAt(root, 7);
      return `${root} – ${IV} – ${V} – ${root}`;
    },
  },
  {
    name: 'Emotional',
    numerals: 'vi – IV – I – V',
    chords: (root) => {
      const vi = getNoteAt(root, 9);
      const IV = getNoteAt(root, 5);
      const V = getNoteAt(root, 7);
      return `${vi}m – ${IV} – ${root} – ${V}`;
    },
  },
];

const MINOR_PROGRESSIONS: ChordProgression[] = [
  {
    name: 'Natural Minor',
    numerals: 'i – VI – III – VII',
    chords: (root) => {
      const VI = getNoteAt(root, 8);
      const III = getNoteAt(root, 3);
      const VII = getNoteAt(root, 10);
      return `${root}m – ${VI} – ${III} – ${VII}`;
    },
  },
  {
    name: 'Minor Pop',
    numerals: 'i – iv – VII – III',
    chords: (root) => {
      const iv = getNoteAt(root, 5);
      const VII = getNoteAt(root, 10);
      const III = getNoteAt(root, 3);
      return `${root}m – ${iv}m – ${VII} – ${III}`;
    },
  },
  {
    name: 'Dramatic Minor',
    numerals: 'i – VII – VI – V',
    chords: (root) => {
      const VII = getNoteAt(root, 10);
      const VI = getNoteAt(root, 8);
      const V = getNoteAt(root, 7);
      return `${root}m – ${VII} – ${VI} – ${V}`;
    },
  },
];

/**
 * Suggest chord progressions for each section based on key and section type.
 */
export function suggestChordProgression(
  sections: ArrangementSection[],
  meta: { bpm: number; keyScale: string; timeSignature: number; totalDuration: number },
): ArrangementSuggestion[] {
  if (sections.length === 0) return [];

  const { root, isMinor } = parseKey(meta.keyScale);
  const progressions = isMinor ? MINOR_PROGRESSIONS : MAJOR_PROGRESSIONS;

  const suggestions: ArrangementSuggestion[] = [];

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    // Pick a progression based on section type (vary it)
    const progIdx = i % progressions.length;
    const prog = progressions[progIdx];
    const chordStr = prog.chords(root, isMinor);

    suggestions.push({
      id: uuidv4(),
      kind: 'chord-progression',
      title: `${prog.name} progression for ${section.type}`,
      description: `${prog.numerals}: ${chordStr} — works well for ${section.type} sections in ${root} ${isMinor ? 'minor' : 'major'}`,
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

    for (let i = 0; i < sortedClips.length - 1; i++) {
      const current = sortedClips[i];
      const next = sortedClips[i + 1];
      const gapStart = current.startTime + current.duration;
      const gapEnd = next.startTime;
      const gapDuration = gapEnd - gapStart;

      if (gapDuration >= MIN_GAP_SECONDS) {
        // Build prompt from adjacent clips
        const prompts: string[] = [];
        if (current.prompt?.trim()) prompts.push(current.prompt.trim());
        if (next.prompt?.trim()) prompts.push(next.prompt.trim());
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
      }
    }
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
  const meta = {
    bpm: project.bpm,
    keyScale: project.keyScale,
    timeSignature: project.timeSignature,
    totalDuration: project.totalDuration,
  };

  const sections = detectSections(project);
  const suggestions: ArrangementSuggestion[] = [];

  // Next section suggestion
  suggestions.push(suggestNextSection(sections, meta));

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
