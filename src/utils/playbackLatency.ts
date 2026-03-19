import type { PlaybackLatencySettings } from '../types/project';

export interface PlaybackLatencyMeasurement {
  baseLatency?: number | null;
  outputLatency?: number | null;
}

interface AudioContextLatencyLike {
  baseLatency?: number;
  outputLatency?: number;
}

const MAX_PLAYBACK_LATENCY_MS = 500;

function roundLatencyMs(value: number): number {
  return Math.round(value * 10) / 10;
}

function clampLatencyMs(value: number): number {
  return roundLatencyMs(Math.max(0, Math.min(MAX_PLAYBACK_LATENCY_MS, value)));
}

function toLatencyMs(value?: number | null): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return null;
  }
  return clampLatencyMs(value * 1000);
}

export function createDefaultPlaybackLatencySettings(): PlaybackLatencySettings {
  return {
    detectedBaseLatencyMs: null,
    detectedOutputLatencyMs: null,
    detectedLatencyMs: null,
    manualOverrideMs: null,
    compensationMs: 0,
    source: 'fallback',
    browserSupport: 'missing',
    updatedAt: null,
  };
}

export function normalizePlaybackLatencySettings(
  settings?: Partial<PlaybackLatencySettings> | null,
): PlaybackLatencySettings {
  const defaults = createDefaultPlaybackLatencySettings();
  const detectedBaseLatencyMs = settings?.detectedBaseLatencyMs ?? defaults.detectedBaseLatencyMs;
  const detectedOutputLatencyMs = settings?.detectedOutputLatencyMs ?? defaults.detectedOutputLatencyMs;
  const manualOverrideMs =
    typeof settings?.manualOverrideMs === 'number' && Number.isFinite(settings.manualOverrideMs)
      ? clampLatencyMs(settings.manualOverrideMs)
      : null;
  const explicitDetectedMs =
    typeof settings?.detectedLatencyMs === 'number' && Number.isFinite(settings.detectedLatencyMs)
      ? clampLatencyMs(settings.detectedLatencyMs)
      : null;
  const detectedLatencyMs = explicitDetectedMs
    ?? (detectedBaseLatencyMs !== null || detectedOutputLatencyMs !== null
      ? clampLatencyMs((detectedBaseLatencyMs ?? 0) + (detectedOutputLatencyMs ?? 0))
      : null);
  const browserSupport =
    settings?.browserSupport
    ?? (detectedBaseLatencyMs !== null || detectedOutputLatencyMs !== null ? 'available' : 'missing');
  const source = manualOverrideMs !== null
    ? 'manual'
    : detectedLatencyMs !== null
      ? 'auto'
      : 'fallback';
  const compensationMs = manualOverrideMs ?? detectedLatencyMs ?? 0;

  return {
    detectedBaseLatencyMs,
    detectedOutputLatencyMs,
    detectedLatencyMs,
    manualOverrideMs,
    compensationMs,
    source,
    browserSupport,
    updatedAt: settings?.updatedAt ?? defaults.updatedAt,
  };
}

export function detectPlaybackLatencySettings(
  current: PlaybackLatencySettings | null | undefined,
  latency: {
    baseLatency?: number | null;
    outputLatency?: number | null;
  },
): PlaybackLatencySettings {
  const previous = normalizePlaybackLatencySettings(current);
  const detectedBaseLatencyMs = toLatencyMs(latency.baseLatency);
  const detectedOutputLatencyMs = toLatencyMs(latency.outputLatency);

  return normalizePlaybackLatencySettings({
    ...previous,
    detectedBaseLatencyMs,
    detectedOutputLatencyMs,
    detectedLatencyMs:
      detectedBaseLatencyMs !== null || detectedOutputLatencyMs !== null
        ? clampLatencyMs((detectedBaseLatencyMs ?? 0) + (detectedOutputLatencyMs ?? 0))
        : null,
    browserSupport:
      detectedBaseLatencyMs !== null || detectedOutputLatencyMs !== null ? 'available' : 'missing',
    updatedAt: Date.now(),
  });
}

export function setPlaybackLatencyOverrideSettings(
  current: PlaybackLatencySettings | null | undefined,
  manualOverrideMs: number | null,
): PlaybackLatencySettings {
  const previous = normalizePlaybackLatencySettings(current);

  return normalizePlaybackLatencySettings({
    ...previous,
    manualOverrideMs:
      typeof manualOverrideMs === 'number' && Number.isFinite(manualOverrideMs)
        ? clampLatencyMs(manualOverrideMs)
        : null,
    updatedAt: Date.now(),
  });
}

export function getPlaybackLatencyCompensationSeconds(
  latency: PlaybackLatencySettings | null | undefined,
): number {
  return normalizePlaybackLatencySettings(latency).compensationMs / 1000;
}

export function ensurePlaybackLatencySettings(
  current?: PlaybackLatencySettings | null,
): PlaybackLatencySettings {
  return normalizePlaybackLatencySettings(current);
}

export function readAudioContextPlaybackLatency(
  ctx: AudioContextLatencyLike,
): PlaybackLatencyMeasurement {
  return {
    baseLatency: typeof ctx.baseLatency === 'number' ? ctx.baseLatency : null,
    outputLatency: typeof ctx.outputLatency === 'number' ? ctx.outputLatency : null,
  };
}
