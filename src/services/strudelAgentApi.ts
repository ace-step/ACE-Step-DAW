/**
 * Strudel Agent API — programmatic access to Strudel patterns for AI agents.
 *
 * Exposed on window.__strudelApi for agents to:
 * - Analyze patterns (instruments, melodic content, density)
 * - Get Strudel track summaries from the project
 * - List available presets with metadata
 * - Generate AI audio from patterns
 */

import type { StrudelPatternInfo } from '../engine/strudelEngine';
import { useProjectStore } from '../store/projectStore';
import { STRUDEL_PRESETS, type StrudelPreset } from '../constants/strudelPresets';
import {
  STRUDEL_TEMPLATES,
  getTemplateByGenre,
  getTemplatesByComplexity,
  getTemplatesByBpmRange,
  type StrudelTemplate,
} from '../constants/strudelTemplateLibrary';
import { buildPromptFromPatternInfo } from './strudelGenerationBridge';
import { computeLineDiff, formatUnifiedDiff, formatDiffSummary } from '../utils/codeDiff';
import { strudelEventLog, type StrudelLogFilter } from '../engine/strudelStructuredLog';
import { createDebugLogger } from '../utils/debugLogger';

const log = createDebugLogger('strudel:agent-api');

// ─── Pattern Analysis ───────────────────────────────────────

export interface StrudelAnalysisResult {
  noteCount: number;
  instruments: string[];
  hasMelodicContent: boolean;
  pitchRange: [number, number];
  cycleLengthBars: number;
  rhythmicDensity: number;
  suggestedPrompt: string;
}

/**
 * Analyze a Strudel pattern code string and return structured analysis.
 * Safe to call from agents — no audio output, pure analysis.
 */
export async function analyzePatternCode(
  code: string,
  bars: number = 1,
): Promise<StrudelAnalysisResult> {
  if (!code.trim()) {
    return {
      noteCount: 0,
      instruments: [],
      hasMelodicContent: false,
      pitchRange: [0, 0],
      cycleLengthBars: bars,
      rhythmicDensity: 0,
      suggestedPrompt: '',
    };
  }

  try {
    const { evaluateStrudelPatternPure, getPatternInfo } = await import('../engine/strudelEngine');
    const pattern = await evaluateStrudelPatternPure(code);
    if (!pattern) {
      return {
        noteCount: 0,
        instruments: [],
        hasMelodicContent: false,
        pitchRange: [0, 0],
        cycleLengthBars: bars,
        rhythmicDensity: 0,
        suggestedPrompt: '',
      };
    }

    const info: StrudelPatternInfo = getPatternInfo(pattern, bars);
    return {
      ...info,
      suggestedPrompt: buildPromptFromPatternInfo(info),
    };
  } catch (err) {
    log.warn('Pattern analysis failed (Strudel not loaded in this environment)', err);
    return {
      noteCount: 0,
      instruments: [],
      hasMelodicContent: false,
      pitchRange: [0, 0],
      cycleLengthBars: bars,
      rhythmicDensity: 0,
      suggestedPrompt: '',
    };
  }
}

// ─── Track Summary ──────────────────────────────────────────

export interface StrudelTrackSummary {
  trackId: string;
  displayName: string;
  code: string;
  versionCount: number;
  cycleLength: number;
}

/**
 * Get a summary of all Strudel tracks in the current project.
 */
export function getStrudelTrackSummary(): StrudelTrackSummary[] {
  const project = useProjectStore.getState().project;
  if (!project) return [];

  return project.tracks
    .filter((t) => t.trackType === 'strudel')
    .map((t) => ({
      trackId: t.id,
      displayName: t.displayName ?? 'Strudel Track',
      code: t.strudelCode ?? '',
      versionCount: t.strudelVersions?.length ?? 0,
      cycleLength: t.strudelCycleLength ?? 1,
    }));
}

// ─── Presets ────────────────────────────────────────────────

export interface StrudelPresetEntry {
  name: string;
  genre: string;
  code: string;
  roles: StrudelPreset;
}

/**
 * List all available Strudel presets with structured metadata.
 * Agents can use these as starting points for pattern generation.
 */
export function listStrudelPresets(): StrudelPresetEntry[] {
  return Object.entries(STRUDEL_PRESETS).map(([name, preset]) => ({
    name,
    genre: name.replace(/-/g, ' '),
    code: `stack(
  s("${preset.drums}"),
  note("${preset.bass}").sound("sawtooth"),
  note("${preset.chords}").sound("piano"),
  note("${preset.melody}").sound("triangle")
)`,
    roles: preset,
  }));
}

// ─── Update Pattern ─────────────────────────────────────────

/**
 * Update a Strudel track's code programmatically (for agent iterations).
 * Returns the updated code or null if track not found.
 */
export function updateStrudelTrackCode(
  trackId: string,
  newCode: string,
  label?: string,
): string | null {
  const store = useProjectStore.getState();
  const project = store.project;
  if (!project) return null;

  const track = project.tracks.find((t) => t.id === trackId && t.trackType === 'strudel');
  if (!track) return null;

  store.updateStrudelCode(trackId, newCode);
  if (label) {
    store.captureStrudelVersion(trackId, label);
  }

  return newCode;
}

// ─── Code Diff ──────────────────────────────────────────────

/**
 * Compare two versions of Strudel code and return a unified diff.
 * Agents can use this to review their own edits.
 */
export function diffPatternCode(
  before: string,
  after: string,
): { unified: string; summary: string; added: number; removed: number } {
  const diff = computeLineDiff(before, after);
  return {
    unified: formatUnifiedDiff(diff),
    summary: formatDiffSummary(diff),
    added: diff.filter((l) => l.type === 'added').length,
    removed: diff.filter((l) => l.type === 'removed').length,
  };
}

/**
 * Compare a track's current code against a specific version.
 */
export function diffTrackVersion(
  trackId: string,
  versionIndex: number,
): { unified: string; summary: string; added: number; removed: number } | null {
  const project = useProjectStore.getState().project;
  if (!project) return null;

  const track = project.tracks.find((t) => t.id === trackId && t.trackType === 'strudel');
  if (!track) return null;

  const versions = track.strudelVersions ?? [];
  if (versionIndex < 0 || versionIndex >= versions.length) return null;

  const currentCode = track.strudelCode ?? '';
  const versionCode = versions[versionIndex].code;

  return diffPatternCode(versionCode, currentCode);
}

// ─── Composite API object ───────────────────────────────────

/**
 * The full Strudel Agent API object exposed on window.__strudelApi.
 */
export function createStrudelAgentApi() {
  return {
    analyzePattern: analyzePatternCode,
    getTrackSummary: getStrudelTrackSummary,
    listPresets: listStrudelPresets,
    updateTrackCode: updateStrudelTrackCode,
    diffCode: diffPatternCode,
    diffTrackVersion: diffTrackVersion,
    listTemplates: () => STRUDEL_TEMPLATES,
    getTemplateByGenre,
    getTemplatesByComplexity,
    getTemplatesByBpmRange,
    getEventLog: (filter?: StrudelLogFilter) => strudelEventLog.getEntries(filter),
    clearEventLog: () => strudelEventLog.clear(),
    subscribeToEvents: (callback: (entry: unknown) => void) => strudelEventLog.subscribe(callback),
  };
}
