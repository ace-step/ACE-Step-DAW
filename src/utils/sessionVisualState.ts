/**
 * Pure helper functions for computing session visual state classes.
 * Extracted from SessionView.tsx to enable independent testing.
 */

export interface SceneVisualState {
  isDragTarget: boolean;
  isDragSource: boolean;
  isActive: boolean;
  isRecording: boolean;
  isQueued: boolean;
}

/** Compute the CSS class string for a scene header row. */
export function getSceneHeaderClass(state: SceneVisualState): string {
  if (state.isDragTarget) return 'border-blue-500 bg-blue-500/10';
  if (state.isDragSource) return 'opacity-40 border-[#333] bg-[#242424]';
  if (state.isActive && state.isRecording) return 'border-red-500/50 bg-red-500/10';
  if (state.isActive) return 'border-emerald-500/50 bg-emerald-500/10';
  if (state.isQueued) return 'border-amber-400/50 bg-amber-400/5';
  return 'border-[#333] bg-[#242424]';
}

/** Compute the CSS class string for a scene launch button. */
export function getSceneButtonClass(state: Pick<SceneVisualState, 'isActive' | 'isRecording' | 'isQueued'>): string {
  if (state.isActive && state.isRecording) return 'bg-red-600 text-white hover:bg-red-500';
  if (state.isActive) return 'bg-emerald-600 text-white hover:bg-emerald-500';
  if (state.isQueued) return 'bg-amber-600 text-white hover:bg-amber-500';
  return 'bg-[#303030] text-zinc-200 hover:bg-daw-accent';
}

/** Compute the scene launch button label text. */
export function getSceneButtonLabel(state: Pick<SceneVisualState, 'isActive' | 'isRecording' | 'isQueued'>): string {
  if (state.isActive && state.isRecording) return '● REC';
  if (state.isActive) return '▶ Playing';
  if (state.isQueued) return '◈ Queued';
  return 'Launch';
}

/** Compute the aria-label prefix for scene buttons. */
export function getSceneAriaPrefix(state: Pick<SceneVisualState, 'isActive' | 'isRecording' | 'isQueued'>): string {
  if (state.isActive && state.isRecording) return 'Recording';
  if (state.isActive) return 'Playing';
  if (state.isQueued) return 'Queued';
  return 'Launch';
}

/** Compute the SVG progress ring stroke color for a playing clip. */
export function getProgressRingStroke(isRecording: boolean): string {
  return isRecording ? '#ef4444' : '#4ade80';
}

/** Compute the loop count text class for a playing clip. */
export function getLoopCountClass(isRecording: boolean): string {
  return `text-xs ${isRecording ? 'text-red-400' : 'text-emerald-400'}`;
}
