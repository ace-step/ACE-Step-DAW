/**
 * Canvas-based grid renderer for the timeline.
 * Replaces the DOM-div based grid with a single Canvas paint operation.
 */

export type GridStrength = 'bar' | 'beat' | 'eighth' | 'sub';

export interface GridLine {
  x: number;
  strength: GridStrength;
  outOfRange: boolean;
}

export interface BarShading {
  x: number;
  width: number;
}

export interface GridRenderParams {
  lines: GridLine[];
  barShading: BarShading[];
  totalWidth: number;
  height: number;
  isDashed: boolean;
  barShadingColor: string;
  colors: Record<GridStrength, string>;
}

/**
 * Draw the entire timeline grid (bar shading + grid lines) onto a canvas context.
 */
export function drawGrid(ctx: CanvasRenderingContext2D, params: GridRenderParams): void {
  const { lines, barShading, totalWidth, height, isDashed, barShadingColor, colors } = params;

  ctx.clearRect(0, 0, totalWidth, height);

  // Alternating bar shading
  ctx.fillStyle = barShadingColor;
  for (const shade of barShading) {
    ctx.fillRect(shade.x, 0, shade.width, height);
  }

  // Grid lines — single-pass bucket by strength for O(n) grouping
  const linesByStrength: Record<GridStrength, GridLine[]> = {
    sub: [],
    eighth: [],
    beat: [],
    bar: [],
  };
  for (const line of lines) {
    linesByStrength[line.strength].push(line);
  }

  const strengths: GridStrength[] = ['sub', 'eighth', 'beat', 'bar'];
  for (const strength of strengths) {
    const strengthLines = linesByStrength[strength];
    if (strengthLines.length === 0) continue;

    ctx.strokeStyle = colors[strength];
    ctx.lineWidth = strength === 'bar' ? 1 : 0.5;

    if (isDashed) {
      ctx.setLineDash([4, 4]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.beginPath();
    for (const line of strengthLines) {
      const alpha = line.outOfRange ? 0.3 : 1;
      if (alpha < 1) {
        // Flush current batch and draw this one with reduced alpha
        ctx.stroke();
        ctx.beginPath();
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.moveTo(line.x, 0);
        ctx.lineTo(line.x, height);
        ctx.stroke();
        ctx.restore();
        ctx.beginPath();
        continue;
      }
      ctx.moveTo(line.x, 0);
      ctx.lineTo(line.x, height);
    }
    ctx.stroke();
  }

  ctx.setLineDash([]);
}
