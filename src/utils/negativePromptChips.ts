/** Common negative prompt suggestions for AI music generation. */
export const NEGATIVE_PROMPT_SUGGESTIONS = [
  'no autotune',
  'no reverb',
  'no distortion',
  'no heavy bass',
  'no synthesizer',
  'no vocals',
  'no drums',
  'no noise',
] as const;

/**
 * Check if a chip is active in a comma-separated negative prompt string.
 * Uses exact token matching (case-insensitive) to avoid false positives.
 */
export function isChipActive(text: string, chip: string): boolean {
  if (!text.trim()) return false;
  const tokens = text.split(',').map((t) => t.trim().toLowerCase());
  return tokens.includes(chip.trim().toLowerCase());
}

/**
 * Toggle a chip in a comma-separated negative prompt string.
 * Adds if absent, removes if present. Uses exact token matching.
 */
export function toggleNegativePromptChip(text: string, chip: string): string {
  const tokens = text.split(',').map((t) => t.trim()).filter(Boolean);
  const chipLower = chip.trim().toLowerCase();

  if (isChipActive(text, chip)) {
    // Remove: filter out the exact match
    return tokens
      .filter((t) => t.toLowerCase() !== chipLower)
      .join(', ');
  }

  // Add
  if (!text.trim()) return chip.trim();
  return `${text.trim()}, ${chip.trim()}`;
}
