/**
 * DAW MCP Server — exposes DAW operations as MCP tools for Claude Code.
 *
 * Architecture:
 *   Claude Code --[MCP stdio]--> This server --[WebSocket]--> Browser (mcpBridge.ts) ---> Zustand Store
 *
 * This server runs as a stdio-based MCP server. Claude Code starts it via
 * the mcp-config.json configuration.
 *
 * Each tool call is forwarded to the browser's MCP bridge WebSocket, which
 * executes the operation against the Zustand store and returns the result.
 */

import { WebSocket } from 'ws';

const BRIDGE_URL = process.env.DAW_MCP_BRIDGE_URL ?? 'ws://127.0.0.1:5174/ws/mcp-bridge';

// ── MCP Protocol Types ──

interface MCPRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

interface MCPResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: unknown;
  error?: { code: number; message: string };
}

interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

// ── Tool Definitions ──

const TOOLS: MCPToolDefinition[] = [
  // Read
  {
    name: 'daw_get_project',
    description: 'Get full project snapshot: name, BPM, tracks, settings',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'daw_get_tracks',
    description: 'List all tracks with their clips, volume, pan, mute/solo state',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'daw_get_transport',
    description: 'Get transport state: playing/stopped, current position, loop settings',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'daw_get_mixer',
    description: 'Get mixer state for all tracks: volume, pan, mute, solo',
    inputSchema: { type: 'object', properties: {} },
  },
  // Write
  {
    name: 'daw_set_bpm',
    description: 'Change the project tempo (BPM)',
    inputSchema: {
      type: 'object',
      properties: { bpm: { type: 'number', description: 'Tempo in BPM (20-999)' } },
      required: ['bpm'],
    },
  },
  {
    name: 'daw_add_track',
    description: 'Add a new track to the project',
    inputSchema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['stems', 'sample', 'sequencer', 'pianoroll'], description: 'Track type' },
        name: { type: 'string', description: 'Optional display name' },
      },
      required: ['type'],
    },
  },
  {
    name: 'daw_delete_track',
    description: 'Remove a track from the project',
    inputSchema: {
      type: 'object',
      properties: { trackId: { type: 'string', description: 'Track ID to delete' } },
      required: ['trackId'],
    },
  },
  {
    name: 'daw_add_midi_note',
    description: 'Add a MIDI note to a clip',
    inputSchema: {
      type: 'object',
      properties: {
        clipId: { type: 'string', description: 'Clip ID' },
        pitch: { type: 'number', description: 'MIDI pitch (0-127)' },
        startBeat: { type: 'number', description: 'Start position in beats' },
        durationBeats: { type: 'number', description: 'Duration in beats' },
        velocity: { type: 'number', description: 'Velocity (0-1), default 0.8' },
      },
      required: ['clipId', 'pitch', 'startBeat', 'durationBeats'],
    },
  },
  {
    name: 'daw_toggle_step',
    description: 'Toggle a sequencer step on/off',
    inputSchema: {
      type: 'object',
      properties: {
        trackId: { type: 'string', description: 'Track ID' },
        rowId: { type: 'string', description: 'Sequencer row ID' },
        stepIndex: { type: 'number', description: 'Step index (0-based)' },
      },
      required: ['trackId', 'rowId', 'stepIndex'],
    },
  },
  // Transport
  {
    name: 'daw_play',
    description: 'Start playback',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'daw_stop',
    description: 'Stop playback',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'daw_toggle_loop',
    description: 'Toggle loop mode on/off',
    inputSchema: { type: 'object', properties: {} },
  },
  // Mixer
  {
    name: 'daw_set_volume',
    description: 'Set track volume',
    inputSchema: {
      type: 'object',
      properties: {
        trackId: { type: 'string', description: 'Track ID' },
        volume: { type: 'number', description: 'Volume level (0-1)' },
      },
      required: ['trackId', 'volume'],
    },
  },
  {
    name: 'daw_set_pan',
    description: 'Set track pan position',
    inputSchema: {
      type: 'object',
      properties: {
        trackId: { type: 'string', description: 'Track ID' },
        pan: { type: 'number', description: 'Pan position (-1 to 1)' },
      },
      required: ['trackId', 'pan'],
    },
  },
  {
    name: 'daw_toggle_mute',
    description: 'Toggle track mute',
    inputSchema: {
      type: 'object',
      properties: { trackId: { type: 'string', description: 'Track ID' } },
      required: ['trackId'],
    },
  },
  {
    name: 'daw_toggle_solo',
    description: 'Toggle track solo',
    inputSchema: {
      type: 'object',
      properties: { trackId: { type: 'string', description: 'Track ID' } },
      required: ['trackId'],
    },
  },
  {
    name: 'daw_show_mixer',
    description: 'Open the mixer panel in the DAW UI',
    inputSchema: { type: 'object', properties: {} },
  },
  // Generation
  {
    name: 'daw_generate',
    description: 'Trigger AI music generation with a text prompt. Sets up the generation form and submits.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Text description of the music to generate (e.g. "upbeat lo-fi hip hop with jazzy piano")' },
        trackId: { type: 'string', description: 'Optional target track ID. If omitted, uses the currently selected track.' },
        duration: { type: 'number', description: 'Optional duration in seconds (default uses current form value)' },
      },
      required: ['prompt'],
    },
  },
];

// ── WebSocket Bridge to Browser ──

let bridgeWs: WebSocket | null = null;
let reconnectAttempts = 0;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
const MAX_RECONNECT_ATTEMPTS = 10;
const BASE_RECONNECT_DELAY_MS = 1000;
const pendingCalls = new Map<string, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function scheduleReconnect() {
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    process.stderr.write(`[DAW MCP Server] Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Use a tool call to retry.\n`);
    return;
  }
  const delay = Math.min(BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts), 30_000);
  reconnectAttempts++;
  process.stderr.write(`[DAW MCP Server] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...\n`);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    void connectBridge().catch(() => {
      // connectBridge already handles scheduling the next reconnect
    });
  }, delay);
}

function connectBridge(): Promise<void> {
  // Cancel any pending reconnect
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }

  return new Promise((resolve, reject) => {
    try {
      bridgeWs = new WebSocket(BRIDGE_URL);
    } catch (err) {
      scheduleReconnect();
      reject(err);
      return;
    }

    bridgeWs.on('open', () => {
      reconnectAttempts = 0; // Reset on successful connection
      process.stderr.write('[DAW MCP Server] Connected to browser bridge.\n');
      resolve();
    });
    bridgeWs.on('error', (err) => reject(err));
    bridgeWs.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString()) as { id: string; result?: unknown; error?: string };
        const pending = pendingCalls.get(response.id);
        if (pending) {
          pendingCalls.delete(response.id);
          if (response.error) {
            pending.reject(new Error(response.error));
          } else {
            pending.resolve(response.result);
          }
        }
      } catch {
        // ignore parse errors
      }
    });
    bridgeWs.on('close', () => {
      bridgeWs = null;
      // Reject all pending calls
      for (const [, pending] of pendingCalls) {
        pending.reject(new Error('Bridge connection lost'));
      }
      pendingCalls.clear();
      // Auto-reconnect with exponential backoff
      scheduleReconnect();
    });
  });
}

let callIdCounter = 0;

async function callBridge(tool: string, params: Record<string, unknown>): Promise<unknown> {
  if (!bridgeWs || bridgeWs.readyState !== WebSocket.OPEN) {
    await connectBridge();
  }

  const id = `mcp-${++callIdCounter}`;
  return new Promise((resolve, reject) => {
    pendingCalls.set(id, { resolve, reject });
    bridgeWs!.send(JSON.stringify({ id, tool, params }));

    // Timeout after 10s
    setTimeout(() => {
      if (pendingCalls.has(id)) {
        pendingCalls.delete(id);
        reject(new Error(`Tool call ${tool} timed out`));
      }
    }, 10_000);
  });
}

// ── MCP stdio Server ──

function sendResponse(response: MCPResponse) {
  const json = JSON.stringify(response);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
}

async function handleRequest(request: MCPRequest) {
  const { id, method, params } = request;

  switch (method) {
    case 'initialize':
      sendResponse({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: 'ace-step-daw', version: '0.1.0' },
        },
      });
      break;

    case 'notifications/initialized':
      // No response needed for notifications
      break;

    case 'tools/list':
      sendResponse({
        jsonrpc: '2.0',
        id,
        result: { tools: TOOLS },
      });
      break;

    case 'tools/call': {
      const toolName = (params as { name: string }).name;
      const toolArgs = ((params as { arguments?: Record<string, unknown> }).arguments) ?? {};

      try {
        const result = await callBridge(toolName, toolArgs);
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        sendResponse({
          jsonrpc: '2.0',
          id,
          result: {
            content: [{ type: 'text', text: `Error: ${message}` }],
            isError: true,
          },
        });
      }
      break;
    }

    default:
      sendResponse({
        jsonrpc: '2.0',
        id,
        error: { code: -32601, message: `Method not found: ${method}` },
      });
  }
}

// ── stdio Reader ──

let buffer = '';

process.stdin.setEncoding('utf-8');
process.stdin.on('data', (chunk: string) => {
  buffer += chunk;

  while (true) {
    const headerEnd = buffer.indexOf('\r\n\r\n');
    if (headerEnd === -1) break;

    const header = buffer.slice(0, headerEnd);
    const contentLengthMatch = header.match(/Content-Length:\s*(\d+)/i);
    if (!contentLengthMatch) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }

    const contentLength = parseInt(contentLengthMatch[1], 10);
    const bodyStart = headerEnd + 4;

    if (buffer.length < bodyStart + contentLength) break;

    const body = buffer.slice(bodyStart, bodyStart + contentLength);
    buffer = buffer.slice(bodyStart + contentLength);

    try {
      const request = JSON.parse(body) as MCPRequest;
      void handleRequest(request);
    } catch {
      // ignore parse errors
    }
  }
});

// Connect to browser bridge on startup
void connectBridge().catch(() => {
  process.stderr.write('[DAW MCP Server] Warning: Could not connect to browser bridge. DAW tools will fail until the DAW is running.\n');
});
