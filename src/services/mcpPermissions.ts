/**
 * MCP Permission Model — Rate limiting and access control for external agents.
 *
 * Provides a simple permission system for MCP tool access:
 * - Read operations: always allowed (no rate limit)
 * - Write operations: rate limited per tool
 * - Destructive operations: require explicit confirmation
 *
 * Rate limits are per-session and reset on page reload.
 */

export type PermissionLevel = 'read' | 'write' | 'destructive';

export interface RateLimitConfig {
  /** Maximum calls per window period. */
  maxCalls: number;
  /** Window period in milliseconds. */
  windowMs: number;
}

export interface PermissionConfig {
  level: PermissionLevel;
  rateLimit?: RateLimitConfig;
  requireConfirmation?: boolean;
}

// ─── Tool Permission Map ────────────────────────────────────────────────

const TOOL_PERMISSIONS: Record<string, PermissionConfig> = {
  // Read operations — unlimited
  daw_get_project: { level: 'read' },
  daw_get_tracks: { level: 'read' },
  daw_get_transport: { level: 'read' },
  daw_get_mixer: { level: 'read' },

  // Write operations — rate limited
  daw_set_bpm: { level: 'write', rateLimit: { maxCalls: 30, windowMs: 60_000 } },
  daw_add_track: { level: 'write', rateLimit: { maxCalls: 20, windowMs: 60_000 } },
  daw_add_midi_note: { level: 'write', rateLimit: { maxCalls: 200, windowMs: 60_000 } },
  daw_toggle_step: { level: 'write', rateLimit: { maxCalls: 100, windowMs: 60_000 } },
  daw_set_volume: { level: 'write', rateLimit: { maxCalls: 60, windowMs: 60_000 } },
  daw_set_pan: { level: 'write', rateLimit: { maxCalls: 60, windowMs: 60_000 } },
  daw_toggle_mute: { level: 'write', rateLimit: { maxCalls: 30, windowMs: 60_000 } },
  daw_toggle_solo: { level: 'write', rateLimit: { maxCalls: 30, windowMs: 60_000 } },
  daw_play: { level: 'write', rateLimit: { maxCalls: 30, windowMs: 60_000 } },
  daw_stop: { level: 'write', rateLimit: { maxCalls: 30, windowMs: 60_000 } },
  daw_toggle_loop: { level: 'write', rateLimit: { maxCalls: 30, windowMs: 60_000 } },
  daw_show_mixer: { level: 'write', rateLimit: { maxCalls: 10, windowMs: 60_000 } },

  // Generation — strictly limited
  daw_generate: { level: 'write', rateLimit: { maxCalls: 5, windowMs: 60_000 } },

  // Destructive operations — require confirmation
  daw_delete_track: { level: 'destructive', rateLimit: { maxCalls: 10, windowMs: 60_000 }, requireConfirmation: true },
};

// ─── Rate Limiter ───────────────────────────────────────────────────────

interface RateLimitEntry {
  timestamps: number[];
}

const rateLimitState = new Map<string, RateLimitEntry>();

function isRateLimited(toolName: string): boolean {
  const config = TOOL_PERMISSIONS[toolName];
  if (!config?.rateLimit) return false;

  const now = Date.now();
  const { maxCalls, windowMs } = config.rateLimit;

  let entry = rateLimitState.get(toolName);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitState.set(toolName, entry);
  }

  // Prune old timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  return entry.timestamps.length >= maxCalls;
}

function recordCall(toolName: string): void {
  let entry = rateLimitState.get(toolName);
  if (!entry) {
    entry = { timestamps: [] };
    rateLimitState.set(toolName, entry);
  }
  entry.timestamps.push(Date.now());
}

// ─── Permission Checks ─────────────────────────────────────────────────

export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiresConfirmation?: boolean;
}

/**
 * Check if a tool call is permitted.
 * Returns allowed: true if the call can proceed,
 * or allowed: false with a reason if blocked.
 */
export function checkPermission(toolName: string): PermissionCheckResult {
  const config = TOOL_PERMISSIONS[toolName];

  // Unknown tools are denied by default
  if (!config) {
    return { allowed: false, reason: `Unknown tool: ${toolName}` };
  }

  // Check rate limit
  if (isRateLimited(toolName)) {
    const limit = config.rateLimit!;
    return {
      allowed: false,
      reason: `Rate limit exceeded: ${limit.maxCalls} calls per ${limit.windowMs / 1000}s window`,
    };
  }

  // Destructive operations need confirmation
  if (config.requireConfirmation) {
    return { allowed: true, requiresConfirmation: true };
  }

  return { allowed: true };
}

/**
 * Record a successful tool call for rate limiting.
 * Call this AFTER the tool execution succeeds.
 */
export function recordToolCall(toolName: string): void {
  const config = TOOL_PERMISSIONS[toolName];
  if (!config?.rateLimit) return;
  recordCall(toolName);
}

/**
 * Get the permission configuration for a tool.
 */
export function getToolPermission(toolName: string): PermissionConfig | undefined {
  return TOOL_PERMISSIONS[toolName];
}

/**
 * Reset all rate limit counters (used in testing or on session reset).
 */
export function resetRateLimits(): void {
  rateLimitState.clear();
}

/**
 * Get current rate limit status for a tool.
 */
export function getRateLimitStatus(toolName: string): {
  remaining: number;
  total: number;
  windowMs: number;
} | null {
  const config = TOOL_PERMISSIONS[toolName];
  if (!config?.rateLimit) return null;

  const { maxCalls, windowMs } = config.rateLimit;
  const now = Date.now();
  const entry = rateLimitState.get(toolName);
  if (entry) {
    // Prune old timestamps to prevent unbounded growth
    entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);
  }
  const recentCalls = entry ? entry.timestamps.length : 0;

  return {
    remaining: Math.max(0, maxCalls - recentCalls),
    total: maxCalls,
    windowMs,
  };
}
