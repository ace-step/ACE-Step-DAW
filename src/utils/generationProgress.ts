/**
 * Honest ETA computation and display formatting for AI generation progress.
 *
 * ETA is only computed when enough signal exists (>= 3 seconds elapsed AND
 * progress > 0%). Otherwise we fall back to stage-only messaging.
 */

const MIN_ELAPSED_FOR_ETA_MS = 3000;

/**
 * Compute estimated seconds remaining based on elapsed time and progress %.
 * Returns null when there isn't enough data for a reliable estimate.
 */
export function computeEta(
  startedAt: number | undefined,
  progressPercent: number | undefined,
): number | null {
  if (startedAt === undefined || progressPercent === undefined) return null;
  if (progressPercent <= 0) return null;
  if (progressPercent >= 100) return 0;

  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs < MIN_ELAPSED_FOR_ETA_MS) return null;

  const totalEstimatedMs = (elapsedMs / progressPercent) * 100;
  const remainingMs = totalEstimatedMs - elapsedMs;
  return Math.max(0, Math.round(remainingMs / 1000));
}

/**
 * Format ETA seconds into a human-readable string.
 * Returns empty string for null (no ETA available).
 */
export function formatEtaDisplay(etaSeconds: number | null): string {
  if (etaSeconds === null) return '';
  if (etaSeconds < 5) return '< 5s';
  if (etaSeconds < 60) return `~${Math.round(etaSeconds)}s`;
  const minutes = Math.floor(etaSeconds / 60);
  const seconds = Math.round(etaSeconds % 60);
  return `~${minutes}m ${seconds}s`;
}
