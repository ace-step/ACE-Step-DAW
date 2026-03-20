import type { ContextWindow } from './contextAudioExtractor';

export async function extractContextAudioLazy(
  contextWindow: ContextWindow,
): Promise<Blob | null> {
  const { extractContextAudio } = await import('./contextAudioExtractor');
  return extractContextAudio(contextWindow);
}
