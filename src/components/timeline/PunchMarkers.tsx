import { useTransportStore } from '../../store/transportStore';
import { useUIStore } from '../../store/uiStore';

const TRIANGLE_STYLE: React.CSSProperties = {
  width: 0,
  height: 0,
  borderLeft: '5px solid transparent',
  borderRight: '5px solid transparent',
  borderTop: '6px solid #ef4444',
};

function PunchMarker({ leftPx, label, testId }: { leftPx: number; label: string; testId: string }) {
  return (
    <div
      className="absolute top-0 h-full pointer-events-none"
      style={{ left: `${leftPx}px` }}
      data-testid={testId}
    >
      <div className="absolute -left-[5px] top-0" style={TRIANGLE_STYLE} />
      <span className="absolute left-1 top-[7px] text-[8px] font-bold text-red-400 whitespace-nowrap">
        {label}
      </span>
    </div>
  );
}

/**
 * Renders punch-in and punch-out markers on the timeline ruler.
 * Shows triangular markers and a semi-transparent region overlay
 * between punch-in and punch-out positions.
 */
export function PunchMarkers() {
  const punchEnabled = useTransportStore((s) => s.punchEnabled);
  const punchInTime = useTransportStore((s) => s.punchInTime);
  const punchOutTime = useTransportStore((s) => s.punchOutTime);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);

  if (!punchEnabled || punchInTime === null || punchOutTime === null) {
    return null;
  }

  const punchInPx = punchInTime * pixelsPerSecond;
  const punchOutPx = punchOutTime * pixelsPerSecond;
  const regionWidth = punchOutPx - punchInPx;

  return (
    <>
      {/* Punch region overlay */}
      {regionWidth > 0 && (
        <div
          className="absolute top-0 h-full pointer-events-none"
          style={{
            left: `${punchInPx}px`,
            width: `${regionWidth}px`,
            backgroundColor: 'rgba(239, 68, 68, 0.1)',
            borderLeft: '2px solid rgba(239, 68, 68, 0.6)',
            borderRight: '2px solid rgba(239, 68, 68, 0.6)',
          }}
          data-testid="punch-region"
        />
      )}

      <PunchMarker leftPx={punchInPx} label="IN" testId="punch-in-marker" />
      <PunchMarker leftPx={punchOutPx} label="OUT" testId="punch-out-marker" />
    </>
  );
}
