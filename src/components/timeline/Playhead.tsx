import { useTransportStore } from '../../store/transportStore';
import { useUIStore } from '../../store/uiStore';

export function Playhead() {
  const currentTime = useTransportStore((s) => s.currentTime);
  const isPlaying = useTransportStore((s) => s.isPlaying);
  const timelineFocused = useUIStore((s) => s.timelineFocused);
  const pixelsPerSecond = useUIStore((s) => s.pixelsPerSecond);
  const x = currentTime * pixelsPerSecond;

  // Blink only when stopped AND timeline has focus (after click-to-seek)
  const blinking = !isPlaying && timelineFocused;

  return (
    <div
      className="absolute top-0 w-px z-20 pointer-events-none"
      style={{
        left: x,
        minHeight: '100vh',
        backgroundColor: blinking ? undefined : '#ffffff',
        animation: blinking ? 'playhead-blink-line 1.2s ease-in-out infinite' : 'none',
      }}
    />
  );
}
