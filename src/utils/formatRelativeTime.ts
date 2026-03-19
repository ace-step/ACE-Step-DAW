/**
 * Format a timestamp as a relative time string (e.g. "5m ago", "2d ago").
 * @param timestamp - Unix ms timestamp to format
 * @param now - Current time in ms (defaults to Date.now())
 */
export function formatRelativeTime(timestamp: number, now: number = Date.now()): string {
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);
  const diffMonth = Math.floor(diffDay / 30);

  if (diffMin < 1) return 'just now';
  if (diffHour < 1) return `${diffMin}m ago`;
  if (diffDay < 1) return `${diffHour}h ago`;
  if (diffMonth < 1) return `${diffDay}d ago`;
  return `${diffMonth}mo ago`;
}
