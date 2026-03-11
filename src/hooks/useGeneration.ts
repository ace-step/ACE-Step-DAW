import { useCallback } from 'react';
import { useGenerationStore } from '../store/generationStore';
import { useProjectStore } from '../store/projectStore';
import { generateAllTracks, generateSingleClip } from '../services/generationPipeline';

export function useGeneration() {
  const { jobs, isGenerating } = useGenerationStore();
  const project = useProjectStore((s) => s.project);

  const generateAll = useCallback(async () => {
    if (!project || isGenerating) return;
    await generateAllTracks();
  }, [project, isGenerating]);

  const generateClip = useCallback(async (clipId: string, options?: { sharedSeed?: number }) => {
    if (!project || isGenerating) return;
    await generateSingleClip(clipId, options);
  }, [project, isGenerating]);

  return { jobs, isGenerating, generateAll, generateClip };
}
