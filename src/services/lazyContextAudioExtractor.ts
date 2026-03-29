import type { ContextWindow, ExtractOptions } from './contextAudioExtractor';

export async function extractContextAudioLazy(
  contextWindow: ContextWindow,
  options?: ExtractOptions,
): Promise<Blob | null> {
  const { extractContextAudio } = await import('./contextAudioExtractor');
  return extractContextAudio(contextWindow, options);
}
