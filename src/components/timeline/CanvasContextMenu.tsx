import { useState, useCallback } from 'react';
import {
  ContextMenuWrapper,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSubmenu,
  CONTEXT_MENU,
} from '../ui/ContextMenu';
import { useUIStore } from '../../store/uiStore';
import { useTransportStore } from '../../store/transportStore';
import { useProjectStore } from '../../store/projectStore';

interface CanvasContextMenuProps {
  x: number;
  y: number;
  onClose: () => void;
}

export function CanvasContextMenu({ x, y, onClose }: CanvasContextMenuProps) {
  const [showAISubmenu, setShowAISubmenu] = useState(false);

  const handleInspireMe = useCallback(() => {
    useUIStore.getState().setShowGenerationPanel(true);
    onClose();
  }, [onClose]);

  const handleAddLayer = useCallback(() => {
    useUIStore.getState().setAddLayerOpen(true);
    onClose();
  }, [onClose]);

  const handleMusicEnhancer = useCallback(() => {
    useUIStore.getState().setMusicEnhancerOpen(true);
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

  return (
    <ContextMenuWrapper x={x} y={y} onClose={onClose} minWidth={180} testId="canvas-context-menu">
      {/* AI Tools with hover submenu */}
      <div
        className="relative"
        onMouseEnter={() => setShowAISubmenu(true)}
        onMouseLeave={() => setShowAISubmenu(false)}
      >
        <button
          className="w-full text-left flex items-center justify-between cursor-pointer"
          style={{
            padding: '5px 12px',
            fontSize: CONTEXT_MENU.fontSize,
            border: 'none',
            background: showAISubmenu ? CONTEXT_MENU.hoverBg : 'transparent',
            color: showAISubmenu ? '#fff' : CONTEXT_MENU.textColor,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = CONTEXT_MENU.hoverBg;
            e.currentTarget.style.color = '#fff';
          }}
          onMouseLeave={(e) => {
            if (!showAISubmenu) {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = CONTEXT_MENU.textColor;
            }
          }}
        >
          <span>AI Tools</span>
          <span style={{ fontSize: 10, color: '#666', marginLeft: 12 }}>&#9654;</span>
        </button>

        {showAISubmenu && (
          <div className="absolute left-full top-0" style={{ marginLeft: -2 }}>
            <ContextMenuSubmenu>
              <ContextMenuItem label="Inspire Me" onClick={handleInspireMe} color="#a78bfa" />
              <ContextMenuItem label="Add a Layer" onClick={handleAddLayer} color="#67e8f9" />
              <ContextMenuItem label="Music Enhancer" onClick={handleMusicEnhancer} color="#6ee7b7" />
              <ContextMenuSeparator />
              <ContextMenuItem label="Voice Changer" onClick={() => {}} disabled />
              <ContextMenuItem label="Stem Splitter" onClick={() => {}} disabled />
              <ContextMenuItem label="Sound Effects" onClick={() => {}} disabled />
            </ContextMenuSubmenu>
          </div>
        )}
      </div>

      <ContextMenuSeparator />
      <ContextMenuItem label="Paste" onClick={() => onClose()} shortcut="⌘V" disabled />
      <ContextMenuItem label="Select All" onClick={handleSelectAll} shortcut="⌘A" />
      <ContextMenuSeparator />
      <ContextMenuItem label="Import" onClick={() => onClose()} disabled />
      <ContextMenuItem label="Loop Selection" onClick={handleLoopSelection} shortcut="⌘L" />
      <ContextMenuItem label="Grid & Snap" onClick={() => onClose()} disabled />
    </ContextMenuWrapper>
  );
}
