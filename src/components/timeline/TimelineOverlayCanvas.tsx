import { useRef, useEffect, useCallback } from 'react';

export interface DragOverlayRect {
  left: number;
  width: number;
  top: number;
  height: number;
}

interface TimelineOverlayCanvasProps {
  /** Live context-window drag rectangle (alt-drag). */
  ctxDragRect: DragOverlayRect | null;
  /** Live select-window drag rectangle (normal drag). */
  selDragRect: DragOverlayRect | null;
  /** Scroll offset for viewport anchoring. */
  scrollLeft: number;
  scrollTop: number;
}

// Colors matching the existing DOM-based overlays
const CTX_FILL = 'rgba(90, 200, 250, 0.10)';
const CTX_BORDER = 'rgba(90, 200, 250, 0.35)';
const CTX_EDGE = 'rgba(90, 200, 250, 0.7)';

const SEL_FILL = 'rgba(94, 89, 255, 0.10)';
const SEL_BORDER = 'rgba(94, 89, 255, 0.7)';

/**
 * Canvas overlay for drag selection rectangles.
 * Renders context-window and select-window drag previews
 * using a single full-viewport Canvas for better performance
 * compared to DOM-based overlays during rapid mouse movement.
 */
export function TimelineOverlayCanvas({
  ctxDragRect,
  selDragRect,
  scrollLeft,
  scrollTop,
}: TimelineOverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const cssWidth = canvas.clientWidth;
    const cssHeight = canvas.clientHeight;

    if (cssWidth <= 0 || cssHeight <= 0) return;

    // Update backing store if needed
    const bw = Math.round(cssWidth * dpr);
    const bh = Math.round(cssHeight * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);

    if (ctxDragRect) {
      drawDragRect(ctx, ctxDragRect, CTX_FILL, CTX_BORDER, CTX_EDGE);
    }

    if (selDragRect) {
      drawDragRect(ctx, selDragRect, SEL_FILL, SEL_BORDER, SEL_BORDER);
    }
  }, [ctxDragRect, selDragRect]);

  useEffect(() => {
    if (!ctxDragRect && !selDragRect) {
      // Nothing to draw — clear canvas
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      return;
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [ctxDragRect, selDragRect, draw, scrollLeft, scrollTop]);

  // Only render the canvas when there's something to draw
  if (!ctxDragRect && !selDragRect) return null;

  return (
    <canvas
      ref={canvasRef}
      data-testid="timeline-overlay-canvas"
      className="absolute inset-0 pointer-events-none z-10"
      style={{
        width: '100%',
        height: '100%',
      }}
    />
  );
}

function drawDragRect(
  ctx: CanvasRenderingContext2D,
  rect: DragOverlayRect,
  fillColor: string,
  borderColor: string,
  edgeColor: string,
): void {
  const { left, width, top, height } = rect;

  // Fill
  ctx.fillStyle = fillColor;
  ctx.fillRect(left, top, width, height);

  // Horizontal borders (top + bottom)
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left + width, top);
  ctx.moveTo(left, top + height);
  ctx.lineTo(left + width, top + height);
  ctx.stroke();

  // Vertical edges (left + right) — slightly brighter
  ctx.strokeStyle = edgeColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, top);
  ctx.lineTo(left, top + height);
  ctx.moveTo(left + width, top);
  ctx.lineTo(left + width, top + height);
  ctx.stroke();
}
