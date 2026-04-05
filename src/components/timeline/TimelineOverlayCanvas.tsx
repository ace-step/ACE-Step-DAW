import { useRef, useEffect, useCallback } from 'react';

interface SelectionRect {
  left: number;
  width: number;
  top: number;
  height: number;
}

interface TimelineOverlayCanvasProps {
  width: number;
  height: number;
  ctxDrag: SelectionRect | null;
  selDrag: SelectionRect | null;
}

/**
 * Canvas-based overlay for selection rectangles during drag operations.
 * Avoids DOM reflow during rapid mouse movements for smoother selection.
 */
export function TimelineOverlayCanvas({
  width,
  height,
  ctxDrag,
  selDrag,
}: TimelineOverlayCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    // Context drag overlay (blue tint)
    if (ctxDrag) {
      ctx.fillStyle = 'rgba(90, 200, 250, 0.12)';
      ctx.fillRect(ctxDrag.left, ctxDrag.top, ctxDrag.width, ctxDrag.height);

      ctx.strokeStyle = 'rgba(90, 200, 250, 0.5)';
      ctx.lineWidth = 1;
      // Left and right borders (stronger)
      ctx.beginPath();
      ctx.moveTo(ctxDrag.left, ctxDrag.top);
      ctx.lineTo(ctxDrag.left, ctxDrag.top + ctxDrag.height);
      ctx.moveTo(ctxDrag.left + ctxDrag.width, ctxDrag.top);
      ctx.lineTo(ctxDrag.left + ctxDrag.width, ctxDrag.top + ctxDrag.height);
      ctx.stroke();

      // Top and bottom borders (lighter)
      ctx.strokeStyle = 'rgba(90, 200, 250, 0.3)';
      ctx.beginPath();
      ctx.moveTo(ctxDrag.left, ctxDrag.top);
      ctx.lineTo(ctxDrag.left + ctxDrag.width, ctxDrag.top);
      ctx.moveTo(ctxDrag.left, ctxDrag.top + ctxDrag.height);
      ctx.lineTo(ctxDrag.left + ctxDrag.width, ctxDrag.top + ctxDrag.height);
      ctx.stroke();
    }

    // Selection drag overlay (accent-tinted)
    if (selDrag) {
      ctx.fillStyle = 'rgba(94, 89, 255, 0.10)';
      ctx.beginPath();
      ctx.roundRect(selDrag.left, selDrag.top, selDrag.width, selDrag.height, 1);
      ctx.fill();

      ctx.strokeStyle = 'rgba(94, 89, 255, 0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(selDrag.left, selDrag.top, selDrag.width, selDrag.height, 1);
      ctx.stroke();
    }
  }, [width, height, ctxDrag, selDrag]);

  useEffect(() => {
    draw();
  }, [draw]);

  if (!ctxDrag && !selDrag) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute top-0 left-0 pointer-events-none z-10"
      style={{ width, height }}
      data-testid="timeline-overlay-canvas"
    />
  );
}
