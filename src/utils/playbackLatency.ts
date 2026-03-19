import type { PlaybackLatencySettings } from '../types/project';

export interface PlaybackLatencyMeasurement {
  baseLatency?: number | null;
  outputLatency?: number | null;
}

interface AudioContextLatencyLike {
  baseLatency?: number;
  outputLatency?: number;
}

function normalizeLatencyMs(value?: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 1000);
}

function normalizeOverrideMs(value?: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return Math.max(0, Math.round(value));
}

export function buildPlaybackLatencySettings(
  measurement?: PlaybackLatencyMeasurement,
  current?: PlaybackLatencySettings | null,
): PlaybackLatencySettings {
  const baseLatencyMs = normalizeLatencyMs(measurement?.baseLatency) ?? current?.baseLatencyMs ?? null;
  const outputLatencyMs = normalizeLatencyMs(measurement?.outputLatency) ?? current?.outputLatencyMs ?? null;
  const detectedMs = baseLatencyMs !== null || outputLatencyMs !== null
    ? (baseLatencyMs ?? 0) + (outputLatencyMs ?? 0)
    : null;
  const overrideMs = normalizeOverrideMs(current?.overrideMs);

  if (overrideMs !== null) {
    return {
      source: 'manual',
      baseLatencyMs,
      outputLatencyMs,
      detectedMs,
      overrideMs,
      effectiveMs: overrideMs,
    };
  }

  if (detectedMs !== null) {
    return {
      source: 'detected',
      baseLatencyMs,
      outputLatencyMs,
      detectedMs,
      overrideMs: null,
      effectiveMs: detectedMs,
    };
  }

  return {
    source: 'fallback',
    baseLatencyMs: null,
    outputLatencyMs: null,
    detectedMs: null,
    overrideMs: null,
    effectiveMs: 0,
  };
}

export function setPlaybackLatencyOverride(
  current: PlaybackLatencySettings | null | undefined,
  overrideMs: number | null,
): PlaybackLatencySettings {
  return buildPlaybackLatencySettings(undefined, {
    ...buildPlaybackLatencySettings(undefined, current),
    overrideMs: normalizeOverrideMs(overrideMs),
  });
}

export function ensurePlaybackLatencySettings(
  current?: PlaybackLatencySettings | null,
): PlaybackLatencySettings {
  return buildPlaybackLatencySettings(undefined, current);
}

export function readAudioContextPlaybackLatency(
  ctx: AudioContextLatencyLike,
): PlaybackLatencyMeasurement {
  return {
    baseLatency: typeof ctx.baseLatency === 'number' ? ctx.baseLatency : null,
    outputLatency: typeof ctx.outputLatency === 'number' ? ctx.outputLatency : null,
  };
}
