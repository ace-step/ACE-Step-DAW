import { useUIStore } from '../store/uiStore';

/**
 * Convert a viewport clientX to a pixel offset within the timeline lane area,
 * correctly accounting for CSS Grid sticky layout and horizontal scroll.
 * Uses the scroll container (not the lane element) to avoid getBoundingClientRect
 * inaccuracies with sticky grid siblings.
 */
export function clientXToLaneX(clientX: number): number {
  const scrollContainer = document.getElementById('arrangement-timeline-scroll');
  if (!scrollContainer) return 0;
  const containerRect = scrollContainer.getBoundingClientRect();
  const trackListW = useUIStore.getState().trackListWidth;
  return clientX - containerRect.left - trackListW + scrollContainer.scrollLeft;
}
