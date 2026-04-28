/**
 * Strudel → AI Generation Bridge
 *
 * Connects Strudel pattern analysis to the ACE-Step AI generation pipeline.
 * Flow: Strudel pattern → analyze → build prompt → create track/clip → generate
 */

import type { StrudelPatternInfo } from '../engine/strudelEngine';
import { createDebugLogger } from '../utils/debugLogger';

const log = createDebugLogger('strudel:gen-bridge');

// ─── Prompt Generation ──────────────────────────────────────

/**
 * Build a descriptive prompt from Strudel pattern analysis info.
 * Used as the generation prompt for AI music generation.
 */
export function buildPromptFromPatternInfo(
  info: StrudelPatternInfo,
  userPrompt?: string,
): string {
  const parts: string[] = [];

  // User prompt takes priority
  if (userPrompt?.trim()) {
    parts.push(userPrompt.trim());
  }

  // Describe pattern character
  if (info.instruments.length > 0) {
    const instrumentList = info.instruments.slice(0, 6).join(', ');
    if (info.hasMelodicContent) {
      parts.push(`melodic pattern with ${instrumentList}`);
    } else {
      parts.push(`percussion pattern with ${instrumentList}`);
    }
  } else if (info.hasMelodicContent) {
    parts.push('melodic pattern');
  } else if (info.noteCount > 0) {
    parts.push('rhythmic pattern');
  } else {
    parts.push('ambient texture');
  }

  // Density description
  if (info.rhythmicDensity > 4) {
    parts.push('dense rhythm');
  } else if (info.rhythmicDensity > 2) {
    parts.push('moderate rhythm');
  } else if (info.rhythmicDensity > 0) {
    parts.push('sparse rhythm');
  }

  return parts.join(', ');
}

// ─── Generation Parameters ──────────────────────────────────

const MAX_GENERATION_DURATION_S = 240; // 4 minutes

export interface StrudelGenerationParams {
  lengthSeconds: number;
  bpm: number;
  bars: number;
}

/**
 * Build generation parameters from pattern context (bars, BPM, time signature).
 */
export function buildGenerationParamsFromPattern(options: {
  bars: number;
  bpm: number;
  beatsPerBar?: number;
}): StrudelGenerationParams {
  const beatsPerBar = options.beatsPerBar ?? 4;
  const safeBpm = Math.max(1, options.bpm);
  const rawDuration = (options.bars * beatsPerBar * 60) / safeBpm;
  const lengthSeconds = Math.min(rawDuration, MAX_GENERATION_DURATION_S);

  return {
    lengthSeconds,
    bpm: safeBpm,
    bars: options.bars,
  };
}

// ─── Full Bridge: Pattern → Generation ──────────────────────

export interface GenerateFromPatternOptions {
  trackId: string;
  code: string;
  bars: number;
  bpm: number;
  beatsPerBar?: number;
  keyScale?: string;
  userPrompt?: string;
  temperature?: number;
}

/**
 * Generate AI audio from a Strudel pattern.
 *
 * Flow:
 * 1. Evaluate pattern code (pure, no audio)
 * 2. Analyze pattern (instruments, melodic content, density)
 * 3. Build prompt from analysis + optional user prompt
 * 4. Create a stems track + clip
 * 5. Submit to AI generation pipeline
 */
export async function generateFromStrudelPattern(
  options: GenerateFromPatternOptions,
): Promise<{ clipId: string; trackId: string } | null> {
  const { useProjectStore } = await import('../store/projectStore');
  const { generateFromGenerationPanel } = await import('./generationPipeline');

  log.info('Starting generation from Strudel pattern', { trackId: options.trackId, bars: options.bars });

  // 1. Parse pattern and extract MIDI data for analysis
  const { evaluateStrudelPatternPure, getPatternInfo, queryPatternEvents } = await import('../engine/strudelEngine');
  const { strudelEventsToMidiNotes } = await import('./strudelConversion');

  const pattern = await evaluateStrudelPatternPure(options.code);
  if (!pattern) {
    log.warn('Failed to evaluate Strudel pattern');
    return null;
  }

  // Freeze pattern to MIDI notes for structural analysis
  const beatsPerBar = options.beatsPerBar ?? 4;
  const events = queryPatternEvents(pattern, 0, options.bars);
  const midiNotes = strudelEventsToMidiNotes(events, beatsPerBar);
  log.info('Pattern frozen to MIDI', { noteCount: midiNotes.length, eventCount: events.length });

  const patternInfo = getPatternInfo(pattern, options.bars);
  log.info('Pattern analysis', patternInfo);

  // 2. Build generation params
  const genParams = buildGenerationParamsFromPattern({
    bars: options.bars,
    bpm: options.bpm,
    beatsPerBar: options.beatsPerBar,
  });

  // 3. Build prompt
  const prompt = buildPromptFromPatternInfo(patternInfo, options.userPrompt);

  // 4. Find or create a stems track for the generated audio
  const projectStore = useProjectStore.getState();
  const project = projectStore.project;
  if (!project) return null;

  // Find an existing stems track or create one
  let targetTrackId: string | null = null;
  const stemsTrack = project.tracks.find(
    (t) => (t.trackType === 'stems' || t.trackType === undefined) && t.id !== options.trackId,
  );
  if (stemsTrack) {
    targetTrackId = stemsTrack.id;
  } else {
    const newTrack = projectStore.addTrack('custom', 'stems', {
      displayName: 'AI from Strudel',
    });
    targetTrackId = newTrack.id;
  }

  // 5. Submit to generation pipeline
  try {
    await generateFromGenerationPanel({
      prompt,
      trackId: targetTrackId,
      styleTags: patternInfo.instruments.slice(0, 3),
      bpm: genParams.bpm,
      keyScale: options.keyScale ?? project.keyScale ?? 'C major',
      lengthSeconds: genParams.lengthSeconds,
      temperature: options.temperature ?? 1.0,
      variationCount: 1,
    });

    // Find the clip that was just created
    const updatedProject = useProjectStore.getState().project;
    const targetTrack = updatedProject?.tracks.find((t) => t.id === targetTrackId);
    const latestClip = targetTrack?.clips[targetTrack.clips.length - 1];

    log.info('Generation submitted', { trackId: targetTrackId, clipId: latestClip?.id });
    return latestClip ? { clipId: latestClip.id, trackId: targetTrackId } : null;
  } catch (err) {
    log.error('Generation from pattern failed', err);
    throw err;
  }
}
