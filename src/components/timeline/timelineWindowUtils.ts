export interface TimelineWindowRange {
  startTime: number;
  endTime: number;
  trackIds: string[];
}

export interface TimelineWindowPair {
  selectWindow: TimelineWindowRange | null;
  contextWindow: TimelineWindowRange | null;
}

export function cloneTimelineWindow(windowRange: TimelineWindowRange): TimelineWindowRange {
  return {
    ...windowRange,
    trackIds: [...windowRange.trackIds],
  };
}

export function getTimelineWindowDuration(windowRange: TimelineWindowRange): number {
  return Math.max(0, windowRange.endTime - windowRange.startTime);
}

export function clampTimelineWindowStart(
  startTime: number,
  duration: number,
  totalDuration: number,
): number {
  const safeDuration = Math.max(0, duration);
  const safeTotalDuration = Math.max(0, totalDuration);
  const maxStart = Math.max(0, safeTotalDuration - safeDuration);
  return Math.min(Math.max(0, startTime), maxStart);
}

export function moveTimelineWindow(
  windowRange: TimelineWindowRange,
  desiredStartTime: number,
  totalDuration: number,
): TimelineWindowRange {
  const duration = getTimelineWindowDuration(windowRange);
  const nextStartTime = clampTimelineWindowStart(desiredStartTime, duration, totalDuration);

  return {
    ...windowRange,
    startTime: nextStartTime,
    endTime: nextStartTime + duration,
  };
}

export function convertTimelineWindowMode(
  sourceKind: 'select' | 'context',
  windows: TimelineWindowPair,
): TimelineWindowPair {
  if (sourceKind === 'select') {
    return {
      selectWindow: null,
      contextWindow: windows.selectWindow ? cloneTimelineWindow(windows.selectWindow) : null,
    };
  }

  return {
    selectWindow: windows.contextWindow ? cloneTimelineWindow(windows.contextWindow) : null,
    contextWindow: null,
  };
}
