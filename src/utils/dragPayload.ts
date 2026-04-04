/**
 * Module-level drag payload for communicating drag metadata between
 * drag source (LoopBrowser) and drop target (TrackLane).
 *
 * We can't use e.dataTransfer.getData() during dragover (browser security),
 * so we store the payload here when drag starts and read it during dragover.
 */

export interface DragPayload {
  type: 'loop' | 'asset' | 'file' | 'videoFile';
  /** Duration of the dragged item in seconds (if known). */
  duration?: number;
  /** Display name for the ghost preview. */
  name?: string;
}

let currentPayload: DragPayload | null = null;

export function setDragPayload(payload: DragPayload): void {
  currentPayload = payload;
}

export function getDragPayload(): DragPayload | null {
  return currentPayload;
}

export function clearDragPayload(): void {
  currentPayload = null;
}
