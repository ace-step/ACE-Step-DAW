/**
 * Lightweight line-by-line code diff utility.
 *
 * Uses a simple LCS (Longest Common Subsequence) algorithm to produce
 * minimal line-level diffs between two code strings.
 * Designed for Strudel pattern comparison in agent iteration workflows.
 */

export interface DiffLine {
  type: 'added' | 'removed' | 'unchanged';
  content: string;
}

/**
 * Compute a line-by-line diff between two code strings.
 * Returns an array of DiffLine entries showing what changed.
 */
function splitLines(input: string): string[] {
  return input === '' ? [] : input.split('\n');
}

export function computeLineDiff(before: string, after: string): DiffLine[] {
  const beforeLines = splitLines(before);
  const afterLines = splitLines(after);

  // Build LCS table
  const m = beforeLines.length;
  const n = afterLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (beforeLines[i - 1] === afterLines[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to build diff
  const result: DiffLine[] = [];
  let i = m;
  let j = n;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && beforeLines[i - 1] === afterLines[j - 1]) {
      result.push({ type: 'unchanged', content: beforeLines[i - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      result.push({ type: 'added', content: afterLines[j - 1] });
      j--;
    } else {
      result.push({ type: 'removed', content: beforeLines[i - 1] });
      i--;
    }
  }

  return result.reverse();
}

/**
 * Format a diff into a human-readable summary string.
 */
export function formatDiffSummary(diff: DiffLine[]): string {
  const added = diff.filter((l) => l.type === 'added').length;
  const removed = diff.filter((l) => l.type === 'removed').length;

  if (added === 0 && removed === 0) {
    return 'no changes';
  }

  const parts: string[] = [];
  if (added > 0) parts.push(`${added} added`);
  if (removed > 0) parts.push(`${removed} removed`);
  return parts.join(', ');
}

/**
 * Format a diff as a unified diff string (for agent consumption).
 */
export function formatUnifiedDiff(diff: DiffLine[]): string {
  return diff.map((line) => {
    switch (line.type) {
      case 'added': return `+ ${line.content}`;
      case 'removed': return `- ${line.content}`;
      default: return `  ${line.content}`;
    }
  }).join('\n');
}
