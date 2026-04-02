/**
 * Generation Error Classifier
 *
 * Categorizes AI generation errors with actionable recovery suggestions.
 * Used by generationStore to provide meaningful feedback to users.
 */

export type GenerationErrorCategory =
  | 'network'
  | 'timeout'
  | 'rate-limited'
  | 'model-error'
  | 'unknown';

export interface ClassifiedError {
  category: GenerationErrorCategory;
  suggestion: string;
  retryable: boolean;
  /** Suggested delay before retrying (seconds). Only set for rate-limited errors. */
  retryDelaySeconds?: number;
}

const NETWORK_PATTERNS = [
  'failed to fetch',
  'networkerror',
  'network request failed',
  'net::err_',
  'err_internet',
  'err_connection',
  'econnrefused',
  'enotfound',
  'econnreset',
  'connection appears to be offline',
  'load failed',
];

const TIMEOUT_PATTERNS = [
  'timed out',
  'timeout',
  'the operation was aborted',
  'aborterror',
];

const RATE_LIMIT_PATTERNS = [
  'rate limit',
  'rate_limit',
  '429',
  'too many requests',
  'throttle',
];

const MODEL_ERROR_PATTERNS = [
  'cuda out of memory',
  'model inference',
  'internal server error',
  'model switch failed',
  'model not found',
  '500 ',
  '503 ',
  'generation failed:',
  'invalid parameter',
  'server error',
];

function matchesAny(lower: string, patterns: string[]): boolean {
  return patterns.some((p) => lower.includes(p));
}

export function classifyGenerationError(message?: string): ClassifiedError {
  const trimmed = message?.trim() ?? '';
  if (!trimmed) {
    return {
      category: 'unknown',
      suggestion: 'Generation failed. Retry the request. If it keeps failing, verify the backend is healthy.',
      retryable: true,
    };
  }

  const lower = trimmed.toLowerCase();

  if (matchesAny(lower, NETWORK_PATTERNS)) {
    return {
      category: 'network',
      suggestion: 'Check your network connection and verify the backend server is running, then retry.',
      retryable: true,
    };
  }

  if (matchesAny(lower, TIMEOUT_PATTERNS)) {
    return {
      category: 'timeout',
      suggestion: 'The server took too long to respond. Retry with a shorter duration or fewer inference steps.',
      retryable: true,
    };
  }

  if (matchesAny(lower, RATE_LIMIT_PATTERNS)) {
    return {
      category: 'rate-limited',
      suggestion: 'Too many requests. Wait a moment before retrying — the server needs time to process.',
      retryable: true,
      retryDelaySeconds: 30,
    };
  }

  if (matchesAny(lower, MODEL_ERROR_PATTERNS)) {
    return {
      category: 'model-error',
      suggestion: 'The AI model encountered an error. Try reducing inference steps or check the backend logs.',
      retryable: lower.includes('cuda') || lower.includes('500') || lower.includes('503'),
    };
  }

  return {
    category: 'unknown',
    suggestion: `${trimmed}. Retry the request. If it keeps failing, check the backend logs.`,
    retryable: true,
  };
}
