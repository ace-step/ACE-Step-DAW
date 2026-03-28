/**
 * MCP Bridge — listens for tool commands from the DAW MCP server (via WebSocket)
 * and executes them against the Zustand store.
 *
 * The MCP server sends JSON messages:
 *   { id: string, tool: string, params: Record<string, unknown> }
 *
 * This bridge executes the tool and responds:
 *   { id: string, result?: unknown, error?: string }
 */

import { useProjectStore } from '../store/projectStore';
import { useTransportStore } from '../store/transportStore';
import { useUIStore } from '../store/uiStore';

const WS_URL = `ws://${window.location.hostname}:${window.location.port}/ws/mcp-bridge`;
const RECONNECT_DELAY_MS = 3000;

interface ToolRequest {
  id: string;
  tool: string;
  params: Record<string, unknown>;
}

interface ToolResponse {
  id: string;
  result?: unknown;
  error?: string;
}

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function connect() {
  if (ws?.readyState === WebSocket.OPEN) return;

  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log('[MCP Bridge] Connected');
  };

  ws.onmessage = (event) => {
    try {
      const request = JSON.parse(event.data as string) as ToolRequest;
      const response = handleToolCall(request);
      ws?.send(JSON.stringify(response));
    } catch (err) {
      console.error('[MCP Bridge] Failed to handle message:', err);
    }
  };

  ws.onclose = () => {
    ws = null;
    reconnectTimer = setTimeout(connect, RECONNECT_DELAY_MS);
  };

  ws.onerror = () => {
    ws?.close();
  };
}

function handleToolCall(request: ToolRequest): ToolResponse {
  const { id, tool, params } = request;

  try {
    const result = executeTool(tool, params);
    return { id, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { id, error: message };
  }
}

function executeTool(tool: string, params: Record<string, unknown>): unknown {
  const project = useProjectStore.getState();
  const transport = useTransportStore.getState();
  const ui = useUIStore.getState();

  switch (tool) {
    // ── Read operations ──
    case 'daw_get_project': {
      const p = project.project;
      if (!p) return { error: 'No project loaded' };
      return {
        name: p.name,
        bpm: p.bpm,
        timeSignature: p.timeSignature,
        totalDuration: p.totalDuration,
        trackCount: p.tracks.length,
        tracks: p.tracks.map((t) => ({
          id: t.id,
          name: t.displayName,
          type: t.trackType,
          clipCount: t.clips.length,
          volume: t.volume,
          pan: t.pan,
          muted: t.muted,
          soloed: t.soloed,
        })),
      };
    }

    case 'daw_get_tracks': {
      const p = project.project;
      if (!p) return [];
      return p.tracks.map((t) => ({
        id: t.id,
        name: t.displayName,
        type: t.trackType,
        clips: t.clips.map((c) => ({
          id: c.id,
          startTime: c.startTime,
          duration: c.duration,
          prompt: c.prompt,
          generationStatus: c.generationStatus,
        })),
        volume: t.volume,
        pan: t.pan,
        muted: t.muted,
        soloed: t.soloed,
      }));
    }

    case 'daw_get_transport': {
      return {
        isPlaying: transport.isPlaying,
        currentTime: transport.currentTime,
        loopEnabled: transport.loopEnabled,
        loopStart: transport.loopStart,
        loopEnd: transport.loopEnd,
      };
    }

    case 'daw_get_mixer': {
      const p = project.project;
      if (!p) return { tracks: [] };
      return {
        tracks: p.tracks.map((t) => ({
          id: t.id,
          name: t.displayName,
          volume: t.volume,
          pan: t.pan,
          muted: t.muted,
          soloed: t.soloed,
        })),
      };
    }

    // ── Write operations ──
    case 'daw_set_bpm': {
      const bpm = Number(params.bpm);
      if (isNaN(bpm) || bpm < 20 || bpm > 999) throw new Error('BPM must be between 20 and 999');
      project.updateProject({ bpm });
      return { success: true, bpm };
    }

    case 'daw_add_track': {
      const typeMap: Record<string, string> = {
        stems: 'stems',
        sample: 'sample',
        sequencer: 'sequencer',
        pianoroll: 'pianoRoll',
      };
      const rawType = params.type as string;
      const trackType = typeMap[rawType];
      if (!trackType) throw new Error(`Invalid track type: ${rawType}. Must be one of: stems, sample, sequencer, pianoroll`);
      const track = project.addTrack('custom', trackType as 'stems' | 'sample' | 'sequencer' | 'pianoRoll');
      if (params.name && typeof params.name === 'string') {
        project.renameTrack(track.id, params.name);
      }
      return { success: true, trackId: track.id, name: track.displayName };
    }

    case 'daw_delete_track': {
      const trackId = params.trackId as string;
      if (!trackId) throw new Error('trackId is required');
      project.removeTracks([trackId]);
      return { success: true };
    }

    case 'daw_add_midi_note': {
      const clipId = params.clipId as string;
      const pitch = Number(params.pitch);
      const startBeat = Number(params.startBeat);
      const durationBeats = Number(params.durationBeats);
      const velocity = params.velocity !== undefined ? Number(params.velocity) : 0.8;
      if (!clipId) throw new Error('clipId is required');
      project.addMidiNote(clipId, { pitch, startBeat, durationBeats, velocity });
      return { success: true };
    }

    case 'daw_toggle_step': {
      const trackId = params.trackId as string;
      const rowId = params.rowId as string;
      const stepIndex = Number(params.stepIndex);
      if (!trackId || !rowId) throw new Error('trackId and rowId are required');
      project.toggleSequencerStep(trackId, rowId, stepIndex);
      return { success: true };
    }

    // ── Transport control ──
    case 'daw_play': {
      transport.play();
      return { success: true };
    }

    case 'daw_stop': {
      transport.stop();
      return { success: true };
    }

    case 'daw_toggle_loop': {
      transport.toggleLoop();
      return { success: true, loopEnabled: transport.loopEnabled };
    }

    // ── Mixer control ──
    case 'daw_set_volume': {
      const trackId = params.trackId as string;
      const volume = Number(params.volume);
      if (!trackId) throw new Error('trackId is required');
      if (isNaN(volume) || volume < 0 || volume > 1) throw new Error('Volume must be between 0 and 1');
      project.updateTrack(trackId, { volume });
      return { success: true };
    }

    case 'daw_set_pan': {
      const trackId = params.trackId as string;
      const pan = Number(params.pan);
      if (!trackId) throw new Error('trackId is required');
      if (isNaN(pan) || pan < -1 || pan > 1) throw new Error('Pan must be between -1 and 1');
      project.updateTrackMixer(trackId, { pan });
      return { success: true };
    }

    case 'daw_toggle_mute': {
      const trackId = params.trackId as string;
      if (!trackId) throw new Error('trackId is required');
      const p = project.project;
      if (!p) throw new Error('No project loaded');
      const track = p.tracks.find((t) => t.id === trackId);
      if (!track) throw new Error(`Track '${trackId}' not found`);
      project.updateTrack(trackId, { muted: !track.muted });
      return { success: true };
    }

    case 'daw_toggle_solo': {
      const trackId = params.trackId as string;
      if (!trackId) throw new Error('trackId is required');
      const p = project.project;
      if (!p) throw new Error('No project loaded');
      const track = p.tracks.find((t) => t.id === trackId);
      if (!track) throw new Error(`Track '${trackId}' not found`);
      project.updateTrack(trackId, { soloed: !track.soloed });
      return { success: true };
    }

    // ── UI ──
    case 'daw_show_mixer': {
      ui.setShowMixer(true);
      return { success: true };
    }

    default:
      throw new Error(`Unknown tool: ${tool}`);
  }
}

export function startMcpBridge() {
  connect();
}

export function stopMcpBridge() {
  reconnectTimer && clearTimeout(reconnectTimer);
  ws?.close();
  ws = null;
}
