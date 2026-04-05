import { useEffect, useRef } from 'react';
import { useProjectStore } from '../store/projectStore';
import { useUIStore } from '../store/uiStore';
import { markMilestone } from './useOnboardingProgress';

/**
 * Passively monitors store state changes and marks onboarding milestones.
 * Uses stable scalars to avoid re-running on every project update.
 * Should be mounted once in the app shell.
 */
export function useOnboardingTracking() {
  const projectId = useProjectStore((s) => s.project?.id ?? null);
  const trackCount = useProjectStore((s) => s.project?.tracks.length ?? 0);
  const showMixer = useUIStore((s) => s.showMixer);
  const openPianoRollTrackId = useUIStore((s) => s.openPianoRollTrackId);
  const mainView = useUIStore((s) => s.mainView);
  const showCommandPalette = useUIStore((s) => s.showCommandPalette);

  // Use refs to ensure each milestone is only evaluated once per session
  const marked = useRef(new Set<string>());

  useEffect(() => {
    if (projectId && !marked.current.has('created_project')) {
      marked.current.add('created_project');
      markMilestone('created_project');
    }
  }, [projectId]);

  useEffect(() => {
    if (trackCount > 0 && !marked.current.has('added_track')) {
      marked.current.add('added_track');
      markMilestone('added_track');
    }
  }, [trackCount]);

  useEffect(() => {
    if (showMixer && !marked.current.has('used_mixer')) {
      marked.current.add('used_mixer');
      markMilestone('used_mixer');
    }
  }, [showMixer]);

  useEffect(() => {
    if (openPianoRollTrackId && !marked.current.has('used_piano_roll')) {
      marked.current.add('used_piano_roll');
      markMilestone('used_piano_roll');
    }
  }, [openPianoRollTrackId]);

  useEffect(() => {
    if (mainView === 'session' && !marked.current.has('used_session_view')) {
      marked.current.add('used_session_view');
      markMilestone('used_session_view');
    }
  }, [mainView]);

  useEffect(() => {
    if (showCommandPalette && !marked.current.has('used_command_palette')) {
      marked.current.add('used_command_palette');
      markMilestone('used_command_palette');
    }
  }, [showCommandPalette]);
}
