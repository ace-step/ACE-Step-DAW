import { useEffect, useRef, useMemo } from 'react';

type LfoShape = 'sine' | 'triangle' | 'square' | 'sawtooth';

interface LfoWaveformPreviewProps {
  shape: LfoShape;
  rate: number;
  depth: number;
  color: string;
  width?: number;
  height?: number;
}

/** Generate a static SVG path for one cycle of the given LFO shape. */
function generateWaveformPath(
  shape: LfoShape,
  width: number,
  height: number,
  depth: number,
): string {
  const steps = 60;
  const midY = height / 2;
  const amplitude = (height / 2 - 1) * Math.max(0, Math.min(1, depth));
  const points: string[] = [];

  for (let i = 0; i <= steps; i++) {
    const t = i / steps; // 0..1 = one full cycle
    const x = t * width;
    let y: number;

    switch (shape) {
      case 'sine':
        y = midY - amplitude * Math.sin(t * Math.PI * 2);
        break;
      case 'triangle':
        // Triangle: rises to peak at 0.25, falls to trough at 0.75
        if (t < 0.25) y = midY - amplitude * (t * 4);
        else if (t < 0.75) y = midY - amplitude * (1 - (t - 0.25) * 4);
        else y = midY - amplitude * (-1 + (t - 0.75) * 4);
        break;
      case 'square':
        y = midY - amplitude * (t < 0.5 ? 1 : -1);
        break;
      case 'sawtooth':
        y = midY - amplitude * (1 - 2 * t);
        break;
    }

    points.push(`${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`);
  }

  return points.join(' ');
}

export function LfoWaveformPreview({
  shape,
  rate,
  depth,
  color,
  width = 48,
  height = 20,
}: LfoWaveformPreviewProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const animRef = useRef<number>(0);
  const offsetRef = useRef(0);

  const pathD = useMemo(
    () => generateWaveformPath(shape, width, height, depth),
    [shape, width, height, depth],
  );

  // Animate the waveform by shifting it horizontally based on rate
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || rate <= 0) return;

    let lastTime = performance.now();
    offsetRef.current = 0;

    const animate = (now: number) => {
      const dt = (now - lastTime) / 1000;
      lastTime = now;
      offsetRef.current = (offsetRef.current + dt * rate) % 1;

      const pathEl = svg.querySelector('path');
      if (pathEl) {
        const shift = -offsetRef.current * width;
        pathEl.setAttribute('transform', `translate(${shift.toFixed(1)}, 0)`);
      }
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [rate, width]);

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="shrink-0 opacity-70"
      aria-label="LFO waveform preview"
      style={{ overflow: 'hidden' }}
    >
      {/* Render two copies for seamless scrolling */}
      <g>
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Second copy offset by width for seamless looping */}
        <path
          d={pathD}
          fill="none"
          stroke={color}
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          transform={`translate(${width}, 0)`}
        />
      </g>
    </svg>
  );
}
