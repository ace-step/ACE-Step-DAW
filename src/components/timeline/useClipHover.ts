import { useCallback, useState } from 'react';
import { CURSOR_BRACKET_LEFT, CURSOR_BRACKET_RIGHT } from '../../utils/bracketCursor';
import { EDGE_HANDLE_PX, HEADER_RAIL_HEIGHT_PX } from './useClipDrag';

export function useClipHover(clipBlockRef: React.RefObject<HTMLDivElement | null>) {
  const [hoveredResizeEdge, setHoveredResizeEdge] = useState<'left' | 'right' | null>(null);
  const [hoverSeekX, setHoverSeekX] = useState<number | null>(null);
  const [isPointerInside, setIsPointerInside] = useState(false);

  const setResizeCursor = useCallback((cursor: 'w-resize' | 'e-resize' | null) => {
    const nextCursor = cursor === 'w-resize' ? CURSOR_BRACKET_LEFT
      : cursor === 'e-resize' ? CURSOR_BRACKET_RIGHT
      : '';
    if (clipBlockRef.current) {
      clipBlockRef.current.style.cursor = nextCursor;
    }
    document.body.style.cursor = nextCursor;
    document.documentElement.style.cursor = nextCursor;
  }, [clipBlockRef]);

  const syncHoverState = useCallback((clientX: number, clientY: number, altKey: boolean, currentTarget: HTMLElement) => {
    const rect = currentTarget.getBoundingClientRect();
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    const inHeaderRail = relY <= HEADER_RAIL_HEIGHT_PX;
    const atEdge = relX <= EDGE_HANDLE_PX || relX >= rect.width - EDGE_HANDLE_PX;

    if (inHeaderRail && atEdge) {
      const edge = relX <= EDGE_HANDLE_PX ? 'left' : 'right';
      const cursor = edge === 'left' ? 'w-resize' : 'e-resize';
      const bracketCursor = edge === 'left' ? CURSOR_BRACKET_LEFT : CURSOR_BRACKET_RIGHT;
      setHoveredResizeEdge(edge);
      setHoverSeekX(null);
      setResizeCursor(cursor);
      currentTarget.style.cursor = bracketCursor;
    } else {
      setHoveredResizeEdge(null);
      setResizeCursor(null);
      if (inHeaderRail) {
        setHoverSeekX(null);
        currentTarget.style.cursor = altKey ? 'ew-resize' : 'grab';
      } else {
        setHoverSeekX(relX);
        currentTarget.style.cursor = '';
      }
    }
  }, [setResizeCursor]);

  const handleMouseEnter = useCallback((e: React.MouseEvent) => {
    setIsPointerInside(true);
    syncHoverState(e.clientX, e.clientY, e.altKey, e.currentTarget as HTMLElement);
  }, [syncHoverState]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPointerInside) setIsPointerInside(true);
    syncHoverState(e.clientX, e.clientY, e.altKey, e.currentTarget as HTMLElement);
  }, [syncHoverState, isPointerInside]);

  const handleMouseLeave = useCallback((e: React.MouseEvent) => {
    const el = e.currentTarget as HTMLElement;
    setIsPointerInside(false);
    setHoveredResizeEdge(null);
    setHoverSeekX(null);
    el.style.cursor = '';
    setResizeCursor(null);
  }, [setResizeCursor]);

  const handleResizeHandleEnter = useCallback((edge: 'left' | 'right') => () => {
    setHoveredResizeEdge(edge);
    setResizeCursor(edge === 'left' ? 'w-resize' : 'e-resize');
  }, [setResizeCursor]);

  const handleResizeHandleLeave = useCallback(() => {
    setHoveredResizeEdge(null);
    setResizeCursor(null);
  }, [setResizeCursor]);

  return {
    hoveredResizeEdge,
    hoverSeekX,
    isPointerInside,
    handleMouseEnter,
    handleMouseMove,
    handleMouseLeave,
    handleResizeHandleEnter,
    handleResizeHandleLeave,
  };
}
