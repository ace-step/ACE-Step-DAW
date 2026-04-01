/**
 * dawStateSummary.ts — Generate a natural language summary of the DAW project state.
 * Used by LLM agents to understand the current project without parsing raw JSON.
 * Exposed via window.__dawSummary() for agent access.
 */
import type { Project, Track } from '../types/project';

/**
 * Generate a concise, agent-friendly summary of the project state.
 */
export function generateProjectSummary(project: Project | null): string {
  if (!project) return 'No project loaded.';

  const lines: string[] = [];

  // Header
  lines.push(`Project: "${project.name}" | ${project.bpm} BPM | ${project.keyScale || 'no key'} | ${project.timeSignature}/4 time`);
  lines.push(`Duration: ${formatDur(project.totalDuration)} | ${project.tracks.length} tracks`);

  if (project.globalCaption) {
    lines.push(`Description: ${project.globalCaption}`);
  }

  // Tracks
  if (project.tracks.length === 0) {
    lines.push('\nNo tracks yet.');
  } else {
    lines.push('\nTracks:');
    for (const track of project.tracks) {
      lines.push(formatTrackLine(track));
    }
  }

  // Automation
  const autoLanes = project.automationLanes ?? [];
  if (autoLanes.length > 0) {
    lines.push(`\nAutomation: ${autoLanes.length} lane(s)`);
  }

  // Assets
  const assets = project.assets ?? [];
  if (assets.length > 0) {
    lines.push(`\nAssets: ${assets.length} saved clip(s)`);
  }

  return lines.join('\n');
}

function formatTrackLine(track: Track): string {
  const parts: string[] = [];

  // Track info
  const muted = track.muted ? ' [MUTED]' : '';
  const soloed = track.soloed ? ' [SOLO]' : '';
  const armed = track.armed ? ' [REC]' : '';
  parts.push(`  ${track.displayName}${muted}${soloed}${armed} (${track.trackType}) — vol:${Math.round(track.volume * 100)}%`);

  // Clips
  if (track.clips.length > 0) {
    const clipSummaries = track.clips.map((c) => {
      const status = c.generationStatus === 'ready' ? '✓' : c.generationStatus === 'error' ? '✗' : '…';
      const type = c.midiData ? `MIDI(${c.midiData.notes.length} notes)` : (c.prompt || 'audio');
      return `[${status} ${formatDur(c.startTime)}–${formatDur(c.startTime + c.duration)}: ${type}]`;
    });
    parts.push(`    Clips: ${clipSummaries.join(' ')}`);
  }

  // Sequencer
  if (track.sequencerPattern) {
    const activeSteps = track.sequencerPattern.rows.reduce(
      (sum, row) => sum + row.steps.filter((s) => s.active).length, 0
    );
    parts.push(`    Pattern: ${track.sequencerPattern.rows.length} rows, ${activeSteps} active steps`);
  }

  // Effects
  if (track.effects && track.effects.length > 0) {
    const fx = track.effects.map((e) => `${e.type}${!e.enabled ? '(off)' : ''}`).join(', ');
    parts.push(`    FX: ${fx}`);
  }

  return parts.join('\n');
}

function formatDur(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Generate a structured JSON summary (for programmatic agent access).
 */
export function generateProjectStructure(project: Project | null): object | null {
  if (!project) return null;
  return {
    name: project.name,
    bpm: project.bpm,
    keyScale: project.keyScale,
    timeSignature: project.timeSignature,
    totalDuration: project.totalDuration,
    trackCount: project.tracks.length,
    tracks: project.tracks.map((t) => ({
      id: t.id,
      name: t.displayName,
      type: t.trackType,
      clipCount: t.clips.length,
      muted: t.muted,
      soloed: t.soloed,
      volume: t.volume,
      effectCount: t.effects?.length ?? 0,
    })),
  };
}
