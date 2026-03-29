/**
 * Fallback clip context menu for macOS trackpad two-finger press.
 * When the contextmenu event targets the lane instead of the clip,
 * Timeline detects the clip by bounding rect and renders this component,
 * which looks up the clip/track from the store and delegates to ClipContextMenuContainer.
 */
import { useProjectStore } from '../../store/projectStore';
import { ClipContextMenuContainer } from './ClipContextMenuContainer';
import { useUIStore } from '../../store/uiStore';

interface ClipContextMenuFallbackProps {
  x: number;
  y: number;
  clipId: string;
  onClose: () => void;
}

export function ClipContextMenuFallback({ x, y, clipId, onClose }: ClipContextMenuFallbackProps) {
  const project = useProjectStore((s) => s.project);
  if (!project) return null;

  let foundClip = null;
  let foundTrack = null;
  for (const track of project.tracks) {
    const clip = track.clips.find((c) => c.id === clipId);
    if (clip) {
      foundClip = clip;
      foundTrack = track;
      break;
    }
  }

  if (!foundClip || !foundTrack) return null;

  const isMidiClip = !!foundClip.midiData;
  const selectedClipIds = useUIStore.getState().selectedClipIds;
  const selectedActionClipIds = selectedClipIds.size > 0 && selectedClipIds.has(clipId)
    ? Array.from(selectedClipIds)
    : [clipId];

  // Check if consolidation is possible (2+ adjacent clips on same track)
  const trackClips = foundTrack.clips;
  const canConsolidate = selectedActionClipIds.length >= 2 && selectedActionClipIds.every(
    (id) => trackClips.some((c) => c.id === id),
  );

  const hasCustomColor = !!foundClip.color;

  return (
    <ClipContextMenuContainer
      x={x}
      y={y}
      clip={foundClip}
      track={foundTrack}
      isMidiClip={isMidiClip}
      canConsolidate={canConsolidate}
      hasCustomColor={hasCustomColor}
      selectedActionClipIds={selectedActionClipIds}
      onClose={onClose}
      onEditModalOpen={() => {
        onClose();
        // For text2music clips, open the generation panel
        if (foundClip!.generationParams?.type === 'text2music' || (foundClip!.source === 'generated' && foundTrack!.trackType === 'mix')) {
          const ui = useUIStore.getState();
          ui.setEditingText2MusicClipId(clipId);
          ui.openGenerationPanelView('textToMusic');
        }
        // For lego clips, set editingClipId (AddLayerModal will pick it up)
        else {
          useUIStore.getState().setEditingClip(clipId);
        }
      }}
    />
  );
}
