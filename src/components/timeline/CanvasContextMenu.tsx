import { useCallback } from 'react';
import {
  ContextMenuWrapper,
  ContextMenuItem,
  ContextMenuSeparator,
} from '../ui/ContextMenu';
import { AIToolsSubmenu } from './AIToolsSubmenu';
import { useUIStore } from '../../store/uiStore';
import { useTransportStore } from '../../store/transportStore';
import { useProjectStore } from '../../store/projectStore';

interface CanvasContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
}

export function CanvasContextMenu({ x, y, onClose }: CanvasContextMenuProps) {
  const handleInspireMe = useCallback(() => {
    useUIStore.getState().setShowGenerationPanel(true);
    onClose();
  }, [onClose]);

  const handleAddLayer = useCallback(() => {
    useUIStore.getState().setAddLayerOpen(true);
    onClose();
  }, [onClose]);

  const handleMusicEnhancer = useCallback(() => {
    useUIStore.getState().openEnhancerFromSelection();
    onClose();
  }, [onClose]);

  const handleSelectAll = useCallback(() => {
    const project = useProjectStore.getState().project;
    if (project) {
      const allClipIds = project.tracks.flatMap((t) => t.clips.map((c) => c.id));
      useUIStore.getState().selectClips(allClipIds);
    }
    onClose();
  }, [onClose]);

  const handleLoopSelection = useCallback(() => {
    const selectWindow = useUIStore.getState().selectWindow;
    if (selectWindow) {
      useTransportStore.getState().setLoopRegion(selectWindow.startTime, selectWindow.endTime);
      if (!useTransportStore.getState().loopEnabled) {
        useTransportStore.getState().toggleLoop();
      }
    }
    onClose();
  }, [onClose]);

  const handleSplitAll = useCallback(() => {
    useProjectStore.getState().splitAllAtPlayhead(useTransportStore.getState().currentTime);
    onClose();
  }, [onClose]);

  const selectWindow = useUIStore((s) => s.selectWindow);

  const handleInsertTime = useCallback(() => {
    const sw = useUIStore.getState().selectWindow;
    if (sw) {
      useProjectStore.getState().insertTime(sw.startTime, sw.endTime - sw.startTime);
      useUIStore.getState().setSelectWindow(null);
    }
    onClose();
  }, [onClose]);

  const handleDeleteTime = useCallback(() => {
    const sw = useUIStore.getState().selectWindow;
    if (sw) {
      useProjectStore.getState().deleteTimeRange(sw.startTime, sw.endTime);
      useUIStore.getState().setSelectWindow(null);
    }
    onClose();
  }, [onClose]);

  const handleDuplicateSection = useCallback(() => {
    const sw = useUIStore.getState().selectWindow;
    if (sw) {
      useProjectStore.getState().duplicateTimeRange(sw.startTime, sw.endTime);
      useUIStore.getState().setSelectWindow(null);
    }
    onClose();
  }, [onClose]);

  return (
    <ContextMenuWrapper x={x} y={y} onClose={onClose} minWidth={180} testId="canvas-context-menu">
      <AIToolsSubmenu
        onInspireMe={handleInspireMe}
        onAddLayer={handleAddLayer}
        onMusicEnhancer={handleMusicEnhancer}
      />
      <ContextMenuSeparator />
      <ContextMenuItem label="Paste" onClick={() => onClose()} shortcut="⌘V" disabled />
      <ContextMenuItem label="Select All" onClick={handleSelectAll} shortcut="⌘A" />
      <ContextMenuSeparator />
      <ContextMenuItem label="Split All at Playhead" onClick={handleSplitAll} shortcut="⌘⇧S" />
      {selectWindow && (
        <>
          <ContextMenuItem label="Insert Time" onClick={handleInsertTime} shortcut="⌘I" />
          <ContextMenuItem label="Delete Time (Ripple)" onClick={handleDeleteTime} shortcut="⌘⇧⌫" />
          <ContextMenuItem label="Duplicate Section" onClick={handleDuplicateSection} shortcut="⌘⇧D" />
        </>
      )}
      <ContextMenuSeparator />
      <ContextMenuItem label="Import" onClick={() => onClose()} disabled />
      <ContextMenuItem label="Loop Selection" onClick={handleLoopSelection} shortcut="⌘L" />
      <ContextMenuItem label="Grid & Snap" onClick={() => onClose()} disabled />
    </ContextMenuWrapper>
  );
}
