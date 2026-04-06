/**
 * daw-cli-format.ts — Pure formatting functions for DAW CLI output.
 * Separated from the WebSocket client for testability.
 */

export interface ParsedCommand {
  tool: string;
  params: Record<string, unknown>;
}

/** Map CLI subcommands to tool names and extract params */
export function parseCommand(args: string[]): ParsedCommand | { error: string } {
  const [cmd, ...rest] = args;

  switch (cmd) {
    case 'status':
      return { tool: 'daw_get_project', params: {} };
    case 'tracks':
      return { tool: 'daw_get_tracks', params: {} };
    case 'transport':
      return { tool: 'daw_get_transport', params: {} };
    case 'mix':
      return { tool: 'daw_get_mixer', params: {} };
    case 'play':
      return { tool: 'daw_play', params: {} };
    case 'stop':
      return { tool: 'daw_stop', params: {} };
    case 'loop':
      return { tool: 'daw_toggle_loop', params: {} };
    case 'set-bpm': {
      const bpm = Number(rest[0]);
      if (!rest[0] || isNaN(bpm) || bpm < 20 || bpm > 999)
        return { error: 'Usage: daw set-bpm <20-999>' };
      return { tool: 'daw_set_bpm', params: { bpm } };
    }
    case 'add-track': {
      const type = rest[0];
      const validTypes = ['stems', 'sample', 'sequencer', 'pianoroll'];
      if (!type || !validTypes.includes(type))
        return { error: `Usage: daw add-track <${validTypes.join('|')}> [name]` };
      const params: Record<string, unknown> = { type };
      if (rest[1]) params.name = rest.slice(1).join(' ');
      return { tool: 'daw_add_track', params };
    }
    case 'delete-track': {
      if (!rest[0]) return { error: 'Usage: daw delete-track <trackId>' };
      return { tool: 'daw_delete_track', params: { trackId: rest[0] } };
    }
    case 'volume': {
      const vol = Number(rest[1]);
      if (!rest[0] || isNaN(vol))
        return { error: 'Usage: daw volume <trackId> <0-1>' };
      return { tool: 'daw_set_volume', params: { trackId: rest[0], volume: vol } };
    }
    case 'pan': {
      const pan = Number(rest[1]);
      if (!rest[0] || isNaN(pan))
        return { error: 'Usage: daw pan <trackId> <-1 to 1>' };
      return { tool: 'daw_set_pan', params: { trackId: rest[0], pan } };
    }
    case 'mute':
      if (!rest[0]) return { error: 'Usage: daw mute <trackId>' };
      return { tool: 'daw_toggle_mute', params: { trackId: rest[0] } };
    case 'solo':
      if (!rest[0]) return { error: 'Usage: daw solo <trackId>' };
      return { tool: 'daw_toggle_solo', params: { trackId: rest[0] } };
    case 'generate': {
      if (!rest[0]) return { error: 'Usage: daw generate <trackId> <prompt>' };
      const trackId = rest[0];
      const prompt = rest.slice(1).join(' ');
      if (!prompt) return { error: 'Usage: daw generate <trackId> <prompt>' };
      return { tool: 'daw_generate', params: { trackId, prompt } };
    }
    case 'midi': {
      if (rest.length < 4)
        return { error: 'Usage: daw midi <clipId> <pitch> <start> <dur> [vel]' };
      return {
        tool: 'daw_add_midi_note',
        params: {
          clipId: rest[0],
          pitch: Number(rest[1]),
          startBeat: Number(rest[2]),
          durationBeats: Number(rest[3]),
          ...(rest[4] ? { velocity: Number(rest[4]) } : {}),
        },
      };
    }
    case 'step': {
      if (rest.length < 3)
        return { error: 'Usage: daw step <trackId> <rowId> <stepIndex>' };
      return {
        tool: 'daw_toggle_step',
        params: {
          trackId: rest[0],
          rowId: rest[1],
          stepIndex: Number(rest[2]),
        },
      };
    }
    default:
      return {
        error: `Unknown command: ${cmd ?? '(none)'}\nCommands: status tracks transport mix play stop loop set-bpm add-track delete-track volume pan mute solo generate midi step`,
      };
  }
}

/** Format pan value compactly: C, L.3, R.7 */
export function formatPan(pan: number): string {
  if (Math.abs(pan) < 0.05) return 'C';
  return pan < 0 ? `L${Math.abs(pan).toFixed(1).replace('0.', '.')}` : `R${pan.toFixed(1).replace('0.', '.')}`;
}

/** Format time as M:SS */
export function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Format project status output */
export function formatStatus(data: Record<string, unknown>): string {
  const name = data.name ?? 'Untitled';
  const bpm = data.bpm ?? 120;
  const ts = data.timeSignature ?? '4/4';
  const tracks = data.tracks as Array<Record<string, unknown>> | undefined;
  const trackCount = tracks?.length ?? data.trackCount ?? 0;

  const lines: string[] = [];
  lines.push(`${name} | ${bpm}bpm ${ts} | ${trackCount} tracks`);
  lines.push('─'.repeat(40));

  if (tracks) {
    for (const t of tracks) {
      const type = `[${(t.type as string)?.slice(0, 5) ?? '?'}]`;
      const clipCount = (t.clips as unknown[])?.length ?? t.clipCount ?? 0;
      const vol = `V:${(t.volume as number)?.toFixed(2) ?? '?'}`;
      const pan = formatPan((t.pan as number) ?? 0);
      const flags = [
        t.muted ? 'MUTED' : '',
        t.soloed ? 'SOLO' : '',
      ].filter(Boolean).join(' ');
      lines.push(`  ${(t.name as string)?.padEnd(12) ?? 'Track'} ${type.padEnd(7)} ${clipCount}clip${clipCount !== 1 ? 's' : ''} ${vol} ${pan} ${flags}`.trimEnd());
    }
  }

  // Append wiki summary if present
  const wikiSummary = data.wikiSummary as string | undefined;
  if (wikiSummary) {
    lines.push('');
    lines.push(wikiSummary);
  }

  // Append wiki lint results if present
  const wikiLintSummary = data.wikiLintSummary as string | undefined;
  if (wikiLintSummary) {
    lines.push('');
    lines.push(wikiLintSummary);
  }

  return lines.join('\n');
}

/** Format mixer table */
export function formatMixer(data: Record<string, unknown>): string {
  const tracks = data.tracks as Array<Record<string, unknown>> | undefined;
  if (!tracks?.length) return 'No tracks';

  const lines: string[] = [];
  lines.push('Track        Vol  Pan  M S');
  for (const t of tracks) {
    const name = ((t.name as string) ?? 'Track').padEnd(12);
    const vol = ((t.volume as number) ?? 0).toFixed(2);
    const pan = formatPan((t.pan as number) ?? 0).padEnd(4);
    const m = t.muted ? 'M' : '.';
    const s = t.soloed ? 'S' : '.';
    lines.push(`${name} ${vol} ${pan} ${m} ${s}`);
  }
  return lines.join('\n');
}

/** Format transport state */
export function formatTransport(data: Record<string, unknown>): string {
  const playing = data.isPlaying ? '▶ playing' : '■ stopped';
  const time = formatTime((data.currentTime as number) ?? 0);
  const loop = data.loopEnabled ? 'loop on' : 'loop off';
  return `${playing} ${time} | ${loop}`;
}

/** Generic format for command results */
export function formatResult(tool: string, result: unknown): string {
  if (typeof result === 'string') return result;

  const data = result as Record<string, unknown>;

  switch (tool) {
    case 'daw_get_project':
      return formatStatus(data);
    case 'daw_get_mixer':
      return formatMixer(data);
    case 'daw_get_transport':
      return formatTransport(data);
    case 'daw_get_tracks':
      return formatStatus({ ...data, name: 'Tracks' });
    default: {
      // For write operations, show success message
      if (data.success) {
        const msg = data.message ?? data.trackId ?? 'OK';
        return `✓ ${msg}`;
      }
      return JSON.stringify(result, null, 2);
    }
  }
}
