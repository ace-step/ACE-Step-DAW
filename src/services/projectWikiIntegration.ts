/**
 * Project Wiki Integration — connects the wiki to the generation pipeline
 * via Zustand store subscription. When a clip transitions to 'ready' or
 * 'error', the generation-log wiki page is automatically updated.
 * @see https://github.com/ace-step/ACE-Step-DAW/issues/1453
 */

import { useProjectStore } from '../store/projectStore';
import { getProjectWiki } from './projectWiki';
import type { Clip, Track } from '../types/project';

/** Track clip statuses from the previous store snapshot. */
let prevClipStatuses = new Map<string, string>();
let unsubscribe: (() => void) | null = null;

/**
 * Start watching for clip generation status changes and auto-update the wiki.
 * Call once at app startup (e.g., in App.tsx or main.ts).
 */
export function startWikiGenerationLogger(): void {
  if (unsubscribe) return; // already running

  unsubscribe = useProjectStore.subscribe((state) => {
    const project = state.project;
    if (!project) return;

    const currentStatuses = new Map<string, string>();
    const clipTrackMap = new Map<string, { clip: Clip; track: Track }>();

    for (const track of project.tracks) {
      for (const clip of track.clips) {
        currentStatuses.set(clip.id, clip.generationStatus ?? 'pending');
        clipTrackMap.set(clip.id, { clip, track });
      }
    }

    // Detect transitions to 'ready' or 'error'
    for (const [clipId, newStatus] of currentStatuses) {
      const prevStatus = prevClipStatuses.get(clipId);
      if (prevStatus === newStatus) continue;
      if (newStatus !== 'ready' && newStatus !== 'error') continue;
      // Skip if clip was already in this status (first render)
      if (prevStatus === undefined) continue;

      const entry = clipTrackMap.get(clipId);
      if (!entry) continue;

      const wiki = getProjectWiki(project.id);

      // Fire and forget — don't block the store update
      wiki.initialize().then(() => {
        wiki.appendGenerationLog({
          clipId,
          trackName: entry.track.displayName,
          prompt: entry.clip.prompt ?? '',
          success: newStatus === 'ready',
          timestamp: Date.now(),
          params: entry.clip.generationParams
            ? {
                type: entry.clip.generationParams.type,
                guidanceScale: entry.clip.generationParams.guidanceScale,
                inferenceSteps: entry.clip.generationParams.inferenceSteps,
              }
            : undefined,
          errorMessage: newStatus === 'error' ? (entry.clip.errorMessage ?? undefined) : undefined,
        });
      });
    }

    prevClipStatuses = currentStatuses;
  });
}

/**
 * Stop the wiki generation logger. Useful for testing or cleanup.
 */
export function stopWikiGenerationLogger(): void {
  if (unsubscribe) {
    unsubscribe();
    unsubscribe = null;
  }
  prevClipStatuses.clear();
}
