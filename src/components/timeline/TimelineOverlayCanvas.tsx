import { useRef, useEffect, useCallback } from 'react';

interface DragRect {
  left: number;
  width: number;
  top: number;
  height: number;
}

interface TimelineOverlayCanvasProps {
  /** Context window drag rectangle */
  ctxDrag: DragRect | null;
  /** Selection drag rectangle */
  selDrag: DragRect | null;
  /** Scroll offset to correctly position the canvas viewport */
  scrollLeft: number;
  scrollTop: number;
  /** Visible viewport dimensions */
  viewportWidth: number;
  viewportHeight: number;
}

const CTX_DRAG_FILL = 'rgba(90, 200, 250, 0.12)';
const CTX_DRAG_BORDER_LR = 'rgba(90, 200, 250, 0.5)';
const CTX_DRAG_BORDER_TB = 'rgba(90, 200, 250, 0.3)';
const SEL_DRAG_FILL = 'rgba(94, 89, 255, 0.10)';
const SEL_DRAG_BORDER = 'rgba(94, 89, 255, 0.7)';

/**
 * Canvas-based overlay for timeline drag selection and context window.
 * Replaces two separate DOM <div> overlays with a single canvas for
 * smoother rendering during scroll/drag operations.
 */
export function TimelineOverlayCanvas({
  ctxDrag,
  selDrag,
  scrollLeft,
  scrollTop,
  viewportWidth,
  viewportHeight,
}: TimelineOverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = viewportWidth;
    const h = viewportHeight;
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);

    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width = bw;
      canvas.height = bh;
    }

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (!ctxDrag && !selDrag) return;

    // Draw context drag rectangle
    if (ctxDrag) {
      const x = ctxDrag.left - scrollLeft;
      const y = ctxDrag.top - scrollTop;
      ctx.fillStyle = CTX_DRAG_FILL;
      ctx.fillRect(x, y, ctxDrag.width, ctxDrag.height);

      // Border: left and right are stronger
      ctx.strokeStyle = CTX_DRAG_BORDER_LR;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + ctxDrag.height);
      ctx.moveTo(x + ctxDrag.width, y);
      ctx.lineTo(x + ctxDrag.width, y + ctxDrag.height);
      ctx.stroke();

      // Top and bottom borders are subtler
      ctx.strokeStyle = CTX_DRAG_BORDER_TB;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + ctxDrag.width, y);
      ctx.moveTo(x, y + ctxDrag.height);
      ctx.lineTo(x + ctxDrag.width, y + ctxDrag.height);
      ctx.stroke();
    }

    // Draw selection drag rectangle
    if (selDrag) {
      const x = selDrag.left - scrollLeft;
      const y = selDrag.top - scrollTop;
      ctx.fillStyle = SEL_DRAG_FILL;
      ctx.fillRect(x, y, selDrag.width, selDrag.height);

      ctx.strokeStyle = SEL_DRAG_BORDER;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, selDrag.width - 1, selDrag.height - 1);
    }
  }, [ctxDrag, selDrag, scrollLeft, scrollTop, viewportWidth, viewportHeight]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Only render when there's something to draw
  if (!ctxDrag && !selDrag) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 pointer-events-none z-10"
      style={{
        width: viewportWidth,
        height: viewportHeight,
        position: 'sticky',
        top: 0,
        left: 0,
      }}
      data-testid="timeline-overlay-canvas"
    />
  );
}
