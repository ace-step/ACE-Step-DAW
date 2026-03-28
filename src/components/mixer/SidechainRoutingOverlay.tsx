import { useEffect, useState, type RefObject } from 'react';
import { useProjectStore } from '../../store/projectStore';
import { getSidechainRoutes } from '../../utils/sidechainRouting';
import type { Track } from '../../types/project';

const EMPTY_TRACKS: Track[] = [];

interface RoutePosition {
  sourceX: number;
  targetX: number;
  effectId: string;
  sourceTrackId: string;
  targetTrackId: string;
}

/**
 * SVG overlay that draws dashed-line arrows in the mixer panel
 * from sidechain source tracks to the compressor on target tracks.
 */
export function SidechainRoutingOverlay({
  containerRef,
}: {
  containerRef: RefObject<HTMLElement | null>;
}) {
  const tracks = useProjectStore((s) => s.project?.tracks ?? EMPTY_TRACKS);
  const routes = getSidechainRoutes(tracks);
  const [positions, setPositions] = useState<RoutePosition[]>([]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || routes.length === 0) {
      setPositions([]);
      return;
    }

    const computePositions = () => {
      const containerRect = container.getBoundingClientRect();
      setContainerSize({ width: containerRect.width, height: containerRect.height });

      const newPositions: RoutePosition[] = [];
      for (const route of routes) {
        const sourceEl = container.querySelector(`[data-track-id="${route.sourceTrackId}"]`);
        const targetEl = container.querySelector(`[data-track-id="${route.targetTrackId}"]`);
        if (!sourceEl || !targetEl) continue;

        const sourceRect = sourceEl.getBoundingClientRect();
        const targetRect = targetEl.getBoundingClientRect();

        newPositions.push({
          sourceX: sourceRect.left + sourceRect.width / 2 - containerRect.left,
          targetX: targetRect.left + targetRect.width / 2 - containerRect.left,
          effectId: route.effectId,
          sourceTrackId: route.sourceTrackId,
          targetTrackId: route.targetTrackId,
        });
      }
      setPositions(newPositions);
    };

    computePositions();

    // Recompute on resize
    const observer = new ResizeObserver(computePositions);
    observer.observe(container);

    return () => observer.disconnect();
  }, [containerRef, routes.length, tracks.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const ARROW_Y = 28;
  const CURVE_HEIGHT = 18;

  return (
    <svg
      data-testid="sidechain-routing-overlay"
      className="absolute inset-0 pointer-events-none"
      style={{ width: containerSize.width || '100%', height: ARROW_Y + CURVE_HEIGHT + 8 }}
      aria-hidden="true"
    >
      <defs>
        <marker
          id="sc-arrowhead"
          markerWidth="6"
          markerHeight="4"
          refX="5"
          refY="2"
          orient="auto"
        >
          <polygon points="0 0, 6 2, 0 4" fill="#f59e0b" opacity="0.7" />
        </marker>
      </defs>

      {routes.map((route) => {
        const pos = positions.find(
          (p) => p.sourceTrackId === route.sourceTrackId && p.targetTrackId === route.targetTrackId && p.effectId === route.effectId,
        );

        // When no DOM positions are available (e.g., in tests with no layout),
        // still render the group so data-testid is queryable.
        const sourceX = pos?.sourceX ?? 0;
        const targetX = pos?.targetX ?? 0;
        const midX = (sourceX + targetX) / 2;

        return (
          <g
            key={`${route.sourceTrackId}-${route.targetTrackId}-${route.effectId}`}
            data-testid={`sidechain-route-${route.sourceTrackId}-${route.targetTrackId}`}
          >
            {pos && (
              <>
                {/* Dashed curve from source to target */}
                <path
                  d={`M ${sourceX} ${ARROW_Y} Q ${midX} ${ARROW_Y - CURVE_HEIGHT} ${targetX} ${ARROW_Y}`}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                  strokeDasharray="4 3"
                  opacity="0.6"
                  markerEnd="url(#sc-arrowhead)"
                />
                {/* Source dot */}
                <circle cx={sourceX} cy={ARROW_Y} r="3" fill="#f59e0b" opacity="0.7" />
                {/* SC label at midpoint */}
                <text
                  x={midX}
                  y={ARROW_Y - CURVE_HEIGHT - 2}
                  textAnchor="middle"
                  fill="#f59e0b"
                  fontSize="8"
                  fontWeight="600"
                  opacity="0.7"
                >
                  SC
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}
