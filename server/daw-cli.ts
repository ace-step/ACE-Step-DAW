#!/usr/bin/env npx tsx
/**
 * daw-cli — Lightweight CLI for Claude Code ↔ DAW interaction.
 *
 * Usage:
 *   npx tsx server/daw-cli.ts <command> [args...]
 *
 * Examples:
 *   npx tsx server/daw-cli.ts status
 *   npx tsx server/daw-cli.ts play
 *   npx tsx server/daw-cli.ts set-bpm 140
 *   npx tsx server/daw-cli.ts add-track stems "My Track"
 *   npx tsx server/daw-cli.ts volume <trackId> 0.8
 *
 * Connects to the DAW's WebSocket bridge (same as MCP server) but outputs
 * compact, token-efficient plain text instead of JSON-RPC framing.
 *
 * Exit codes:
 *   0 — success
 *   1 — usage error or DAW error
 *   2 — connection failure (DAW not running)
 */

import { WebSocket } from 'ws';

const BRIDGE_URL = process.env.DAW_BRIDGE_URL ?? 'ws://127.0.0.1:5174/ws/mcp-bridge';
const TIMEOUT_MS = 5000;

// ── Arg Parsing ──

interface ParsedCommand {
  tool: string;
  params: Record<string, unknown>;
}

export function parseArgs(args: string[]): ParsedCommand {
  const [command, ...rest] = args;

  if (!command) {
    throw new Error(USAGE);
  }

  switch (command) {
    // Read
    case 'status':
      return { tool: 'daw_get_project', params: {} };
    case 'tracks':
      return { tool: 'daw_get_tracks', params: {} };
    case 'transport':
      return { tool: 'daw_get_transport', params: {} };
    case 'mixer':
      return { tool: 'daw_get_mixer', params: {} };

    // Transport
    case 'play':
      return { tool: 'daw_play', params: {} };
    case 'stop':
      return { tool: 'daw_stop', params: {} };
    case 'loop':
      return { tool: 'daw_toggle_loop', params: {} };

    // Project
    case 'set-bpm': {
      const bpm = Number(rest[0]);
      if (!rest[0] || isNaN(bpm)) throw new Error('Usage: set-bpm <number>');
      return { tool: 'daw_set_bpm', params: { bpm } };
    }

    // Tracks
    case 'add-track': {
      const type = rest[0];
      if (!type) throw new Error('Usage: add-track <stems|sample|sequencer|pianoroll> [name]');
      const params: Record<string, unknown> = { type };
      if (rest[1]) params.name = rest.slice(1).join(' ');
      return { tool: 'daw_add_track', params };
    }
    case 'delete-track': {
      const trackId = rest[0];
      if (!trackId) throw new Error('Usage: delete-track <trackId>');
      return { tool: 'daw_delete_track', params: { trackId } };
    }

    // Mixer
    case 'volume': {
      const trackId = rest[0];
      const volume = Number(rest[1]);
      if (!trackId || isNaN(volume)) throw new Error('Usage: volume <trackId> <0-1>');
      return { tool: 'daw_set_volume', params: { trackId, volume } };
    }
    case 'pan': {
      const trackId = rest[0];
      const pan = Number(rest[1]);
      if (!trackId || isNaN(pan)) throw new Error('Usage: pan <trackId> <-1 to 1>');
      return { tool: 'daw_set_pan', params: { trackId, pan } };
    }
    case 'mute': {
      const trackId = rest[0];
      if (!trackId) throw new Error('Usage: mute <trackId>');
      return { tool: 'daw_toggle_mute', params: { trackId } };
    }
    case 'solo': {
      const trackId = rest[0];
      if (!trackId) throw new Error('Usage: solo <trackId>');
      return { tool: 'daw_toggle_solo', params: { trackId } };
    }

    // MIDI
    case 'add-note': {
      const [clipId, pitch, startBeat, durationBeats, velocity] = rest;
      if (!clipId || !pitch || !startBeat || !durationBeats)
        throw new Error('Usage: add-note <clipId> <pitch> <startBeat> <durationBeats> [velocity]');
      const params: Record<string, unknown> = {
        clipId,
        pitch: Number(pitch),
        startBeat: Number(startBeat),
        durationBeats: Number(durationBeats),
      };
      if (velocity) params.velocity = Number(velocity);
      return { tool: 'daw_add_midi_note', params };
    }

    // Sequencer
    case 'toggle-step': {
      const [trackId, rowId, stepIndex] = rest;
      if (!trackId || !rowId || !stepIndex)
        throw new Error('Usage: toggle-step <trackId> <rowId> <stepIndex>');
      return { tool: 'daw_toggle_step', params: { trackId, rowId, stepIndex: Number(stepIndex) } };
    }

    // Generation
    case 'generate': {
      const prompt = rest.join(' ');
      if (!prompt) throw new Error('Usage: generate <prompt text...>');
      return { tool: 'daw_generate', params: { prompt } };
    }

    // UI
    case 'show-mixer':
      return { tool: 'daw_show_mixer', params: {} };

    default:
      throw new Error(`Unknown command: ${command}\n\n${USAGE}`);
  }
}

// ── Output Formatting ──

export function formatOutput(tool: string, result: unknown): string {
  if (result === null || result === undefined) return 'OK';

  const r = result as Record<string, unknown>;

  switch (tool) {
    case 'daw_get_project': {
      if (r.error) return `No project loaded`;
      const tracks = r.tracks as Array<Record<string, unknown>>;
      const lines: string[] = [
        `${r.name} | ${r.bpm} BPM | ${(r.timeSignature as number[])?.[0] ?? 4}/${(r.timeSignature as number[])?.[1] ?? 4} | ${r.trackCount} tracks`,
        '',
      ];
      if (tracks?.length) {
        lines.push('ID | Name | Type | Clips | Vol | M/S');
        lines.push('---|------|------|-------|-----|----');
        for (const t of tracks) {
          const flags = `${t.muted ? 'M' : '.'}${t.soloed ? 'S' : '.'}`;
          const vol = typeof t.volume === 'number' ? Math.round(t.volume * 100) + '%' : '?';
          lines.push(`${(t.id as string).slice(0, 8)} | ${t.name} | ${t.type} | ${t.clipCount} | ${vol} | ${flags}`);
        }
      }
      return lines.join('\n');
    }

    case 'daw_get_tracks': {
      const tracks = result as Array<Record<string, unknown>>;
      if (!tracks?.length) return 'No tracks';
      const lines: string[] = [];
      for (const t of tracks) {
        const clips = t.clips as Array<Record<string, unknown>>;
        const flags = `${t.muted ? 'M' : '.'}${t.soloed ? 'S' : '.'}`;
        lines.push(`[${(t.id as string).slice(0, 8)}] ${t.name} (${t.type}) ${flags}`);
        if (clips?.length) {
          for (const c of clips) {
            const status = c.generationStatus ? ` [${c.generationStatus}]` : '';
            lines.push(`  clip ${(c.id as string).slice(0, 8)} @${c.startTime}s dur=${c.duration}s${status}`);
            if (c.prompt) lines.push(`    prompt: "${c.prompt}"`);
          }
        }
      }
      return lines.join('\n');
    }

    case 'daw_get_transport': {
      const state = r.isPlaying ? '▶ PLAYING' : '⏹ STOPPED';
      const pos = typeof r.currentTime === 'number' ? r.currentTime.toFixed(1) + 's' : '0s';
      const loop = r.loopEnabled ? `loop ${r.loopStart}s–${r.loopEnd}s` : 'loop off';
      return `${state} @ ${pos} | ${loop}`;
    }

    case 'daw_get_mixer': {
      const tracks = (r.tracks as Array<Record<string, unknown>>) ?? [];
      if (!tracks.length) return 'No tracks';
      const lines = ['ID | Name | Vol | Pan | M/S', '---|------|-----|-----|----'];
      for (const t of tracks) {
        const vol = typeof t.volume === 'number' ? Math.round(t.volume * 100) + '%' : '?';
        const pan = typeof t.pan === 'number' ? (t.pan === 0 ? 'C' : t.pan < 0 ? `L${Math.round(Math.abs(t.pan) * 100)}` : `R${Math.round(t.pan * 100)}`) : 'C';
        const flags = `${t.muted ? 'M' : '.'}${t.soloed ? 'S' : '.'}`;
        lines.push(`${(t.id as string).slice(0, 8)} | ${t.name} | ${vol} | ${pan} | ${flags}`);
      }
      return lines.join('\n');
    }

    default: {
      // For write operations, just show success/error compactly
      if (r.success) {
        const extras: string[] = [];
        if (r.trackId) extras.push(`track=${r.trackId}`);
        if (r.name) extras.push(`name="${r.name}"`);
        if (r.bpm) extras.push(`bpm=${r.bpm}`);
        if (r.message) extras.push(String(r.message));
        if (r.loopEnabled !== undefined) extras.push(`loop=${r.loopEnabled ? 'on' : 'off'}`);
        return extras.length ? `OK: ${extras.join(', ')}` : 'OK';
      }
      if (r.error) return `Error: ${r.error}`;
      return JSON.stringify(result);
    }
  }
}

// ── WebSocket Call ──

function callBridge(tool: string, params: Record<string, unknown>): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BRIDGE_URL);
    const id = `cli-${Date.now()}`;

    const timer = setTimeout(() => {
      ws.close();
      reject(new Error('Timeout: DAW did not respond within 5s'));
    }, TIMEOUT_MS);

    ws.on('open', () => {
      ws.send(JSON.stringify({ id, tool, params }));
    });

    ws.on('message', (data) => {
      clearTimeout(timer);
      try {
        const response = JSON.parse(data.toString()) as { id: string; result?: unknown; error?: string };
        if (response.id === id) {
          ws.close();
          if (response.error) {
            reject(new Error(response.error));
          } else {
            resolve(response.result);
          }
        }
      } catch (err) {
        ws.close();
        reject(err);
      }
    });

    ws.on('error', () => {
      clearTimeout(timer);
      reject(new Error('Cannot connect to DAW. Is the dev server running? (npm run dev)'));
    });
  });
}

// ── Usage ──

const USAGE = `Usage: daw-cli <command> [args...]

Commands:
  status                          Project overview
  tracks                          List tracks with clips
  transport                       Playback state
  mixer                           Mixer levels

  play / stop / loop              Transport controls
  set-bpm <bpm>                   Set tempo

  add-track <type> [name]         Add track (stems|sample|sequencer|pianoroll)
  delete-track <trackId>          Remove track
  volume <trackId> <0-1>          Set volume
  pan <trackId> <-1..1>           Set pan
  mute <trackId>                  Toggle mute
  solo <trackId>                  Toggle solo

  add-note <clipId> <pitch> <start> <dur> [vel]   Add MIDI note
  toggle-step <trackId> <rowId> <step>             Toggle sequencer step
  generate <prompt...>            AI music generation
  show-mixer                      Open mixer panel`;

// ── Main ──

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(USAGE);
    process.exit(0);
  }

  try {
    const { tool, params } = parseArgs(args);
    const result = await callBridge(tool, params);
    const output = formatOutput(tool, result);
    console.log(output);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    process.exit(msg.includes('Cannot connect') ? 2 : 1);
  }
}

// Only run when executed directly (not when imported for testing)
const isDirectExecution = process.argv[1]?.endsWith('daw-cli.ts') || process.argv[1]?.includes('daw-cli');
if (isDirectExecution) {
  main();
}
