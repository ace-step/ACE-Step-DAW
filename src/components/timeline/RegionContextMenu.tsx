import { ContextMenuWrapper, ContextMenuItem } from '../ui/ContextMenu';

interface RegionContextMenuProps {
  x: number;
  y: number;
  onRegenerateRegion: () => void;
  onClose: () => void;
  hasReadyClips: boolean;
}

export function RegionContextMenu({
  x,
  y,
  onRegenerateRegion,
  onClose,
  hasReadyClips,
}: RegionContextMenuProps) {
  return (
    <ContextMenuWrapper x={x} y={y} onClose={onClose} minWidth={200} testId="region-context-menu">
      <ContextMenuItem
        label="Regenerate Selected Region..."
        onClick={onRegenerateRegion}
        disabled={!hasReadyClips}
        color="#ddd6fe"
      />
    </ContextMenuWrapper>
  );
}
