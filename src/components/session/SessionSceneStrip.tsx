import React, { useCallback, useState } from 'react';
import { useSessionStore } from '../../store/sessionStore';
import type { SessionScene } from '../../types/session';

interface SessionSceneStripProps {
  scene: SessionScene;
}

export const SessionSceneStrip = React.memo(function SessionSceneStrip({ scene }: SessionSceneStripProps) {
  const launchScene = useSessionStore((s) => s.launchScene);
  const stopScene = useSessionStore((s) => s.stopScene);
  const renameScene = useSessionStore((s) => s.renameScene);
  const slots = useSessionStore((s) => s.slots);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(scene.name);

  const sceneSlots = slots.filter((s) => s.sceneIndex === scene.index);
  const isPlaying = sceneSlots.some((s) => s.state === 'playing');

  const handleLaunch = useCallback(() => {
    if (isPlaying) {
      stopScene(scene.index);
    } else {
      launchScene(scene.index);
    }
  }, [scene.index, isPlaying, launchScene, stopScene]);

  const handleDoubleClick = useCallback(() => {
    setEditValue(scene.name);
    setEditing(true);
  }, [scene.name]);

  const handleBlur = useCallback(() => {
    setEditing(false);
    if (editValue.trim() && editValue !== scene.name) {
      renameScene(scene.id, editValue.trim());
    }
  }, [scene.id, scene.name, editValue, renameScene]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      (e.target as HTMLInputElement).blur();
    } else if (e.key === 'Escape') {
      setEditing(false);
      setEditValue(scene.name);
    }
  }, [scene.name]);

  return (
    <div
      className="flex items-center gap-1 h-12"
      data-testid={`session-scene-${scene.index}`}
    >
      <button
        className={`
          w-8 h-8 rounded flex items-center justify-center
          transition-colors duration-100
          ${isPlaying
            ? 'bg-green-600 hover:bg-green-500 text-white'
            : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-300'
          }
        `}
        onClick={handleLaunch}
        title={isPlaying ? `Stop ${scene.name}` : `Launch ${scene.name}`}
        aria-label={isPlaying ? `Stop ${scene.name}` : `Launch ${scene.name}`}
      >
        {isPlaying ? '■' : '▶'}
      </button>
      {editing ? (
        <input
          className="bg-zinc-800 text-xs text-zinc-200 px-1 py-0.5 rounded border border-zinc-600 w-16 outline-none focus:border-blue-500"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          autoFocus
        />
      ) : (
        <span
          className="text-xs text-zinc-400 cursor-default select-none truncate w-16"
          onDoubleClick={handleDoubleClick}
          title="Double-click to rename"
        >
          {scene.name}
        </span>
      )}
    </div>
  );
});
