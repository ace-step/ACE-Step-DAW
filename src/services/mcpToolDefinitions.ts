/**
 * MCP Tool Definitions — Formal specification for all DAW MCP tools.
 *
 * This module defines the tool schemas that an MCP server would expose
 * to allow external agents (Claude, custom scripts) to control the DAW.
 *
 * Each tool has:
 * - name: unique tool identifier (prefixed with daw_)
 * - description: what the tool does
 * - inputSchema: JSON Schema for parameters
 * - category: grouping for documentation
 *
 * The mcpBridge.ts module executes these tools against the Zustand stores.
 *
 * NOTE: server/mcp-server.ts maintains its own tool definitions.
 * TODO: Extract shared tool metadata into a common module that both
 * browser (mcpBridge) and Node server (mcp-server.ts) can import
 * to prevent definition drift.
 */

export interface McpToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  default?: unknown;
}

export interface McpToolDefinition {
  name: string;
  description: string;
  category: 'read' | 'write' | 'transport' | 'mixer' | 'generation' | 'session' | 'ui';
  inputSchema: {
    type: 'object';
    properties: Record<string, McpToolParameter>;
    required: string[];
  };
}

// ─── Read Operations ────────────────────────────────────────────────────

const daw_get_project: McpToolDefinition = {
  name: 'daw_get_project',
  description: 'Get the current project state including name, BPM, time signature, tracks, and clip counts.',
  category: 'read',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

const daw_get_tracks: McpToolDefinition = {
  name: 'daw_get_tracks',
  description: 'Get detailed info for all tracks including clips, volume, pan, mute, and solo states.',
  category: 'read',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

const daw_get_transport: McpToolDefinition = {
  name: 'daw_get_transport',
  description: 'Get transport state: playing, current time, loop settings.',
  category: 'read',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

const daw_get_mixer: McpToolDefinition = {
  name: 'daw_get_mixer',
  description: 'Get mixer state for all tracks: volume, pan, mute, solo.',
  category: 'read',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

// ─── Write Operations ───────────────────────────────────────────────────

const daw_set_bpm: McpToolDefinition = {
  name: 'daw_set_bpm',
  description: 'Set the project BPM (tempo).',
  category: 'write',
  inputSchema: {
    type: 'object',
    properties: {
      bpm: { type: 'number', description: 'Beats per minute (20–999).', minimum: 20, maximum: 999 },
    },
    required: ['bpm'],
  },
};

const daw_add_track: McpToolDefinition = {
  name: 'daw_add_track',
  description: 'Add a new track to the project.',
  category: 'write',
  inputSchema: {
    type: 'object',
    properties: {
      type: { type: 'string', description: 'Track type.', enum: ['stems', 'sample', 'sequencer', 'pianoroll'] },
      name: { type: 'string', description: 'Optional display name for the track.' },
    },
    required: ['type'],
  },
};

const daw_delete_track: McpToolDefinition = {
  name: 'daw_delete_track',
  description: 'Delete a track by ID.',
  category: 'write',
  inputSchema: {
    type: 'object',
    properties: {
      trackId: { type: 'string', description: 'The track ID to delete.' },
    },
    required: ['trackId'],
  },
};

const daw_add_midi_note: McpToolDefinition = {
  name: 'daw_add_midi_note',
  description: 'Add a MIDI note to a clip.',
  category: 'write',
  inputSchema: {
    type: 'object',
    properties: {
      clipId: { type: 'string', description: 'Target clip ID.' },
      pitch: { type: 'number', description: 'MIDI pitch (0–127).', minimum: 0, maximum: 127 },
      startBeat: { type: 'number', description: 'Start position in beats.', minimum: 0 },
      durationBeats: { type: 'number', description: 'Duration in beats.', minimum: 0.01 },
      velocity: { type: 'number', description: 'Note velocity (0–1).', minimum: 0, maximum: 1, default: 0.8 },
    },
    required: ['clipId', 'pitch', 'startBeat', 'durationBeats'],
  },
};

const daw_toggle_step: McpToolDefinition = {
  name: 'daw_toggle_step',
  description: 'Toggle a sequencer step on/off.',
  category: 'write',
  inputSchema: {
    type: 'object',
    properties: {
      trackId: { type: 'string', description: 'Sequencer track ID.' },
      rowId: { type: 'string', description: 'Row ID within the sequencer.' },
      stepIndex: { type: 'number', description: 'Step index to toggle.', minimum: 0 },
    },
    required: ['trackId', 'rowId', 'stepIndex'],
  },
};

// ─── Transport ──────────────────────────────────────────────────────────

const daw_play: McpToolDefinition = {
  name: 'daw_play',
  description: 'Start playback.',
  category: 'transport',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

const daw_stop: McpToolDefinition = {
  name: 'daw_stop',
  description: 'Stop playback.',
  category: 'transport',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

const daw_toggle_loop: McpToolDefinition = {
  name: 'daw_toggle_loop',
  description: 'Toggle loop playback on/off.',
  category: 'transport',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

// ─── Mixer ──────────────────────────────────────────────────────────────

const daw_set_volume: McpToolDefinition = {
  name: 'daw_set_volume',
  description: 'Set a track\'s volume level.',
  category: 'mixer',
  inputSchema: {
    type: 'object',
    properties: {
      trackId: { type: 'string', description: 'Target track ID.' },
      volume: { type: 'number', description: 'Volume level (0–1).', minimum: 0, maximum: 1 },
    },
    required: ['trackId', 'volume'],
  },
};

const daw_set_pan: McpToolDefinition = {
  name: 'daw_set_pan',
  description: 'Set a track\'s stereo pan position.',
  category: 'mixer',
  inputSchema: {
    type: 'object',
    properties: {
      trackId: { type: 'string', description: 'Target track ID.' },
      pan: { type: 'number', description: 'Pan position (-1 = hard left, 0 = center, 1 = hard right).', minimum: -1, maximum: 1 },
    },
    required: ['trackId', 'pan'],
  },
};

const daw_toggle_mute: McpToolDefinition = {
  name: 'daw_toggle_mute',
  description: 'Toggle mute on a track.',
  category: 'mixer',
  inputSchema: {
    type: 'object',
    properties: {
      trackId: { type: 'string', description: 'Target track ID.' },
    },
    required: ['trackId'],
  },
};

const daw_toggle_solo: McpToolDefinition = {
  name: 'daw_toggle_solo',
  description: 'Toggle solo on a track.',
  category: 'mixer',
  inputSchema: {
    type: 'object',
    properties: {
      trackId: { type: 'string', description: 'Target track ID.' },
    },
    required: ['trackId'],
  },
};

// ─── Generation ─────────────────────────────────────────────────────────

const daw_generate: McpToolDefinition = {
  name: 'daw_generate',
  description: 'Start AI music generation with a text prompt.',
  category: 'generation',
  inputSchema: {
    type: 'object',
    properties: {
      prompt: { type: 'string', description: 'Text prompt describing the desired music.' },
      trackId: { type: 'string', description: 'Optional target track ID. If omitted, auto-selects.' },
      duration: { type: 'number', description: 'Optional generation duration in seconds.', minimum: 1, maximum: 300 },
    },
    required: ['prompt'],
  },
};

// ─── UI ─────────────────────────────────────────────────────────────────

const daw_show_mixer: McpToolDefinition = {
  name: 'daw_show_mixer',
  description: 'Show the mixer panel.',
  category: 'ui',
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

// ─── Registry ───────────────────────────────────────────────────────────

/** All available MCP tools, keyed by tool name. */
export const MCP_TOOL_DEFINITIONS: Record<string, McpToolDefinition> = {
  daw_get_project,
  daw_get_tracks,
  daw_get_transport,
  daw_get_mixer,
  daw_set_bpm,
  daw_add_track,
  daw_delete_track,
  daw_add_midi_note,
  daw_toggle_step,
  daw_play,
  daw_stop,
  daw_toggle_loop,
  daw_set_volume,
  daw_set_pan,
  daw_toggle_mute,
  daw_toggle_solo,
  daw_generate,
  daw_show_mixer,
};

/** Get all tool definitions as an array (for MCP server registration). */
export function getAllToolDefinitions(): McpToolDefinition[] {
  return Object.values(MCP_TOOL_DEFINITIONS);
}

/** Get tool definitions by category. */
export function getToolsByCategory(category: McpToolDefinition['category']): McpToolDefinition[] {
  return Object.values(MCP_TOOL_DEFINITIONS).filter((t) => t.category === category);
}

/** Lookup a single tool definition by name. */
export function getToolDefinition(name: string): McpToolDefinition | undefined {
  return MCP_TOOL_DEFINITIONS[name];
}

// ─── API Version ────────────────────────────────────────────────────────

export const MCP_API_VERSION = '1.0.0';

/**
 * API versioning strategy:
 * - Major version: breaking changes (removed tools, changed parameter names)
 * - Minor version: new tools added (backward compatible)
 * - Patch version: description/documentation updates
 *
 * Breaking change policy: deprecated tools are retained for 2 minor versions
 * with a deprecation notice before removal.
 */
export const API_VERSIONING = {
  version: MCP_API_VERSION,
  deprecatedTools: [] as string[],
  breakingChangePolicy: 'Deprecated tools are retained for 2 minor versions before removal.',
} as const;
