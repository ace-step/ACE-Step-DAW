import { useCallback, useRef } from 'react';
import type { GainEnvelopePoint } from '../../types/project';
import { useProjectStore } from '../../store/projectStore';

interface ClipGainEnvelopeProps {
  clipId: string;
  clipDuration: number;
  width: number;
  gainEnvelope: GainEnvelopePoint[];
  color: string;
}

const POINT_RADIUS = 4;
const MAX_GAIN = 2;

export function ClipGainEnvelope({
  clipId,
  clipDuration,
  width,
  gainEnvelope,
  color,
}: ClipGainEnvelopeProps) {
  const addClipGainPoint = useProjectStore((s) => s.addClipGainPoint);
  const removeClipGainPoint = useProjectStore((s) => s.removeClipGainPoint);
  const updateClipGainPoint = useProjectStore((s) => s.updateClipGainPoint);
  const beginDrag = useProjectStore((s) => s.beginDrag);
  const endDrag = useProjectStore((s) => s.endDrag);
  const svgRef = useRef<SVGSVGElement>(null);

  const timeToX = useCallback((time: number) => (time / clipDuration) * width, [clipDuration, width]);
  const gainToY = useCallback((gain: number) => (1 - gain / MAX_GAIN) * 100, []);
  const xToTime = useCallback((x: number) => Math.max(0, Math.min(clipDuration, (x / width) * clipDuration)), [clipDuration, width]);
  const yToGain = useCallback((y: number, height: number) => Math.max(0, Math.min(MAX_GAIN, (1 - y / height) * MAX_GAIN)), []);

  const handleSvgDoubleClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const time = xToTime(x);
    const gain = yToGain(y, rect.height);
    addClipGainPoint(clipId, { time, gain: Math.round(gain * 100) / 100 });
  }, [clipId, xToTime, yToGain, addClipGainPoint]);

  const handlePointMouseDown = useCallback((e: React.MouseEvent, pointIndex: number) => {
    e.stopPropagation();
    e.preventDefault();

    if (e.altKey) {
      removeClipGainPoint(clipId, pointIndex);
      return;
    }

    const svg = svgRef.current;
    if (!svg) return;

    beginDrag();
    const rect = svg.getBoundingClientRect();

    const onMouseMove = (ev: MouseEvent) => {
      const x = ev.clientX - rect.left;
      const y = ev.clientY - rect.top;
      const time = xToTime(x);
      const gain = yToGain(y, rect.height);
      updateClipGainPoint(clipId, pointIndex, {
        time: Math.round(time * 1000) / 1000,
        gain: Math.round(gain * 100) / 100,
      });
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      endDrag();
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [clipId, xToTime, yToGain, updateClipGainPoint, removeClipGainPoint, beginDrag, endDrag]);

  if (gainEnvelope.length === 0) return null;

  // Build SVG path
  const sorted = [...gainEnvelope].sort((a, b) => a.time - b.time);
  const viewBox = `0 0 ${width} 100`;

  // Build polyline points
  const pathPoints: string[] = [];
  pathPoints.push(`0,${gainToY(sorted[0].gain)}`);
  for (const pt of sorted) {
    pathPoints.push(`${timeToX(pt.time)},${gainToY(pt.gain)}`);
  }
  pathPoints.push(`${width},${gainToY(sorted[sorted.length - 1].gain)}`);

  // Fill area
  const fillPath = `M0,${gainToY(sorted[0].gain)} ${sorted.map(pt => `L${timeToX(pt.time)},${gainToY(pt.gain)}`).join(' ')} L${width},${gainToY(sorted[sorted.length - 1].gain)} L${width},100 L0,100 Z`;

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 z-[5] pointer-events-auto"
      viewBox={viewBox}
      preserveAspectRatio="none"
      onDoubleClick={handleSvgDoubleClick}
      data-testid={`gain-envelope-${clipId}`}
    >
      <path d={fillPath} fill={color} opacity={0.08} />

      <polyline
        points={pathPoints.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        opacity={0.7}
        vectorEffect="non-scaling-stroke"
      />

      <line
        x1={0}
        y1={gainToY(1)}
        x2={width}
        y2={gainToY(1)}
        stroke="white"
        strokeWidth="0.5"
        opacity={0.2}
        strokeDasharray="4 4"
        vectorEffect="non-scaling-stroke"
      />

      {sorted.map((pt, i) => (
        <circle
          key={i}
          cx={timeToX(pt.time)}
          cy={gainToY(pt.gain)}
          r={POINT_RADIUS}
          fill="white"
          stroke={color}
          strokeWidth="1.5"
          opacity={0.9}
          className="cursor-grab hover:opacity-100"
          style={{ pointerEvents: 'auto' }}
          vectorEffect="non-scaling-stroke"
          onMouseDown={(e) => handlePointMouseDown(e, i)}
          data-testid={`gain-point-${i}`}
        />
      ))}
    </svg>
  );
}
