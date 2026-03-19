import { useProjectStore } from '../store/projectStore';
import { useUIStore } from '../store/uiStore';

export function resolveFocusedTrackId(): string | null {
  const ui = useUIStore.getState();
  const project = useProjectStore.getState().project;
  if (!project) return null;

  const inProject = (trackId: string | null | undefined) =>
    trackId ? project.tracks.find((track) => track.id === trackId)?.id ?? null : null;

  const keyboardTrackId = inProject(ui.keyboardContext.trackId);
  if (keyboardTrackId) return keyboardTrackId;

  const editorTrackId = inProject(ui.openPianoRollTrackId)
    ?? inProject(ui.openSequencerTrackId)
    ?? inProject(ui.openDrumMachineTrackId)
    ?? inProject(ui.expandedTrackId);
  if (editorTrackId) return editorTrackId;

  if (ui.selectedClipIds.size > 0) {
    const selectedClipIds = new Set(ui.selectedClipIds);
    for (const track of project.tracks) {
      if (track.clips.some((clip) => selectedClipIds.has(clip.id))) {
        return track.id;
      }
    }
  }

  return project.tracks[0]?.id ?? null;
}
