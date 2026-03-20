import { useTransportStore } from '../../store/transportStore';
import { useUIStore } from '../../store/uiStore';

export function Playhead() {
  const currentTime = useTransportStore((s) => s.currentTime);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const x = currentTime * pixelsPerSecond;

  const blinking = !isPlaying;

  return (
    <div
      className="absolute top-0 bottom-0 w-px z-20 pointer-events-none"
      style={{
        left: x,
        backgroundColor: blinking ? undefined : 'var(--color-daw-playhead)',
        animation: blinking ? 'playhead-blink-line 1s step-end infinite' : 'none',
      }}
    >
      <div
        className="absolute -top-0 -left-[4px] w-0 h-0 border-l-[5px] border-r-[5px] border-t-[6px] border-l-transparent border-r-transparent"
        style={{
          borderTopColor: blinking ? undefined : 'var(--color-daw-playhead)',
          animation: blinking ? 'playhead-blink-triangle 1s step-end infinite' : 'none',
        }}
      />
    </div>
  );
}
